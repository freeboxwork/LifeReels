import { useEffect, useMemo, useState } from "react";
import { startPipeline } from "./pipelineClient";

function fmtLongDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function timeAgoLabel(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

const DRAFT_KEY = "lifereels.diary.draft.v1";
const jobDiaryKey = (jobId: string) => `lifereels.job.${jobId}.diaryText`;

export default function GeneratePage(props: { onStarted?: (jobId: string) => void }) {
  const onStarted =
    props.onStarted ??
    ((jobId: string) => {
      window.location.hash = `#/loading?id=${encodeURIComponent(jobId)}`;
    });

  const [diaryText, setDiaryText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastEditedAt, setLastEditedAt] = useState<number>(() => Date.now());

  const chars = diaryText.length;
  const today = useMemo(() => new Date(), []);
  const lastEditedLabel = useMemo(() => timeAgoLabel(Date.now() - lastEditedAt), [lastEditedAt, diaryText]);

  const paperNoiseBg = useMemo(() => {
    return "url(\"data:image/svg+xml,%3Csvg%20width%3D'100'%20height%3D'100'%20viewBox%3D'0%200%20100%20100'%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%3E%3Cfilter%20id%3D'noise'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'0.8'%20numOctaves%3D'4'%20stitchTiles%3D'stitch'%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D'100%25'%20height%3D'100%25'%20filter%3D'url(%23noise)'%20opacity%3D'0.05'%2F%3E%3C%2Fsvg%3E\")";
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, diaryText);
    } catch {
      // ignore
    }
  }, [diaryText]);

  async function handleGenerate() {
    setError("");
    const text = diaryText.trim();
    if (!text) {
      setError("일기를 먼저 작성해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const jobId = await startPipeline(text);
      try {
        localStorage.setItem(jobDiaryKey(jobId), text);
      } catch {
        // ignore
      }
      onStarted(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start generation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="bg-background-light min-h-screen flex flex-col overflow-hidden text-text-main"
      style={{ fontFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif' }}
    >
      <header className="flex h-20 items-center justify-between border-b border-gray-200 bg-white px-6 py-0 lg:px-10 z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center text-yellow-600">
            <span className="material-symbols-outlined text-[20px]">movie_filter</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900">Life Reels</h2>
        </div>

        <div className="hidden md:flex items-center gap-4 bg-gray-50 rounded-full px-2 py-1 border border-gray-200 shadow-sm">
          <button
            type="button"
            className="size-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
            disabled
            aria-label="Previous day"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <div className="flex items-center gap-2 px-4 cursor-default group">
            <span className="material-symbols-outlined text-yellow-600 group-hover:text-yellow-700 text-[18px]">
              calendar_today
            </span>
            <span className="text-sm font-semibold tracking-wide text-gray-700">{fmtLongDate(today)}</span>
          </div>
          <button
            type="button"
            className="size-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
            disabled
            aria-label="Next day"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>

        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="bg-[linear-gradient(135deg,#F9C784_0%,#FFDCA8_100%)] hover:opacity-90 transition-opacity text-gray-900 text-sm font-bold px-6 py-2.5 rounded-full shadow-[0_4px_15px_rgba(249,199,132,0.4)] flex items-center gap-2 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            <span>{loading ? "Starting..." : "Generate My Reel"}</span>
          </button>
        </div>
      </header>

      <main
        className="flex-1 flex overflow-hidden w-full max-w-[1600px] mx-auto p-4 lg:p-8 gap-8 pb-28 lg:pb-8"
        // Use inline style so we don't depend on Tailwind arbitrary calc support.
        style={{ height: "calc(100vh - 80px)" }}
      >
        <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden pr-0 lg:pr-2">
          <div className="flex-1 min-h-0 flex flex-col bg-white border border-white rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] overflow-hidden relative group">
            <div
              className="absolute inset-0 pointer-events-none z-0 mix-blend-multiply opacity-30"
              style={{ backgroundImage: paperNoiseBg }}
            />

            <div className="relative z-10 flex items-center justify-between px-8 lg:px-12 pt-10 pb-4">
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Daily Entry</h1>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-widest hidden sm:inline-block">
                  LAST EDITED {lastEditedLabel}
                </span>
                <div className="flex items-center gap-2 text-gray-600 text-xs font-medium bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full">
                  <span className="material-symbols-outlined text-[16px]">cloud</span>
                  <span>Draft</span>
                </div>
              </div>
            </div>

            <div className="relative flex-1 min-h-0 px-8 lg:px-12 py-2 flex flex-col">
              <textarea
                className="w-full flex-1 bg-transparent border-none resize-none focus:ring-0 text-xl leading-8 text-gray-800 placeholder:text-gray-300 font-light"
                placeholder="Start writing your story here... How was your day? What made it special?"
                rows={14}
                style={{ outline: "none", minHeight: 320 }}
                value={diaryText}
                onChange={(e) => {
                  setDiaryText(e.target.value);
                  setLastEditedAt(Date.now());
                }}
              />

              <div className="flex justify-between items-center py-4">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading}
                  className="bg-[linear-gradient(135deg,#F9C784_0%,#FFDCA8_100%)] hover:opacity-90 transition-opacity text-gray-900 text-sm font-bold px-6 py-2.5 rounded-full shadow-[0_4px_15px_rgba(249,199,132,0.4)] flex items-center gap-2 disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                  <span>{loading ? "Starting..." : "Generate My Reel"}</span>
                </button>
                <div className="text-xs text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded-md">
                  {chars} chars
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
              {error}
            </div>
          ) : null}

          <div className="shrink-0 flex items-center justify-center gap-2 text-gray-400 text-sm py-6">
            <span className="material-symbols-outlined text-yellow-500 text-[16px]">lightbulb</span>
            <p>Tip: Descriptive words like "sunlight" or "calm" help the AI curate better footage.</p>
          </div>
        </div>

        <aside className="hidden lg:flex flex-col w-80 shrink-0 gap-6 overflow-y-auto">
          <div className="bg-white border border-white rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] p-6 flex flex-col gap-4 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[linear-gradient(135deg,#F9C784_0%,#FFDCA8_100%)]" />
            <div className="flex items-center gap-3 z-10">
              <div className="size-10 rounded-full bg-[linear-gradient(135deg,#F9C784_0%,#FFDCA8_100%)] flex items-center justify-center text-gray-900 shadow-md">
                <span className="material-symbols-outlined text-[22px]">auto_awesome</span>
              </div>
              <h3 className="font-bold text-lg text-gray-900">AI Magic Guide</h3>
            </div>
            <div className="z-10 space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed font-medium">
                AI가 일기를 읽고, 감정과 장면을 분석해
                <br />
                나만의 릴스 영상으로 만들어드려요.
              </p>
              <div className="h-px bg-gray-100 w-full" />
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 border border-gray-100 cursor-default">
                  <span className="material-symbols-outlined text-primary mt-0.5 text-[18px]">movie_edit</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-800">Scenario Draft</span>
                    <span className="text-[10px] text-gray-500">일기 내용을 바탕으로 자동 생성됩니다</span>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 border border-gray-100 cursor-default">
                  <span className="material-symbols-outlined text-primary mt-0.5 text-[18px]">queue_music</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-800">Video Rendering</span>
                    <span className="text-[10px] text-gray-500">이미지, 나레이션, BGM을 합쳐 완성 영상으로 만듭니다</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Bottom action bar for small viewports so the CTA is always reachable. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden">
        <div className="mx-auto max-w-[1600px] px-4 pb-4">
          <div className="rounded-2xl border border-gray-200 bg-white/90 backdrop-blur shadow-[0_10px_30px_-10px_rgba(0,0,0,0.18)] px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-400 font-mono">{chars} chars</div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="bg-[linear-gradient(135deg,#F9C784_0%,#FFDCA8_100%)] hover:opacity-90 transition-opacity text-gray-900 text-sm font-bold px-5 py-2 rounded-full shadow-[0_4px_15px_rgba(249,199,132,0.4)] flex items-center gap-2 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              <span>{loading ? "Starting..." : "Generate"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
