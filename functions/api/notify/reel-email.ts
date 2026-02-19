type Env = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

type Body = {
  jobId?: string;
  outputUrl?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function resolveUserEmail(env: Env, authHeader: string) {
  const supabaseUrl = String(env.VITE_SUPABASE_URL ?? "").trim();
  const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  }

  const r = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: authHeader,
    },
  });
  const raw = await r.text();
  if (!r.ok) {
    throw new Error(`Failed to resolve auth user: ${r.status} ${raw}`);
  }
  const data = JSON.parse(raw) as { email?: string };
  const email = String(data.email ?? "").trim();
  if (!email) throw new Error("Authenticated user email is missing.");
  return email;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const resendApiKey = String(context.env.RESEND_API_KEY ?? "").trim();
  const emailFrom = String(context.env.EMAIL_FROM ?? "").trim();
  if (!resendApiKey || !emailFrom) {
    return json(
      {
        error:
          "Missing RESEND_API_KEY or EMAIL_FROM. Add both as Cloudflare Pages Secrets.",
      },
      500,
    );
  }

  const authHeader = String(context.request.headers.get("authorization") ?? "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Body;
  try {
    body = (await context.request.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const outputUrl = String(body.outputUrl ?? "").trim();
  const jobId = String(body.jobId ?? "").trim();
  if (!outputUrl) {
    return json({ error: "Missing outputUrl." }, 400);
  }

  let userEmail = "";
  try {
    userEmail = await resolveUserEmail(context.env, authHeader);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unauthorized" }, 401);
  }

  const subject = "Your Life Reels video is ready";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#222">
      <h2 style="margin:0 0 12px">Your reel is complete.</h2>
      <p style="margin:0 0 12px">Click the link below to view or download your video.</p>
      <p style="margin:0 0 12px">
        <a href="${outputUrl}" target="_blank" rel="noreferrer" style="color:#c88c10;font-weight:700">Open your video</a>
      </p>
      ${jobId ? `<p style="margin:0;color:#666;font-size:12px">Job ID: ${jobId}</p>` : ""}
    </div>
  `.trim();

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [userEmail],
      subject,
      html,
    }),
  });

  const raw = await resendResp.text();
  if (!resendResp.ok) {
    return json({ error: `Resend failed: ${resendResp.status} ${raw}` }, 502);
  }

  let emailId = "";
  try {
    const parsed = JSON.parse(raw) as { id?: string };
    emailId = String(parsed.id ?? "");
  } catch {
    // no-op
  }

  return json({ ok: true, sentTo: userEmail, id: emailId || undefined });
};

