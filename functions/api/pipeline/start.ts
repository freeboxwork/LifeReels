import type { Env } from "./_shared";
import { createJob, runPipelineJob } from "./_shared";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: { diaryText?: string };
  try {
    body = (await context.request.json()) as { diaryText?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const diaryText = String(body.diaryText ?? "").trim();
  if (!diaryText) {
    return new Response(JSON.stringify({ error: "Missing diaryText." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const job = await createJob(context.env);
  context.waitUntil(runPipelineJob(context.env, job, diaryText));

  return new Response(JSON.stringify({ id: job.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
