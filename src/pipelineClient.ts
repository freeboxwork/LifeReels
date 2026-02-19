export type PipelineJobStatus =
  | "queued"
  | "generating_scenario"
  | "generating_images"
  | "generating_narration"
  | "rendering_video"
  | "done"
  | "error";

export type PipelineJob = {
  id: string;
  createdAt: number;
  status: PipelineJobStatus;
  progress: number;
  message: string;
  error?: string;
  totalShots?: number;
  completedShots?: number;
  outputUrl?: string;
};

export async function startPipeline(diaryText: string) {
  const resp = await fetch("/api/pipeline/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ diaryText }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(text || `Pipeline start failed: ${resp.status}`);
  const data = JSON.parse(text) as { id: string };
  if (!data?.id) throw new Error("Pipeline start response missing id.");
  return data.id;
}

export async function getPipelineStatus(id: string): Promise<PipelineJob> {
  const resp = await fetch(`/api/pipeline/status?id=${encodeURIComponent(id)}&t=${Date.now()}`, {
    cache: "no-store",
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(text || `Pipeline status failed: ${resp.status}`);
  return JSON.parse(text) as PipelineJob;
}
