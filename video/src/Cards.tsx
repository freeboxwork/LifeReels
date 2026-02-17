import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { KYOB0_HANDWRITING_2019 } from "./fonts";

const diaryFont =
  `'${KYOB0_HANDWRITING_2019}', "Batang", "Georgia", "Times New Roman", "Apple SD Gothic Neo", "Malgun Gothic", serif`;

const baseWrap: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const formatDate = (d?: string) => {
  if (!d) return "";
  const s = String(d).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return s;
  const yyyy = m[1];
  const mm = m[2].padStart(2, "0");
  const dd = m[3].padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
};

export const OpeningCard: React.FC<{ title: string; tone?: string; date?: string }> = ({
  title,
  tone,
  date,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 120, mass: 0.75 },
  });
  const out = interpolate(
    frame,
    [Math.max(0, durationInFrames - 10), durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const dateText = formatDate(date);

  return (
    <AbsoluteFill style={baseWrap}>
      {/* Intro background: remove global pattern. Keep warm cream only. */}
      <AbsoluteFill
        style={{
          backgroundColor: theme.bg,
          // No texture/pattern on intro background (plain warm cream only).
          backgroundImage: "none",
        }}
      />
      <div
        style={{
          width: 940,
          borderRadius: 56,
          padding: "62px 64px",
          background: theme.paper,
          border: "0px",
          boxShadow: "none",
          fontFamily: diaryFont,
          transform: `translateY(${(1 - enter) * 18}px)`,
          opacity: Math.min(1, enter * 1.15) * out,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 18,
          }}
        >
          <div
            style={{
              color: theme.inkMuted,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 2.1,
              textTransform: "uppercase",
            }}
          >
            LifeReel
          </div>
          {dateText ? (
            <div style={{ color: theme.inkMuted, fontSize: 14, fontWeight: 600, letterSpacing: 0.9 }}>
              {dateText}
            </div>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 20,
            color: theme.ink,
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: -1.3,
            lineHeight: 1.04,
            wordBreak: "keep-all",
          }}
        >
          {title || "LifeReel"}
        </div>

        {tone ? (
          <div
            style={{
              marginTop: 18,
              color: theme.inkMuted,
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: -0.2,
            }}
          >
            {tone}
          </div>
        ) : null}

        <div style={{ marginTop: 44, height: 1, background: "rgba(72,56,42,0.10)" }} />

        <div
          style={{
            marginTop: 18,
            color: theme.inkMuted,
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 0.2,
          }}
        >
          A cherished, physical photo journal.
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const EndingCard: React.FC<{ title?: string; date?: string }> = ({ title, date }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 120, mass: 0.75 },
  });

  const fadeToCream = interpolate(
    frame,
    [Math.max(0, durationInFrames - 18), durationInFrames - 1],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const dateText = formatDate(date);

  return (
    <AbsoluteFill style={{ ...baseWrap, backgroundColor: `rgba(255, 251, 240, ${fadeToCream})` }}>
      <div
        style={{
          width: 940,
          borderRadius: 56,
          padding: "56px 64px",
          background: theme.paper,
          border: "0px",
          // Remove outro card shadow (requested).
          boxShadow: "none",
          fontFamily: diaryFont,
          transform: `translateY(${(1 - enter) * 16}px)`,
          opacity: Math.min(1, enter * 1.15) * (1 - fadeToCream * 0.25),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 18,
          }}
        >
          <div
            style={{
              color: theme.ink,
              fontSize: 42,
              fontWeight: 850,
              letterSpacing: -1.0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title || "LifeReel"}
          </div>
          {dateText ? (
            <div style={{ color: theme.inkMuted, fontSize: 14, fontWeight: 700, letterSpacing: 0.9 }}>
              {dateText}
            </div>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 16,
            color: theme.inkMuted,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: -0.2,
          }}
        >
          Today's diary became a short reel.
        </div>
      </div>
    </AbsoluteFill>
  );
};
