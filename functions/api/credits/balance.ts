import { getCredits, json, readBearerToken, resolveUserFromBearer } from "../../lib/authAndCredits";

type Env = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const bearer = readBearerToken(context.request);
  if (!bearer) return json({ error: "Unauthorized" }, 401);

  try {
    const user = await resolveUserFromBearer(context.env, bearer);
    const credits = await getCredits(context.env, user.id);
    return json({ credits });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = /missing /i.test(msg) || /failed to fetch credits/i.test(msg) ? 500 : 401;
    return json({ error: msg }, status);
  }
};
