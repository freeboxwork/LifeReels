import { useEffect, useMemo, useRef, useState } from "react";
import { startPipeline } from "./pipelineClient";
import AppHeader from "./components/AppHeader";
import { supabase } from "./supabaseClient";
import { createPolarCheckout, getCreditBalance } from "./billingClient";

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

const TIPS = [
  'Tip: Descriptive words like "sunlight" or "calm" help the AI curate better footage.',
  "Tip: Include specific emotions — joy, nostalgia, relief — for a more resonant video.",
  "Tip: Mention places or scenes (café window, rainy street) for vivid visuals.",
  "Tip: Short sentences and line breaks help the AI identify distinct moments.",
  "Tip: Even a single powerful sentence can become a stunning reel.",
];

function getSidebarMessage(chars: number): { title: string; body: string } {
  if (chars === 0) {
    return {
      title: "AI Magic Guide",
      body: "Start writing your diary.\nAI will analyze your story and build a personalized reel.",
    };
  }
  if (chars < 50) {
    return {
      title: "Keep going!",
      body: "You've started — great! Add more details about how you felt or what you saw.",
    };
  }
  if (chars < 200) {
    return {
      title: "Looking great!",
      body: "Rich content! AI will extract key scenes and emotions to craft your video.",
    };
  }
  return {
    title: "Ready to generate!",
    body: "You have plenty of material. Hit the button and watch your diary come to life!",
  };
}

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
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lastEditedAt, setLastEditedAt] = useState<number>(() => Date.now());
  const [tipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const startLockRef = useRef(false);

  const chars = diaryText.length;
  const today = useMemo(() => new Date(), []);
  const lastEditedLabel = useMemo(() => timeAgoLabel(Date.now() - lastEditedAt), [lastEditedAt, diaryText]);

  const paperNoiseBg = useMemo(() => {
    return "url(\"data:image/svg+xml,%3Csvg%20width%3D'100'%20height%3D'100'%20viewBox%3D'0%200%20100%20100'%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%3E%3Cfilter%20id%3D'noise'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'0.8'%20numOctaves%3D'4'%20stitchTiles%3D'stitch'%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D'100%25'%20height%3D'100%25'%20filter%3D'url(%23noise)'%20opacity%3D'0.05'%2F%3E%3C%2Fsvg%3E\")";
  }, []);

  const sidebarMsg = useMemo(() => getSidebarMessage(chars), [chars]);

  async function refreshCredits() {
    try {
      const { data } = await supabase.auth.getSession();
      const token = String(data.session?.access_token ?? "").trim();
      if (!token) {
        setCredits(null);
        return;
      }
      const balance = await getCreditBalance(token);
      setCredits(balance);
    } catch (e) {
      setCredits(null);
      const msg = e instanceof Error ? e.message : "Failed to load credits.";
      setError(msg);
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, diaryText);
    } catch {
      // ignore
    }
  }, [diaryText]);

  useEffect(() => {
    void refreshCredits();
  }, []);

  // 페이지를 떠날 때 초안 초기화 — 재진입 시 빈 상태로 시작
  useEffect(() => {
    return () => {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
    };
  }, []);

  async function handleGenerate() {
    if (startLockRef.current || loading) return;
    startLockRef.current = true;
    setError("");
    const text = diaryText.trim();
    if (!text) {
      setError("Please write your diary before generating.");
      startLockRef.current = false;
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = String(data.session?.access_token ?? "").trim();
      if (!token) throw new Error("Session expired. Please log in again.");

      const started = await startPipeline(text, token);
      try {
        localStorage.setItem(jobDiaryKey(started.id), text);
      } catch {
        // ignore
      }
      if (typeof started.credits === "number") {
        setCredits(Math.max(0, Math.floor(started.credits)));
      } else {
        void refreshCredits();
      }
      onStarted(started.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start generation.");
      void refreshCredits();
    } finally {
      setLoading(false);
      startLockRef.current = false;
    }
  }

  async function handleBuyCredits() {
    setError("");
    setCheckoutLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = String(data.session?.access_token ?? "").trim();
      if (!token) throw new Error("Session expired. Please log in again.");
      const url = await createPolarCheckout(token);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open checkout.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  const generateBtn = (
    <button
      type="button"
      onClick={handleGenerate}
      disabled={loading}
      className="bg-[linear-gradient(135deg,#F9C784_0%,#FFDCA8_100%)] hover:opacity-90 transition-opacity text-gray-900 text-sm font-bold px-6 py-2.5 rounded-full shadow-[0_4px_15px_rgba(249,199,132,0.4)] flex items-center gap-2 disabled:opacity-60"
    >
      {loading ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
      ) : (
        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
      )}
      <span>{loading ? "Starting..." : "Generate My Reel"}</span>
    </button>
  );

  return (
    <div className="bg-background-light min-h-screen flex flex-col overflow-hidden text-text-main font-body page-enter">
      <AppHeader
        rightContent={
          <>
            <div className="hidden md:flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 shadow-sm">
              <span className="material-symbols-outlined text-primary text-[17px]">paid</span>
              <span className="text-sm font-semibold text-gray-800">
                Credits: {credits === null ? "..." : credits}
              </span>
            </div>
            <button
              type="button"
              onClick={handleBuyCredits}
              disabled={checkoutLoading}
              className="hidden md:flex items-center justify-center rounded-full h-10 px-4 border border-gray-200 bg-white hover:bg-gray-50 text-sm font-bold text-gray-800 transition-colors disabled:opacity-60"
            >
              {checkoutLoading ? "Opening checkout..." : "Buy 3 Credits ($1)"}
            </button>
            <div className="hidden md:flex items-center gap-4 bg-gray-50 rounded-full px-2 py-1 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 px-3 py-1 cursor-default">
                <span className="material-symbols-outlined text-[#c88c10] text-[16px]">calendar_today</span>
                <span className="text-sm font-semibold tracking-wide text-gray-700">{fmtLongDate(today)}</span>
              </div>
            </div>
            {generateBtn}
          </>
        }
      />

      <main
        className="flex-1 flex overflow-hidden w-full max-w-[1600px] mx-auto p-4 lg:p-8 gap-8 pb-28 lg:pb-8"
        style={{ height: "calc(100vh - 64px)" }}
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
                  LAST EDITED {lastEditedLabel.toUpperCase()}
                </span>
                <div className="flex items-center gap-2 text-gray-500 text-xs font-medium bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-full">
                  <span className="material-symbols-outlined text-[14px]">cloud</span>
                  <span>Draft</span>
                </div>
              </div>
            </div>

            <div className="relative flex-1 min-h-0 px-8 lg:px-12 py-2 flex flex-col">
              {chars === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-0 opacity-40 pb-16">
                  <span className="material-symbols-outlined text-[48px] text-gray-300 mb-3">edit_note</span>
                  <p className="text-gray-300 text-base font-medium text-center max-w-[260px] leading-relaxed">
                    How was your day?<br />What made it special?
                  </p>
                </div>
              )}
              <textarea
                className="w-full flex-1 bg-transparent border-none resize-none focus:ring-0 text-xl leading-8 text-gray-800 placeholder:text-gray-300 font-light relative z-10"
                placeholder="Start writing your story here..."
                rows={14}
                style={{ outline: "none", minHeight: 320 }}
                value={diaryText}
                onChange={(e) => {
                  setDiaryText(e.target.value);
                  setLastEditedAt(Date.now());
                }}
              />

              <div className="flex justify-between items-center py-4 relative z-10">
                {generateBtn}
                <div className="text-xs text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded-md">
                  {chars} chars
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
              {error}
            </div>
          ) : null}

          <div className="shrink-0 flex items-center justify-center gap-2 text-gray-400 text-sm py-5">
            <span className="material-symbols-outlined text-primary text-[16px]">lightbulb</span>
            <p>{TIPS[tipIndex]}</p>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-80 shrink-0 gap-6 overflow-y-auto">
          <div className="bg-white border border-white rounded-[2rem] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] p-6 flex flex-col gap-4 relative overflow-hidden transition-all duration-300">
            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[linear-gradient(135deg,#F9C784_0%,#FFDCA8_100%)]" />
            <div className="flex items-center gap-3 z-10">
              <div className="size-10 rounded-full bg-[linear-gradient(135deg,#F9C784_0%,#FFDCA8_100%)] flex items-center justify-center text-gray-900 shadow-md shrink-0">
                <span className="material-symbols-outlined text-[22px]">auto_awesome</span>
              </div>
              <h3 className="font-bold text-lg text-gray-900 transition-all duration-300">{sidebarMsg.title}</h3>
            </div>
            <div className="z-10 space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed font-medium whitespace-pre-line transition-all duration-300">
                {sidebarMsg.body}
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

              {/* Char progress bar */}
              {chars > 0 && (
                <div className="mt-1">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>Content</span>
                    <span>{chars < 50 ? "Keep writing" : chars < 200 ? "Good amount" : "Ready!"}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (chars / 200) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* Mobile bottom CTA */}
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
              {loading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
              ) : (
                <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              )}
              <span>{loading ? "Starting..." : "Generate"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
