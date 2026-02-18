import { useEffect, useMemo, useState } from "react";
import DiaryGraphPaperCard from "./DiaryGraphPaperCard";
import type { PipelineJob } from "./pipelineClient";
import { getPipelineStatus } from "./pipelineClient";

const DRAFT_KEY = "lifereels.diary.draft.v1";
const jobDiaryKey = (jobId: string) => `lifereels.job.${jobId}.diaryText`;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function pickTitle(diaryText: string) {
  const raw = String(diaryText || "").trim();
  if (!raw) return "오늘의 기록";
  const firstLine = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  const cleaned = String(firstLine || "").replace(/^dear diary[:,]?\s*/i, "").trim();
  const t = cleaned || raw.slice(0, 28).trim();
  return t.length > 32 ? t.slice(0, 32).trim() + "…" : t;
}

function splitToLines(diaryText: string) {
  const raw = String(diaryText || "").trim();
  if (!raw) {
    return ["오늘의 감정과 장면을 모아", "짧은 릴스로 엮어 드려요.", "한 문장씩 남겨보세요."];
  }

  const lines = raw
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。]|다\.)\s+|[\n\r]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  if (lines.length >= 5) return lines.slice(0, 5);
  if (lines.length >= 3) return lines;

  const chunks: string[] = [];
  const step = 22;
  for (let i = 0; i < raw.length && chunks.length < 5; i += step) {
    chunks.push(raw.slice(i, i + step).trim());
  }
  return chunks.filter(Boolean).slice(0, 5);
}

export default function ResultPage(props: { jobId: string; onCreateAnother?: () => void }) {
  const [job, setJob] = useState<PipelineJob | null>(null);
  const [error, setError] = useState("");

  const diaryText = useMemo(() => {
    try {
      return localStorage.getItem(jobDiaryKey(props.jobId)) ?? localStorage.getItem(DRAFT_KEY) ?? "";
    } catch {
      return "";
    }
  }, [props.jobId]);

  const title = useMemo(() => pickTitle(diaryText), [diaryText]);
  const lines = useMemo(() => splitToLines(diaryText), [diaryText]);

  useEffect(() => {
    let cancelled = false;
    let t: number | undefined;

    const poll = async () => {
      if (cancelled) return;
      try {
        const next = await getPipelineStatus(props.jobId);
        if (cancelled) return;
        setJob(next);
        setError(next.error ? String(next.error) : "");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to fetch status.");
      } finally {
        if (!cancelled) t = window.setTimeout(poll, 2000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
    };
  }, [props.jobId]);

  const outputUrl = job?.outputUrl ? String(job.outputUrl) : "";
  const isDone = job?.status === "done" && Boolean(outputUrl);
  const percent = Math.round(clamp(Number(job?.progress ?? 0), 0, 1) * 100);

  const handleCreateAnother = () => {
    if (props.onCreateAnother) return props.onCreateAnother();
    window.location.hash = "#/generate";
  };

  return (
    <div className="bg-background-light text-text-main font-display overflow-x-hidden min-h-screen flex flex-col">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/60 rounded-full blur-[120px] opacity-40" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[60%] bg-orange-100/40 rounded-full blur-[100px] opacity-30" />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-yellow-100/40 rounded-full blur-[80px] opacity-20" />
      </div>

      <header className="relative z-20 flex items-center justify-between whitespace-nowrap border-b border-solid border-white/20 px-6 py-4 lg:px-10 bg-background-light/90 backdrop-blur-md">
        <div className="flex items-center gap-4 text-text-main">
          <div className="size-8 flex items-center justify-center text-[#e0a656]">
            <span className="material-symbols-outlined text-3xl">movie_filter</span>
          </div>
          <h2 className="text-text-main text-xl font-bold leading-tight tracking-tight">Life Reels</h2>
        </div>
        <button
          type="button"
          onClick={handleCreateAnother}
          className="flex items-center justify-center rounded-full h-10 bg-white hover:bg-gray-50 transition-colors text-text-main gap-2 text-sm font-bold px-4 border border-gray-200 shadow-sm"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          <span className="hidden sm:inline">Create Another</span>
        </button>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center py-8 px-4 w-full max-w-[1200px] mx-auto">
        <div className="w-full flex flex-col lg:flex-row gap-8 lg:gap-16 items-start justify-center mt-4">
          <div className="flex flex-col items-center w-full lg:w-auto shrink-0">
            <div className="relative w-full max-w-[360px] bg-black rounded-xl overflow-hidden border border-white/60 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)]">
              <div style={{ aspectRatio: "9 / 16" }} className="w-full">
                {isDone ? (
                  <video className="w-full h-full object-cover" src={outputUrl} controls playsInline />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[linear-gradient(135deg,#F9C784_0%,#FFDCA8_100%)]">
                    <div className="text-center px-6">
                      <div className="text-5xl font-black text-[#181411]">{percent}%</div>
                      <div className="mt-2 text-sm font-bold text-[#181411]/80">
                        {job?.status === "error" ? "Render failed" : "Rendering in progress"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col w-full max-w-[360px] mt-6 gap-3">
              {isDone ? (
                <a
                  className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-text-main font-bold py-3 px-4 rounded-xl transition-colors shadow-sm"
                  href={outputUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="material-symbols-outlined">download</span>
                  Download
                </a>
              ) : (
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 bg-white text-text-muted font-medium py-3 px-4 rounded-xl border border-gray-200 transition-colors shadow-sm"
                  onClick={() => (window.location.hash = `#/loading?id=${encodeURIComponent(props.jobId)}`)}
                >
                  <span className="material-symbols-outlined">hourglass_top</span>
                  View progress
                </button>
              )}

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col w-full lg:max-w-md mt-4 lg:mt-0">
            <div className="w-full max-w-[360px] aspect-[9/16]">
              <DiaryGraphPaperCard className="h-full max-w-none" fill title={title} narrations={lines} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
