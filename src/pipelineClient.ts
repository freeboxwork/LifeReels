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

export type StartPipelineResponse = {
  id: string;
  credits?: number;
};

export async function startPipeline(diaryText: string, accessToken?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const resp = await fetch("/api/pipeline/start", {
    method: "POST",
    headers,
    body: JSON.stringify({ diaryText }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    try {
      const data = JSON.parse(text) as { error?: string };
      throw new Error(data.error || `Pipeline start failed: ${resp.status}`);
    } catch {
      throw new Error(text || `Pipeline start failed: ${resp.status}`);
    }
  }
  const data = JSON.parse(text) as StartPipelineResponse;
  if (!data?.id) throw new Error("Pipeline start response missing id.");
  return data;
}

export async function getPipelineStatus(id: string): Promise<PipelineJob> {
  const resp = await fetch(`/api/pipeline/status?id=${encodeURIComponent(id)}&t=${Date.now()}`, {
    cache: "no-store",
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(text || `Pipeline status failed: ${resp.status}`);
  return JSON.parse(text) as PipelineJob;
}
