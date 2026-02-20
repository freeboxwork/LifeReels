type Env = {
  PIPELINE_BRIDGE_URL?: string;
  PIPELINE_BRIDGE_TOKEN?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

import {
  applyCreditDelta,
  getCredits,
  json,
  readBearerToken,
  resolveUserFromBearer,
} from "../../lib/authAndCredits";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const bridgeUrl = String(context.env.PIPELINE_BRIDGE_URL ?? "").trim();
  if (!bridgeUrl) {
    return json({ error: "Missing PIPELINE_BRIDGE_URL." }, 500);
  }

  const bearer = readBearerToken(context.request);
  if (!bearer) return json({ error: "Unauthorized" }, 401);

  let userId = "";
  let currentCredits = 0;
  try {
    const user = await resolveUserFromBearer(context.env, bearer);
    userId = user.id;
    currentCredits = await getCredits(context.env, userId);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unauthorized" }, 401);
  }

  if (currentCredits < 1) {
    return json(
      {
        error: "Insufficient credits. Please purchase credits to generate a reel.",
        credits: currentCredits,
      },
      402,
    );
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const consumeRef = `credit:consume:start:${crypto.randomUUID()}`;
  const consumeResult = await applyCreditDelta(context.env, userId, -1, "consume_video_start", {
    externalRef: consumeRef,
  });
  if (!consumeResult.applied) {
    return json(
      {
        error: "Insufficient credits. Please purchase credits to generate a reel.",
        credits: consumeResult.balance,
      },
      402,
    );
  }

  const target = `${bridgeUrl.replace(/\/+$/, "")}/pipeline/start`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (context.env.PIPELINE_BRIDGE_TOKEN) {
    headers["Authorization"] = `Bearer ${context.env.PIPELINE_BRIDGE_TOKEN}`;
  }

  const upstream = await fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await upstream.text();

  if (!upstream.ok) {
    // Refund credit if pipeline start fails before job creation.
    await applyCreditDelta(context.env, userId, +1, "refund_video_start_failed", {
      externalRef: `${consumeRef}:refund`,
    });
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  }

  let payload: { id?: string } | null = null;
  try {
    payload = JSON.parse(text) as { id?: string };
  } catch {
    // keep upstream response as-is if parsing fails
  }

  if (!payload?.id) {
    // If id missing, refund to avoid accidental burn.
    await applyCreditDelta(context.env, userId, +1, "refund_video_start_invalid_response", {
      externalRef: `${consumeRef}:invalid`,
    });
    return json({ error: "Pipeline start response missing id." }, 502);
  }

  return json({ id: payload.id, credits: consumeResult.balance });
};
