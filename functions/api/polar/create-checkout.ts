import { json, readBearerToken, resolveUserFromBearer } from "../../lib/authAndCredits";

type Env = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_SERVER?: string;
  POLAR_PRODUCT_ID?: string;
  POLAR_SUCCESS_URL?: string;
};

function getPolarBaseUrl(serverRaw: string) {
  const server = String(serverRaw || "").trim().toLowerCase();
  return server === "sandbox" ? "https://sandbox-api.polar.sh/v1" : "https://api.polar.sh/v1";
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const bearer = readBearerToken(context.request);
  if (!bearer) return json({ error: "Unauthorized" }, 401);

  const accessToken = String(context.env.POLAR_ACCESS_TOKEN ?? "").trim();
  const productId =
    String(context.env.POLAR_PRODUCT_ID ?? "").trim() || "a8ab138c-eaf9-4a40-8e5c-d75a85f32577";
  if (!accessToken) {
    return json(
      { error: "Missing POLAR_ACCESS_TOKEN. Set it as a Cloudflare Pages Secret." },
      500,
    );
  }

  let user: Awaited<ReturnType<typeof resolveUserFromBearer>>;
  try {
    user = await resolveUserFromBearer(context.env, bearer);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unauthorized" }, 401);
  }

  const origin = new URL(context.request.url).origin;
  const successUrl =
    String(context.env.POLAR_SUCCESS_URL ?? "").trim() || `${origin}/#/generate?checkout=success`;
  const baseUrl = getPolarBaseUrl(String(context.env.POLAR_SERVER ?? ""));

  const payload = {
    products: [productId],
    external_customer_id: user.id,
    customer_email: user.email,
    customer_name: user.fullName,
    success_url: successUrl,
    metadata: {
      source: "lifereels-web",
      credit_pack: "starter_3",
      app_user_id: user.id,
    },
  };

  const r = await fetch(`${baseUrl}/checkouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await r.text();
  if (!r.ok) {
    return json({ error: `Polar checkout creation failed: ${r.status} ${raw}` }, 502);
  }

  let data: { url?: string; id?: string } | null = null;
  try {
    data = JSON.parse(raw) as { url?: string; id?: string };
  } catch {
    // no-op
  }

  const url = String(data?.url ?? "").trim();
  if (!url) {
    return json({ error: "Polar checkout response missing url." }, 502);
  }

  return json({ url, checkoutId: data?.id || undefined });
};

