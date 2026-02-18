import { useEffect, useMemo, useRef, useState } from "react";
import type { PipelineJob } from "./pipelineClient";
import { getPipelineStatus } from "./pipelineClient";

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

export default function LoadingPage(props: { jobId: string; onDone?: (outputUrl: string) => void }) {
  const onDone = props.onDone ?? (() => void 0);
  const [job, setJob] = useState<PipelineJob | null>(null);
  const [error, setError] = useState("");

  const lastDoneUrl = useRef<string>("");
  const stage = pickStage(job ?? undefined);

  const percent = Math.round(clamp(Number(job?.progress ?? 0), 0, 1) * 100);
  const title = useMemo(() => {
    if (stage === "scenario") return "Analyzing Diary...";
    if (stage === "images") return "Generating Images...";
    if (stage === "narration") return "Generating Narration...";
    if (stage === "rendering") return "Assembling Video...";
    if (stage === "done") return "Complete";
    if (stage === "error") return "Something went wrong";
    return "Preparing...";
  }, [stage]);

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

  return (
    <div
      className="bg-background-light text-text-main font-display overflow-x-hidden min-h-screen"
      style={{ fontFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif' }}
    >
      <div className="relative flex min-h-screen flex-col">
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
          {/* No cancel button by request. */}
          <div className="text-xs font-semibold text-text-muted">
            Job {props.jobId.slice(0, 6)}…
          </div>
        </header>

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center py-8 px-4 w-full max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full h-full items-center">
            <div className="lg:col-span-7 flex flex-col items-center justify-center p-6 relative min-h-[400px]">
              <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-primary/40 animate-pulse" />
                <div className="absolute inset-4 rounded-full border border-primary/20" />
                <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
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
                    className="drop-shadow-[0_0_10px_rgba(249,199,132,0.6)]"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10">
                  <div className="mb-2 p-3 bg-primary/20 rounded-full text-[#e0a656] animate-bounce">
                    <span className="material-symbols-outlined text-4xl">auto_awesome</span>
                  </div>
                  <h1 className="text-5xl md:text-6xl font-bold text-text-main tracking-tighter drop-shadow-sm">
                    {percent}%
                  </h1>
                  <p className="text-text-muted font-medium tracking-wide text-sm mt-1 uppercase">
                    {stage === "done" ? "Complete" : stage === "error" ? "Failed" : "Processing"}
                  </p>
                </div>
              </div>

              <div className="mt-12 text-center max-w-md">
                <h2 className="text-2xl md:text-3xl font-bold text-text-main mb-2">{title}</h2>
                <p className="text-text-muted text-base leading-relaxed">
                  {job?.message
                    ? job.message
                    : "We are creating custom visuals, narration, and assembling your reel."}
                </p>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col gap-6 w-full max-w-md mx-auto lg:mx-0">
              <div className="rounded-2xl p-6 md:p-8 flex flex-col gap-0 bg-white border border-black/5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)]">
                {([
                  { idx: 1 as const, icon: "check", label: "Analyzing Diary & Creating Scenario" },
                  { idx: 2 as const, icon: "brush", label: "Generating Images" },
                  { idx: 3 as const, icon: "graphic_eq", label: "Generating Narration" },
                  { idx: 4 as const, icon: "movie", label: "Assembling Video" },
                  { idx: 5 as const, icon: "check_circle", label: "Complete" },
                ] as const).map((s, i) => {
                  const state = stepState(s.idx);
                  const isLast = i === 4;
                  const dot =
                    state.done ? (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-[#e0a656] border border-primary/50">
                        <span className="material-symbols-outlined text-sm">check</span>
                      </div>
                    ) : state.active ? (
                      <div className="relative w-8 h-8 flex items-center justify-center">
                        <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-40" />
                        <div className="relative w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white shadow-[0_0_15px_rgba(249,199,132,0.8)]">
                          <span className="material-symbols-outlined text-sm animate-spin">{s.icon}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center text-text-muted">
                        <span className="material-symbols-outlined text-sm">{s.icon}</span>
                      </div>
                    );

                  const rightText =
                    state.done ? (
                      <p className="text-[#e0a656] text-sm mt-0.5">Completed</p>
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
                          <span className="w-1 h-1 bg-[#e0a656] rounded-full animate-bounce" />
                          <span className="w-1 h-1 bg-[#e0a656] rounded-full animate-bounce delay-75" />
                          <span className="w-1 h-1 bg-[#e0a656] rounded-full animate-bounce delay-150" />
                        </span>
                      </div>
                    ) : (
                      <p className="text-text-muted/70 text-sm mt-0.5">{stage === "error" ? "Stopped" : "Pending"}</p>
                    );

                  const labelClass = state.active
                    ? "text-[#e0a656] font-bold text-lg"
                    : state.done
                      ? "text-text-main font-medium text-base"
                      : "text-text-main/70 font-medium text-base";

                  return (
                    <div key={s.idx} className={"flex gap-4 group " + (state.pending ? "opacity-50" : "")}>
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
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
                    {error}
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl p-5 flex items-start gap-4 transition-transform hover:scale-[1.02] duration-300 bg-white border border-black/5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)]">
                <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-yellow-100 to-orange-100 flex items-center justify-center border border-yellow-200">
                  <span className="material-symbols-outlined text-orange-400">lightbulb</span>
                </div>
                <div>
                  <p className="text-[#e0a656] font-bold text-sm uppercase tracking-wide mb-1">Did you know?</p>
                  <p className="text-text-muted text-sm leading-relaxed">
                    Describing emotions in your diary helps our AI pick better background music, creating a more immersive
                    experience.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 w-full max-w-4xl px-4 opacity-0 lg:opacity-100 transition-opacity">
            <div className="flex justify-between text-xs text-text-muted mb-2 font-mono uppercase tracking-widest">
              <span>Server Load: Optimal</span>
              <span>Est. Time: 2 min</span>
            </div>
            <div className="w-full h-1 bg-gray-300 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full shadow-[0_0_10px_#F9C784]"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
