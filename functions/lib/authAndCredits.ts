export type AuthEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type AuthUser = {
  id: string;
  email?: string;
  fullName?: string;
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function readBearerToken(req: Request) {
  const authHeader = String(req.headers.get("authorization") ?? "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

export async function resolveUserFromBearer(env: AuthEnv, token: string): Promise<AuthUser> {
  const supabaseUrl = String(env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "").trim();
  const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? "").trim();
  const serviceRole = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl) {
    throw new Error("Missing VITE_SUPABASE_URL.");
  }
  if (!token) throw new Error("Missing bearer token.");

  const userUrl = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`;
  const attempts: Array<Record<string, string>> = [];
  if (supabaseAnonKey) {
    attempts.push({
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    });
  }
  attempts.push({
    Authorization: `Bearer ${token}`,
  });
  if (serviceRole) {
    attempts.push({
      apikey: serviceRole,
      Authorization: `Bearer ${token}`,
    });
  }

  let raw = "";
  let status = 0;
  let ok = false;
  for (const headers of attempts) {
    const r = await fetch(userUrl, {
      method: "GET",
      headers,
    });
    raw = await r.text();
    status = r.status;
    ok = r.ok;
    if (ok) break;
  }
  if (!ok) throw new Error(`Unauthorized: ${status} ${raw}`);

  const user = JSON.parse(raw) as {
    id?: string;
    email?: string;
    user_metadata?: { full_name?: string; name?: string };
  };
  const id = String(user.id ?? "").trim();
  if (!id) throw new Error("Authenticated user id missing.");

  return {
    id,
    email: String(user.email ?? "").trim() || undefined,
    fullName:
      String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim() || undefined,
  };
}

export async function getCredits(env: AuthEnv, userId: string) {
  const supabaseUrl = String(env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "").trim();
  const serviceRole = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  // Ensure row exists
  await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/user_credits`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([{ user_id: userId, balance: 0 }]),
  });

  const r = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=balance&limit=1`,
    {
      method: "GET",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    },
  );
  const raw = await r.text();
  if (!r.ok) throw new Error(`Failed to fetch credits: ${r.status} ${raw}`);

  const arr = JSON.parse(raw) as Array<{ balance?: number }>;
  const n = Number(arr?.[0]?.balance ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function setCredits(env: AuthEnv, userId: string, value: number) {
  const current = await getCredits(env, userId);
  const delta = Math.max(0, Math.floor(value)) - current;
  const result = await applyCreditDelta(env, userId, delta, "admin_set");
  return result.balance;
}

export async function addCredits(env: AuthEnv, userId: string, delta: number) {
  const result = await applyCreditDelta(env, userId, Math.floor(delta), "purchase_credit");
  return result.balance;
}

export async function applyCreditDelta(
  env: AuthEnv,
  userId: string,
  delta: number,
  reason: string,
  options?: {
    jobId?: string;
    externalRef?: string;
  },
) {
  const supabaseUrl = String(env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "").trim();
  const serviceRole = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const r = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/apply_credit_delta`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_delta: Math.floor(delta),
      p_reason: String(reason || "adjust"),
      p_job_id: options?.jobId ?? null,
      p_external_ref: options?.externalRef ?? null,
    }),
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`Failed to apply credit delta: ${r.status} ${raw}`);
  const row = JSON.parse(raw) as { applied?: boolean; balance?: number };
  return {
    applied: Boolean(row.applied),
    balance: Math.max(0, Number(row.balance ?? 0) || 0),
  };
}
