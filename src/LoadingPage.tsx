import { useEffect, useMemo, useRef, useState } from "react";
import type { PipelineJob } from "./pipelineClient";
import { getPipelineStatus } from "./pipelineClient";
import AppHeader from "./components/AppHeader";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function pickStage(job?: PipelineJob) {
  const status = job?.status;
  if (!job) return "queued";
  if (status === "generating_scenario" || status === "queued") return "scenario";
  if (status === "rendering_video") return "rendering";
  if (status === "done") return "done";
  if (status === "error") return "error";
  // Bridge currently combines image + narration under generating_images ("Generating assets...").
  if (status === "generating_images") {
    const p = Number(job.progress ?? 0);
    // The bridge's assets stage roughly spans 0.12..0.70.
    // Show "Generating Images" for the first half, then "Generating Narration".
    return p < 0.41 ? "images" : "narration";
  }
  return "queued";
}

const STATUS_ORDER: Record<string, number> = {
  queued: 0,
  generating_scenario: 1,
  generating_images: 2,
  generating_narration: 3,
  rendering_video: 4,
  done: 5,
  error: 6,
};

function shouldIgnoreRegressiveUpdate(prev: PipelineJob | null, next: PipelineJob) {
  if (!prev) return false;
  if (next.status === "done" || next.status === "error") return false;

  const prevRank = STATUS_ORDER[String(prev.status)] ?? -1;
  const nextRank = STATUS_ORDER[String(next.status)] ?? -1;
  if (nextRank < prevRank) return true;

  if (nextRank === prevRank) {
    const prevProgress = Number(prev.progress ?? 0);
    const nextProgress = Number(next.progress ?? 0);
    // Ignore obvious backtracking caused by stale/cached status responses.
    if (nextProgress + 0.03 < prevProgress) return true;
  }
  return false;
}

const TIPS = [
  {
    headline: "Did you know?",
    body: "Describing emotions in your diary helps our AI pick better background music.",
  },
  {
    headline: "Pro tip",
    body: "Specific scenes — a rainy street, a morning cup of coffee — generate more vivid visuals.",
  },
  {
    headline: "Fun fact",
    body: "Each reel is unique. The same diary entry can produce a completely different video every time.",
  },
  {
    headline: "While you wait",
    body: "Our AI is reading your diary line by line, building a storyboard just for you.",
  },
  {
    headline: "Good to know",
    body: "Longer diary entries allow the AI to craft richer, multi-scene stories.",
  },
];

const STAGE_DESCRIPTIONS: Record<string, string> = {
  scenario: "AI is reading your diary and crafting a scene-by-scene storyboard.",
  images: "Turning your words into vivid, cinematic visuals — one scene at a time.",
  narration: "Giving your story a voice with AI-generated narration.",
  rendering: "Assembling all assets into your final reel. Almost there!",
  done: "Your reel is ready!",
  error: "Something went wrong during generation.",
  queued: "Getting things ready…",
};

export default function LoadingPage(props: { jobId: string; onDone?: (outputUrl: string) => void }) {
  const onDone = props.onDone ?? (() => void 0);
  const [job, setJob] = useState<PipelineJob | null>(null);
  const [error, setError] = useState("");
  const [tipIndex, setTipIndex] = useState(0);

  const lastDoneUrl = useRef<string>("");
  const stage = pickStage(job ?? undefined);

  const percent = Math.round(clamp(Number(job?.progress ?? 0), 0, 1) * 100);
  const title = useMemo(() => {
    if (stage === "scenario") return "Analyzing Diary...";
    if (stage === "images") return "Generating Images...";
    if (stage === "narration") return "Generating Narration...";
    if (stage === "rendering") return "Assembling Video...";
    if (stage === "done") return "Complete!";
    if (stage === "error") return "Something went wrong";
    return "Preparing...";
  }, [stage]);

  const isAlmostDone = percent >= 90 && stage !== "done" && stage !== "error";

  // Rotate tips every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let t: number | undefined;

    const poll = async () => {
      if (cancelled) return;
      try {
        const next = await getPipelineStatus(props.jobId);
        if (cancelled) return;
        setJob((prev) => (shouldIgnoreRegressiveUpdate(prev, next) ? prev : next));
        setError(next.error ? String(next.error) : "");
        if (next.outputUrl && next.status === "done" && lastDoneUrl.current !== next.outputUrl) {
          lastDoneUrl.current = next.outputUrl;
          onDone(next.outputUrl);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to fetch status.");
      } finally {
        if (!cancelled) {
          t = window.setTimeout(poll, 1500);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (t) window.clearTimeout(t);
    };
  }, [onDone, props.jobId]);

  const circumference = 283;
  const dashOffset = Math.round(circumference * (1 - clamp((job?.progress ?? 0) as number, 0, 1)));

  const totalShots = typeof job?.totalShots === "number" ? job.totalShots : undefined;
  const completedShots = typeof job?.completedShots === "number" ? job.completedShots : undefined;

  const stepState = (idx: 1 | 2 | 3 | 4 | 5) => {
    // 1 scenario, 2 images, 3 narration, 4 render, 5 complete
    const s = stage;
    const done =
      (idx === 1 && ["images", "narration", "rendering", "done"].includes(s)) ||
      (idx === 2 && ["narration", "rendering", "done"].includes(s)) ||
      (idx === 3 && ["rendering", "done"].includes(s)) ||
      (idx === 4 && ["done"].includes(s)) ||
      (idx === 5 && s === "done");
    const active =
      (idx === 1 && s === "scenario") ||
      (idx === 2 && s === "images") ||
      (idx === 3 && s === "narration") ||
      (idx === 4 && s === "rendering");
    const pending = !done && !active && stage !== "error";
    return { done, active, pending };
  };

  const currentTip = TIPS[tipIndex];

  return (
    <div className="bg-background-light text-text-main font-body overflow-x-hidden min-h-screen page-enter">
      <div className="relative flex min-h-screen flex-col">
        {/* Background blobs */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/60 rounded-full blur-[120px] opacity-40" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[60%] bg-orange-100/40 rounded-full blur-[100px] opacity-30" />
          <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-yellow-100/40 rounded-full blur-[80px] opacity-20" />
        </div>

        <AppHeader
          rightContent={
            <span className="text-xs font-semibold text-text-muted bg-white/60 rounded-full px-3 py-1 border border-border-light">
              Job {props.jobId.slice(0, 6)}…
            </span>
          }
        />

        <main
          className="relative z-10 flex flex-1 flex-col items-center justify-center py-8 px-4 w-full max-w-[1200px] mx-auto"
          aria-label="Video generation progress"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full h-full items-center">
            {/* Left: circular progress */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center p-6 relative min-h-[400px]">
              <div
                className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Generation progress: ${percent}%`}
              >
                <div className="absolute inset-0 rounded-full border border-primary/40 animate-pulse" aria-hidden="true" />
                <div className="absolute inset-4 rounded-full border border-primary/20" aria-hidden="true" />
                <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" fill="none" r="45" stroke="#d4d4d4" strokeWidth="6" />
                  <circle
                    cx="50"
                    cy="50"
                    fill="none"
                    r="45"
                    stroke="#F9C784"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    strokeWidth="6"
                    className="drop-shadow-[0_0_10px_rgba(249,199,132,0.6)] transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10">
                  <div className="mb-2 p-3 bg-primary/20 rounded-full text-[#c88c10] animate-bounce" aria-hidden="true">
                    <span className="material-symbols-outlined text-4xl">auto_awesome</span>
                  </div>
                  <span className="text-5xl md:text-6xl font-bold text-text-main tracking-tighter drop-shadow-sm" aria-hidden="true">
                    {percent}%
                  </span>
                  <p className="text-text-muted font-medium tracking-wide text-sm mt-1 uppercase" aria-hidden="true">
                    {stage === "done" ? "Complete" : stage === "error" ? "Failed" : isAlmostDone ? "Almost done!" : "Processing"}
                  </p>
                </div>
              </div>

              {/* Live status announcement (screen readers) */}
              <div role="status" aria-live="polite" aria-atomic="true" className="mt-12 text-center max-w-md">
                <h2 className="text-2xl md:text-3xl font-bold text-text-main mb-2">{title}</h2>
                {isAlmostDone && (
                  <p className="text-primary-dark font-bold text-sm mb-2 animate-pulse">✦ 거의 다 됐어요!</p>
                )}
                <p className="text-text-muted text-base leading-relaxed">
                  {job?.message ? job.message : STAGE_DESCRIPTIONS[stage]}
                </p>
                <p className="text-text-muted text-sm mt-3">
                  Video production takes about 5 minutes.
                </p>
              </div>

              {/* Error recovery buttons */}
              {stage === "error" && (
                <div className="mt-6 flex flex-wrap gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => (window.location.hash = "#/generate")}
                    className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-hover text-text-main font-bold px-5 py-2.5 text-sm transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit_note</span>
                    Back to Write
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-2 rounded-xl bg-white hover:bg-gray-50 text-text-muted font-medium px-5 py-2.5 text-sm transition-colors border border-border-light shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[18px]">refresh</span>
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* Right: step list + tips */}
            <div className="lg:col-span-5 flex flex-col gap-6 w-full max-w-md mx-auto lg:mx-0">
              <div
                className="rounded-2xl p-6 md:p-8 flex flex-col gap-0 bg-white border border-black/5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)]"
                role="list"
                aria-label="Generation steps"
              >
                {([
                  { idx: 1 as const, icon: "psychology", label: "Analyzing Diary & Creating Scenario" },
                  { idx: 2 as const, icon: "brush", label: "Generating Images" },
                  { idx: 3 as const, icon: "graphic_eq", label: "Generating Narration" },
                  { idx: 4 as const, icon: "movie", label: "Assembling Video" },
                  { idx: 5 as const, icon: "check_circle", label: "Complete" },
                ] as const).map((s, i) => {
                  const state = stepState(s.idx);
                  const isLast = i === 4;
                  const dotStateKey = state.done ? "done" : state.active ? "active" : "pending";
                  const dot =
                    state.done ? (
                      // key forces remount when transitioning to done → animation plays
                      <div
                        key={`${s.idx}-done`}
                        className="step-done-pop w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-[#c88c10] border border-primary/50"
                        aria-hidden="true"
                      >
                        <span className="material-symbols-outlined text-sm">check</span>
                      </div>
                    ) : state.active ? (
                      <div key={`${s.idx}-active`} className="relative w-8 h-8 flex items-center justify-center" aria-hidden="true">
                        {/* outer ping ring */}
                        <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-30" />
                        {/* secondary softer ring */}
                        <div className="absolute -inset-1 bg-primary/20 rounded-full animate-ping opacity-20" style={{ animationDelay: "0.5s" }} />
                        {/* icon circle with glow */}
                        <div className="relative w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[#181411] icon-glow-pulse">
                          <span className="material-symbols-outlined text-sm">{s.icon}</span>
                        </div>
                      </div>
                    ) : (
                      <div key={`${s.idx}-${dotStateKey}`} className="w-8 h-8 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center text-text-muted" aria-hidden="true">
                        <span className="material-symbols-outlined text-sm">{s.icon}</span>
                      </div>
                    );

                  const rightText =
                    state.done ? (
                      <p className="text-[#c88c10] text-sm mt-0.5">Completed</p>
                    ) : state.active ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-text-muted/80 text-sm">
                          {s.idx === 2 || s.idx === 3
                            ? totalShots && completedShots !== undefined
                              ? `Processing scenes... (${completedShots}/${totalShots})`
                              : "Processing scenes..."
                            : "Working..."}
                        </span>
                        <span className="flex gap-1">
                          <span className="w-1 h-1 bg-primary rounded-full animate-bounce" />
                          <span className="w-1 h-1 bg-primary rounded-full animate-bounce delay-75" />
                          <span className="w-1 h-1 bg-primary rounded-full animate-bounce delay-150" />
                        </span>
                      </div>
                    ) : (
                      <p className="text-text-muted/70 text-sm mt-0.5">{stage === "error" ? "Stopped" : "Pending"}</p>
                    );

                  const labelClass = state.active
                    ? "text-[#c88c10] font-bold text-lg"
                    : state.done
                      ? "text-text-main font-medium text-base"
                      : "text-text-main/70 font-medium text-base";

                  return (
                    <div
                      key={s.idx}
                      role="listitem"
                      aria-label={`${s.label}: ${state.done ? "completed" : state.active ? "in progress" : "pending"}`}
                      className={"flex gap-4 group " + (state.pending ? "opacity-50" : "")}
                    >
                      <div className="flex flex-col items-center">
                        {dot}
                        {!isLast ? (
                          <div className={"w-0.5 h-full my-1 min-h-[24px] " + (state.done ? "bg-primary/30" : "bg-gray-200")} />
                        ) : null}
                      </div>
                      <div className={isLast ? "" : "pb-6"}>
                        <p className={labelClass}>{s.label}</p>
                        {rightText}
                      </div>
                    </div>
                  );
                })}

                {job?.outputUrl ? (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-text-main mb-2">Your reel is ready</p>
                    <video controls src={job.outputUrl} className="w-full rounded-lg bg-black" />
                    <a className="text-sm font-bold text-primary mt-2 inline-block" href={job.outputUrl}>
                      Open video
                    </a>
                  </div>
                ) : null}

                {error ? (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold"
                  >
                    <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5" aria-hidden="true">error</span>
                    <span>{error}</span>
                  </div>
                ) : null}
              </div>

              {/* Rotating tip card */}
              <div
                key={tipIndex}
                className="rounded-xl p-5 flex items-start gap-4 bg-white border border-black/5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)] animate-fade-in"
              >
                <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-yellow-100 to-orange-100 flex items-center justify-center border border-yellow-200">
                  <span className="material-symbols-outlined text-orange-400">lightbulb</span>
                </div>
                <div>
                  <p className="text-[#c88c10] font-bold text-sm uppercase tracking-wide mb-1">{currentTip.headline}</p>
                  <p className="text-text-muted text-sm leading-relaxed">{currentTip.body}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom progress bar */}
          <div className="mt-8 w-full max-w-4xl px-4 opacity-0 lg:opacity-100 transition-opacity">
            <div className="flex justify-between text-xs text-text-muted mb-2 font-mono uppercase tracking-widest">
              <span>Server Load: Optimal</span>
              <span>{isAlmostDone ? "Almost done!" : "Processing..."}</span>
            </div>
            <div className="w-full h-1 bg-gray-300 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full shadow-[0_0_10px_#F9C784] transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
