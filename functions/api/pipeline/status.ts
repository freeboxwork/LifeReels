type Env = {
  PIPELINE_BRIDGE_URL?: string;
  PIPELINE_BRIDGE_TOKEN?: string;
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const bridgeUrl = String(context.env.PIPELINE_BRIDGE_URL ?? "").trim();
  if (!bridgeUrl) {
    return new Response(JSON.stringify({ error: "Missing PIPELINE_BRIDGE_URL." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers: Record<string, string> = {};
  if (context.env.PIPELINE_BRIDGE_TOKEN) {
    headers["Authorization"] = `Bearer ${context.env.PIPELINE_BRIDGE_TOKEN}`;
  }
  const target = `${bridgeUrl.replace(/\/+$/, "")}/pipeline/status${url.search}`;
  try {
    const upstream = await fetch(target, { method: "GET", headers });
    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? `Bridge status fetch failed: ${e.message}` : "Bridge status fetch failed.",
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  }
};
