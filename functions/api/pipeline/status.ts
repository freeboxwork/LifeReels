import type { Env } from "./_shared";
import { getJob } from "./_shared";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const job = getJob(id);
  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(job), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

