import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CaptionEmoji, LayoutPreset, ReelShotV3, ShotAssets, SubtitlePreset } from "./types";
import { motionStyle } from "./motion";
import { HEADER_HEIGHT } from "./Header";
import { theme } from "./theme";
import { KYOB0_HANDWRITING_2019 } from "./fonts";

const diaryFont =
  `'${KYOB0_HANDWRITING_2019}', "Batang", "Georgia", "Times New Roman", "Apple SD Gothic Neo", "Malgun Gothic", serif`;

const narrationHint: React.CSSProperties = {
  position: "absolute",
  top: 40,
  left: 40,
  right: 40,
  color: "rgba(255,255,255,0.85)",
  fontSize: 24,
  lineHeight: 1.3,
  textShadow: "0 2px 10px rgba(0,0,0,0.35)",
};

const InlineEmoji: React.FC<{ emoji?: CaptionEmoji | string | null }> = ({ emoji }) => {
  if (!emoji) return null;

  if (typeof emoji === "string") {
    return (
      <span
        style={{
          marginLeft: 10,
          fontSize: 34,
          verticalAlign: "baseline",
          opacity: 0.95,
        }}
        aria-hidden="true"
      >
        {emoji}
      </span>
    );
  }

  const src = emoji.src.startsWith("http")
    ? emoji.src
    : staticFile(emoji.src.replace(/^SampleResource\//, ""));

  return (
    <span
      style={{
        marginLeft: 10,
        display: "inline-flex",
        alignItems: "center",
        transform: "translateY(2px)",
        opacity: 0.96,
      }}
      aria-hidden="true"
    >
      <Img
        src={src}
        style={{
          width: 38,
          height: 38,
        }}
      />
    </span>
  );
};

const KineticSubtitle: React.FC<{
  shot: ReelShotV3;
  preset: SubtitlePreset;
  emoji?: CaptionEmoji | string | null;
}> = ({ shot, preset, emoji }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    fps,
    frame,
    config: { damping: 16, stiffness: 130, mass: 0.75 },
  });

  const emphasis = new Set(shot.narration_direction.delivery.emphasis_words ?? []);
  const words = shot.subtitle.split(/\s+/g).filter(Boolean);

  if (preset === "overlay_gradient") {
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: 44,
            right: 44,
            bottom: 42,
            // Vellum-like caption: warm translucent cream that lets the image show through.
            padding: "20px 22px",
            borderRadius: 22,
            backgroundColor: "rgba(255, 252, 244, 0.72)",
            backgroundImage:
              "radial-gradient(520px 160px at 30% 20%, rgba(255,255,255,0.52), rgba(255,255,255,0) 60%), radial-gradient(520px 160px at 80% 90%, rgba(212, 178, 140, 0.10), rgba(255,255,255,0) 65%)",
            border: "1px solid rgba(72, 56, 42, 0.06)",
            boxShadow:
              "0 28px 90px rgba(40, 28, 18, 0.14), 0 10px 40px rgba(40, 28, 18, 0.08)",
            backdropFilter: "blur(14px) saturate(1.06)",
            color: theme.ink,
            fontFamily: diaryFont,
            fontSize: 40,
            fontWeight: 520,
            letterSpacing: -0.35,
            lineHeight: 1.28,
            textAlign: "left",
            textShadow: "0 1px 0 rgba(255,255,255,0.35)",
            transform: `translateY(${(1 - enter) * 14}px)`,
            opacity: enter,
          }}
        >
          {words.map((w, i) => {
            const clean = w.replace(/[.,!?]/g, "");
            const isEmph = emphasis.has(clean);
            const scale = isEmph ? 1 + Math.min(0.08, enter * 0.08) : 1;
            const color = isEmph ? theme.ink : "rgba(78, 52, 46, 0.86)";
            return (
              <span
                key={`${i}-${w}`}
                style={{
                  display: "inline-block",
                  marginRight: 10,
                  transform: `scale(${scale})`,
                  color,
                }}
              >
                {w}
              </span>
            );
          })}
          <InlineEmoji emoji={emoji} />
        </div>
      </AbsoluteFill>
    );
  }

  // Fallback presets (kept for compatibility).
  const baseBox: React.CSSProperties =
    preset === "clean_text"
      ? {}
      : {
          // "Vellum paper" caption box: translucent warm cream, softly edged, image shows through.
          padding: "18px 22px",
          borderRadius: 22,
          backgroundColor: "rgba(255, 252, 244, 0.66)",
          backgroundImage:
            "radial-gradient(520px 160px at 20% 10%, rgba(255,255,255,0.55), rgba(255,255,255,0) 62%), radial-gradient(520px 160px at 90% 90%, rgba(212, 178, 140, 0.10), rgba(255,255,255,0) 68%)",
          boxShadow:
            "0 26px 90px rgba(40, 28, 18, 0.16), 0 10px 40px rgba(40, 28, 18, 0.08)",
          // No frame/border stroke (requested thickness = 0).
          border: "1px solid rgba(72, 56, 42, 0.06)",
          backdropFilter: "blur(14px) saturate(1.06)",
        };

  return (
    <div
      style={{
        position: "absolute",
        left: 56,
        right: 56,
        bottom: 86,
        color: theme.ink,
        fontFamily: diaryFont,
        fontSize: 46,
        fontWeight: 560,
        letterSpacing: -0.35,
        lineHeight: 1.28,
        textAlign: "center",
        textShadow: "0 2px 12px rgba(0,0,0,0.12)",
        transform: `translateY(${(1 - enter) * 14}px)`,
        opacity: enter,
        ...baseBox,
      }}
    >
      <span>{words.join(" ")}</span>
      <InlineEmoji emoji={emoji} />
    </div>
  );
};

export const Shot: React.FC<{
  shot: ReelShotV3;
  assets: ShotAssets;
  durationInFrames: number;
  audioStartInFrames: number;
  audioDurationInFrames: number;
  overlapInFrames: number;
  overlapOutFrames: number;
  endFadeOutFrames: number;
  layoutPreset: LayoutPreset;
  subtitlePreset: SubtitlePreset;
  captionEmoji?: CaptionEmoji | string | null;
  showDebug: boolean;
}> = ({
  shot,
  assets,
  durationInFrames,
  audioStartInFrames,
  audioDurationInFrames,
  overlapInFrames,
  overlapOutFrames,
  endFadeOutFrames,
  layoutPreset,
  subtitlePreset,
  captionEmoji,
  showDebug,
}) => {
  const frame = useCurrentFrame();

  // Matte (the "white outline" around the photo). User requested ~half thickness vs original.
  const MATTE_PX = 14; // was 28

  const imgSrc = assets.image_src.startsWith("http")
    ? assets.image_src
    : staticFile(assets.image_src.replace(/^SampleResource\//, ""));
  const audioSrc = assets.audio_src.startsWith("http")
    ? assets.audio_src
    : staticFile(assets.audio_src.replace(/^SampleResource\//, ""));

  const style = motionStyle({ shot, localFrame: frame, durationInFrames });

  const fadeIn = overlapInFrames > 0 ? overlapInFrames : 8;
  const fadeOut =
    overlapOutFrames > 0 ? overlapOutFrames : endFadeOutFrames > 0 ? endFadeOutFrames : 0;
  const inOp =
    fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const outOp =
    fadeOut > 0
      ? interpolate(
          frame,
          [Math.max(0, durationInFrames - fadeOut), Math.max(1, durationInFrames - 1)],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      : 1;
  const opacity = Math.min(inOp, outOp);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", opacity }}>
      {layoutPreset === "frame_matte" ? (
        <AbsoluteFill
          style={{
            paddingLeft: 56,
            paddingRight: 56,
            paddingTop: HEADER_HEIGHT + 34,
            paddingBottom: 72,
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              borderRadius: 46,
              background: theme.paper,
              border: "0px",
              boxShadow: theme.shadow,
              overflow: "hidden",
            }}
          >
            {/* Matte inset: paper shows as a soft "white outline" around the photo. */}
            <div
              style={{
                position: "absolute",
                left: MATTE_PX,
                right: MATTE_PX,
                top: MATTE_PX,
                bottom: MATTE_PX,
                borderRadius: 42,
                overflow: "hidden",
                background: "rgba(0,0,0,0.02)",
              }}
            >
              <AbsoluteFill style={style}>
                <Img
                  src={imgSrc}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: "saturate(1.04) contrast(1.02)",
                  }}
                />
              </AbsoluteFill>

              <KineticSubtitle shot={shot} preset={subtitlePreset} emoji={captionEmoji} />
            </div>
          </div>
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <AbsoluteFill style={style}>
            <Img src={imgSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </AbsoluteFill>
          <KineticSubtitle shot={shot} preset={subtitlePreset} emoji={captionEmoji} />
        </AbsoluteFill>
      )}

      <Sequence from={audioStartInFrames} durationInFrames={audioDurationInFrames}>
        <Audio src={audioSrc} />
      </Sequence>

      {showDebug ? (
        <div style={narrationHint}>
          <div>
            {shot.shot_id} | {shot.narration_direction.label}{" "}
            {Math.round(shot.narration_direction.intensity * 100) / 100}
          </div>
          <div style={{ opacity: 0.9 }}>{shot.narration_direction.tts_instruction}</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
