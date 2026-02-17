import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import type { LayoutPreset, RenderInput, SubtitlePreset } from "./types";
import { Shot } from "./Shot";
import { Header } from "./Header";
import { EndingCard, OpeningCard } from "./Cards";
import { paperTextureBackground } from "./theme";
import { KyoboFontFace } from "./fonts";

const stripPrefix = (p: string) => p.replace(/^SampleResource\//, "");
const isHttpUrl = (p: string) => /^https?:\/\//i.test(String(p));

const emojiForLabel = (labelRaw: string) => {
  const label = String(labelRaw || "").toLowerCase();
  switch (label) {
    case "calm":
      return "🕊️";
    case "warm":
      return "☕";
    case "anxious":
      return "😬";
    case "relieved":
      return "😌";
    case "grateful":
      return "🙏";
    case "joyful":
      return "😄";
    case "lonely":
      return "🌙";
    case "bittersweet":
      return "🥲";
    case "hopeful":
      return "🌱";
    case "tired":
      return "😮‍💨";
    case "playful":
      return "😆";
    case "determined":
      return "💪";
    default:
      return "";
  }
};

const pickCaptionEmojis = (
  script: RenderInput["script"],
  maxPerVideo: number,
): Record<string, string> => {
  const shots = script?.shots ?? [];
  const max = Math.max(0, Math.min(6, Math.floor(maxPerVideo || 0)));
  if (max <= 0) return {};

  // Choose a small number of "highlight" shots: highest intensity first.
  const ranked = shots
    .map((s, idx) => ({
      idx,
      shot_id: s.shot_id,
      intensity: Number(s.narration_direction?.intensity ?? 0),
      label: String(s.narration_direction?.label ?? ""),
    }))
    .sort((a, b) => (b.intensity - a.intensity) || (a.idx - b.idx));

  const out: Record<string, string> = {};
  const usedLabels = new Set<string>();
  for (const r of ranked) {
    if (Object.keys(out).length >= max) break;
    const e = emojiForLabel(r.label);
    if (!e) continue;
    // Prefer variety.
    if (usedLabels.has(r.label) && ranked.length > max) continue;
    usedLabels.add(r.label);
    out[r.shot_id] = e;
  }

  // If still short, fill remaining even if label repeats.
  if (Object.keys(out).length < max) {
    for (const r of ranked) {
      if (Object.keys(out).length >= max) break;
      if (out[r.shot_id]) continue;
      const e = emojiForLabel(r.label);
      if (!e) continue;
      out[r.shot_id] = e;
    }
  }

  return out;
};

export const Composition: React.FC<RenderInput> = ({
  script,
  render_params,
  render_plan,
  caption_emojis_by_shot_id,
}) => {
  if (!render_plan) {
    throw new Error(
      "Missing render_plan. Variable duration rendering requires calculateMetadata to compute it.",
    );
  }

  const layoutPreset: LayoutPreset =
    render_params?.layout_preset ?? "full_bg_sub_bottom";
  const subtitlePreset: SubtitlePreset =
    (render_params?.subtitle_preset as SubtitlePreset | undefined) ?? "overlay_gradient";
  const showDebug = Boolean(render_params?.show_debug_hints);
  const showTitle = render_params?.show_title ?? true;

  const emojisByShotId = caption_emojis_by_shot_id ?? {};

  const bgmRaw = render_params?.bgm_src ? String(render_params.bgm_src) : null;
  const bgmRel = bgmRaw ? stripPrefix(bgmRaw) : null;
  const bgmSrc = bgmRaw ? (isHttpUrl(bgmRaw) ? bgmRaw : staticFile(bgmRel || "")) : null;

  const openingEnabled = render_params?.opening_card ?? true;
  const endingEnabled = render_params?.ending_card ?? true;
  const openingFrames = openingEnabled ? (render_plan.opening?.durationInFrames ?? 0) : 0;
  const endingFrames = endingEnabled ? (render_plan.ending?.durationInFrames ?? 0) : 0;
  const endingFrom = render_plan.ending?.from ?? Math.max(0, render_plan.durationInFrames - endingFrames);

  // Defaults tuned to be clearly audible while narration remains primary.
  const bgmBase = Math.max(0, Math.min(1, render_params?.bgm_volume ?? 0.22));
  const bgmDuck = Math.max(0, Math.min(1, render_params?.bgm_duck_volume ?? 0.1));
  const attack = Math.max(1, render_params?.bgm_duck_attack_frames ?? 8);
  const release = Math.max(1, render_params?.bgm_duck_release_frames ?? 10);
  const fadeInMs = Math.max(0, render_params?.bgm_fade_in_ms ?? 300);
  const fadeOutMs = Math.max(0, render_params?.bgm_fade_out_ms ?? 1200);
  const fadeInFrames = Math.max(0, Math.round((fadeInMs / 1000) * render_plan.fps));
  const fadeOutFrames = Math.max(0, Math.round((fadeOutMs / 1000) * render_plan.fps));

  const narrationWindows = render_plan.shots.map((s) => ({
    start: s.from + s.audioStartInFrames,
    end: s.from + s.audioStartInFrames + s.audioDurationInFrames,
  }));

  const bgmVolume = (frame: number) => {
    let v = bgmBase;

    for (const w of narrationWindows) {
      if (frame >= w.start && frame <= w.end) {
        v = bgmDuck;
        break;
      }
      if (frame < w.start && frame >= w.start - attack) {
        const t = interpolate(frame, [w.start - attack, w.start], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        v = bgmBase + (bgmDuck - bgmBase) * t;
        break;
      }
      if (frame > w.end && frame <= w.end + release) {
        const t = interpolate(frame, [w.end, w.end + release], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        v = bgmDuck + (bgmBase - bgmDuck) * t;
        break;
      }
    }

    // Start/End fades so long BGM tracks end naturally with the video.
    if (fadeInFrames > 0) {
      const t = interpolate(frame, [0, fadeInFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      v *= t;
    }
    if (fadeOutFrames > 0) {
      const start = Math.max(0, render_plan.durationInFrames - fadeOutFrames);
      const t = interpolate(frame, [start, render_plan.durationInFrames - 1], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      v *= t;
    }
    return v;
  };

  const shots = render_plan.shots.map((p, i) => {
    const shot = script.shots[i];
    return (
      <Sequence key={p.shot_id} from={p.from} durationInFrames={p.durationInFrames}>
        <Shot
          shot={shot}
          assets={p.assets}
          durationInFrames={p.durationInFrames}
          audioStartInFrames={p.audioStartInFrames}
          audioDurationInFrames={p.audioDurationInFrames}
          overlapInFrames={p.overlapInFrames ?? 0}
          overlapOutFrames={p.overlapOutFrames ?? 0}
          endFadeOutFrames={p.endFadeOutFrames ?? 0}
          layoutPreset={layoutPreset}
          subtitlePreset={subtitlePreset}
          captionEmoji={emojisByShotId[shot.shot_id] ?? null}
          showDebug={showDebug}
        />
      </Sequence>
    );
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#FFFBF0",
        // No background pattern/texture. Keep a soft warm gradient only.
        backgroundImage: paperTextureBackground(),
      }}
    >
      <KyoboFontFace />
      {bgmSrc ? <Audio src={bgmSrc} volume={bgmVolume} loop /> : null}

      {openingFrames > 0 ? (
        <Sequence from={0} durationInFrames={openingFrames}>
          <OpeningCard title={script.title} tone={script.tone} date={script.date} />
        </Sequence>
      ) : null}

      {shots}

      {endingFrames > 0 ? (
        <Sequence from={endingFrom} durationInFrames={endingFrames}>
          <EndingCard title={script.title} date={script.date} />
        </Sequence>
      ) : null}

      {showTitle ? (
        <Sequence from={0} durationInFrames={render_plan.durationInFrames}>
          <Header title={script.title} tone={script.tone} date={script.date} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
