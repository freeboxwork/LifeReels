type Env = {
  PIPELINE_BRIDGE_URL?: string;
  PIPELINE_BRIDGE_TOKEN?: string;
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const bridgeUrl = String(context.env.PIPELINE_BRIDGE_URL ?? "").trim();
  if (!bridgeUrl) {
    return new Response(JSON.stringify({ error: "Missing PIPELINE_BRIDGE_URL." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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

  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
};
