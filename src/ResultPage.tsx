import { useEffect, useMemo, useRef, useState } from "react";
import DiaryGraphPaperCard from "./DiaryGraphPaperCard";
import type { PipelineJob } from "./pipelineClient";
import { getPipelineStatus } from "./pipelineClient";
import AppHeader from "./components/AppHeader";
import { supabase } from "./supabaseClient";
import {
  FacebookShareButton,
  ThreadsShareButton,
  TwitterShareButton,
} from "react-share";

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
    .split(/[\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 줄바꿈 기준으로 충분히 나뉜 경우
  if (lines.length >= 3) return lines.slice(0, 10);

  // 문장 단위로 분리
  const sentences = raw
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。]|다\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length >= 2) return sentences.slice(0, 10);

  // 길이 기준 청크 분할 (한국어 고려 ~24자)
  const chunks: string[] = [];
  const step = 24;
  for (let i = 0; i < raw.length && chunks.length < 10; i += step) {
    chunks.push(raw.slice(i, i + step).trim());
  }
  return chunks.filter(Boolean);
}

export default function ResultPage(props: { jobId: string; onCreateAnother?: () => void }) {
  const [job, setJob] = useState<PipelineJob | null>(null);
  const [error, setError] = useState("");
  const [downloadDone, setDownloadDone] = useState(false);
  const [thumbnailReady, setThumbnailReady] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [emailStatusMessage, setEmailStatusMessage] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const pollingStoppedRef = useRef(false);
  const emailSentRef = useRef(false);

  // 메타데이터 로드 후 0.5초 지점으로 탐색 → 썸네일 확보
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    // 영상 길이가 0.5초보다 짧으면 duration의 10% 지점 사용
    video.currentTime = Math.min(0.5, (video.duration || 1) * 0.1);
  };

  // 탐색 완료 = 해당 프레임이 캔버스에 그려짐 → placeholder 제거
  const handleSeeked = () => {
    setThumbnailReady(true);
  };

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
      if (cancelled || pollingStoppedRef.current) return;
      try {
        const next = await getPipelineStatus(props.jobId);
        if (cancelled) return;
        setJob(next);
        setError(next.error ? String(next.error) : "");
        // Stop polling once done
        if (next.status === "done" && next.outputUrl) {
          pollingStoppedRef.current = true;
          return;
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to fetch status.");
      } finally {
        if (!cancelled && !pollingStoppedRef.current) {
          t = window.setTimeout(poll, 2000);
        }
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
  const shareTitle = "My Life Reels video is ready.";
  const shareUrl = outputUrl;

  useEffect(() => {
    if (!isDone || !outputUrl || emailSentRef.current) return;

    let cancelled = false;

    const sendResultEmail = async () => {
      setEmailStatus("sending");
      setEmailStatusMessage("Sending your video link to your email...");

      try {
        const { data } = await supabase.auth.getSession();
        const token = String(data.session?.access_token ?? "").trim();
        if (!token) throw new Error("No active session.");

        const resp = await fetch("/api/notify/reel-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jobId: props.jobId,
            outputUrl,
          }),
        });

        const raw = await resp.text();
        if (!resp.ok) throw new Error(raw || `Failed to send email: ${resp.status}`);
        if (cancelled) return;

        emailSentRef.current = true;
        setEmailStatus("sent");
        setEmailStatusMessage("Your video link has been sent to your email.");
      } catch (e) {
        if (cancelled) return;
        setEmailStatus("failed");
        setEmailStatusMessage(
          e instanceof Error
            ? `Email delivery failed: ${e.message}`
            : "Email delivery failed.",
        );
      }
    };

    void sendResultEmail();
    return () => {
      cancelled = true;
    };
  }, [isDone, outputUrl, props.jobId]);

  const handleCreateAnother = () => {
    if (props.onCreateAnother) return props.onCreateAnother();
    window.location.hash = "#/generate";
  };

  const handleDownloadClick = () => {
    setDownloadDone(true);
    setTimeout(() => setDownloadDone(false), 3000);
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("Link copied.");
    } catch {
      setShareStatus("Could not copy link.");
    }
    window.setTimeout(() => setShareStatus(""), 2500);
  };

  const handleInstagramShare = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: "Check out my Life Reels video.",
          url: shareUrl,
        });
        setShareStatus("Share sheet opened.");
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus("Instagram web share is limited. Link copied.");
      }
    } catch {
      setShareStatus("Share canceled.");
    }
    window.setTimeout(() => setShareStatus(""), 2500);
  };

  return (
    <div className="bg-background-light text-text-main font-body overflow-x-hidden min-h-screen flex flex-col page-enter">
      {/* Background blobs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/60 rounded-full blur-[120px] opacity-40" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[60%] bg-orange-100/40 rounded-full blur-[100px] opacity-30" />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-yellow-100/40 rounded-full blur-[80px] opacity-20" />
      </div>

      <AppHeader
        rightContent={
          <button
            type="button"
            onClick={handleCreateAnother}
            className="flex items-center justify-center rounded-full h-9 bg-white hover:bg-gray-50 transition-colors text-text-main gap-2 text-sm font-bold px-4 border border-gray-200 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span className="hidden sm:inline">Create Another</span>
          </button>
        }
      />

      {/* Completion banner */}
      {isDone && (
        <div className="relative z-10 w-full bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20 border-b border-primary/30 px-6 py-3 text-center animate-fade-in">
          <p className="text-text-main font-bold text-sm flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#c88c10]">celebration</span>
            {emailStatus === "sent"
              ? "Your reel is ready. We sent your video link by email."
              : "Your reel is ready! Download it and share your story."}
          </p>
          {(emailStatus === "sending" || emailStatus === "failed") && (
            <p className="text-xs text-text-muted mt-1">{emailStatusMessage}</p>
          )}
        </div>
      )}

      <main className="relative z-10 flex flex-1 flex-col items-center py-8 px-4 w-full max-w-[1200px] mx-auto">
        <div className="w-full flex flex-col lg:flex-row gap-8 lg:gap-16 items-start justify-center mt-4">
          {/* Left: video player + actions */}
          <div className="flex flex-col items-center w-full lg:w-auto shrink-0">
            <div className="relative w-full max-w-[360px] bg-black rounded-2xl overflow-hidden border border-white/60 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)]">
              <div style={{ aspectRatio: "9 / 16" }} className="w-full">
                {isDone ? (
                  <div className="relative w-full h-full bg-[#111]">
                    {/* Placeholder — 0.5s 썸네일 준비 전 표시 */}
                    {!thumbnailReady && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-[#1e1e1e] to-[#141414] z-10 pointer-events-none">
                        <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                          <span className="material-symbols-outlined text-primary text-4xl">movie</span>
                        </div>
                        <p className="text-white/50 text-sm font-medium">Loading your reel…</p>
                        <div className="flex gap-1.5">
                          <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" />
                          <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                          <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0.30s" }} />
                        </div>
                      </div>
                    )}
                    <video
                      ref={videoRef}
                      className={"w-full h-full object-cover transition-opacity duration-500 " + (thumbnailReady ? "opacity-100" : "opacity-0")}
                      src={outputUrl}
                      controls
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={handleLoadedMetadata}
                      onSeeked={handleSeeked}
                    />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[linear-gradient(135deg,#F9C784_0%,#FFDCA8_100%)] gap-4">
                    <div className="text-center px-6">
                      <div className="text-5xl font-black text-[#181411]">{percent}%</div>
                      <div className="mt-2 text-sm font-bold text-[#181411]/80">
                        {job?.status === "error" ? "Render failed" : "Rendering in progress"}
                      </div>
                    </div>
                    {job?.status !== "error" && (
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-[#181411]/30 rounded-full animate-bounce" />
                        <span className="w-2 h-2 bg-[#181411]/30 rounded-full animate-bounce delay-75" />
                        <span className="w-2 h-2 bg-[#181411]/30 rounded-full animate-bounce delay-150" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col w-full max-w-[360px] mt-4 gap-2">
              {isDone ? (
                <>
                  <a
                    className={
                      "flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-xl transition-all shadow-sm " +
                      (downloadDone
                        ? "bg-green-500 text-white"
                        : "bg-primary hover:bg-primary-hover text-text-main")
                    }
                    href={outputUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    onClick={handleDownloadClick}
                  >
                    <span className="material-symbols-outlined">
                      {downloadDone ? "check_circle" : "download"}
                    </span>
                    {downloadDone ? "Downloaded!" : "Download"}
                  </a>
                  <button
                    type="button"
                    onClick={handleCreateAnother}
                    className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-text-muted font-medium py-2.5 px-4 rounded-xl border border-border-light transition-colors shadow-sm text-sm"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                    Create Another Reel
                  </button>
                  <div className="rounded-xl border border-border-light bg-white p-3">
                    <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wide">Share</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <TwitterShareButton
                        url={shareUrl}
                        title={shareTitle}
                        className="inline-flex items-center justify-center gap-1 rounded-full border border-border-light bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-semibold text-text-main"
                      >
                        <span className="material-symbols-outlined text-[16px]">alternate_email</span>
                        X
                      </TwitterShareButton>
                      <ThreadsShareButton
                        url={shareUrl}
                        title={shareTitle}
                        className="inline-flex items-center justify-center gap-1 rounded-full border border-border-light bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-semibold text-text-main"
                      >
                        <span className="material-symbols-outlined text-[16px]">forum</span>
                        Threads
                      </ThreadsShareButton>
                      <FacebookShareButton
                        url={shareUrl}
                        hashtag="#LifeReels"
                        className="inline-flex items-center justify-center gap-1 rounded-full border border-border-light bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-semibold text-text-main"
                      >
                        <span className="material-symbols-outlined text-[16px]">thumb_up</span>
                        Facebook
                      </FacebookShareButton>
                      <button
                        type="button"
                        onClick={handleInstagramShare}
                        className="inline-flex items-center justify-center gap-1 rounded-full border border-border-light bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-semibold text-text-main"
                      >
                        <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                        Instagram
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="inline-flex items-center justify-center gap-1 rounded-full border border-border-light bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-semibold text-text-main"
                      >
                        <span className="material-symbols-outlined text-[16px]">content_copy</span>
                        Copy Link
                      </button>
                    </div>
                    {shareStatus ? <p className="mt-2 text-[11px] text-text-muted">{shareStatus}</p> : null}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex items-center justify-center gap-2 bg-white text-text-muted font-medium py-3 px-4 rounded-xl border border-gray-200 transition-colors shadow-sm"
                    onClick={() => (window.location.hash = `#/loading?id=${encodeURIComponent(props.jobId)}`)}
                  >
                    <span className="material-symbols-outlined">hourglass_top</span>
                    View progress
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateAnother}
                    className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-text-muted font-medium py-2 px-4 rounded-xl border border-border-light transition-colors text-sm"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                    Create Another
                  </button>
                </>
              )}

              {error ? (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold">
                  <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Right: diary card */}
          <div className="flex flex-col w-full lg:max-w-md mt-4 lg:mt-0 items-center lg:items-start">
            <div className="w-full max-w-[360px] aspect-[9/16] animate-slide-up">
              <DiaryGraphPaperCard className="h-full max-w-none" fill title={title} narrations={lines} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
