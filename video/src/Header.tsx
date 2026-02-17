import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { KYOB0_HANDWRITING_2019 } from "./fonts";

export const HEADER_HEIGHT = 96;

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

const diaryFont =
  `'${KYOB0_HANDWRITING_2019}', "Batang", "Georgia", "Times New Roman", "Apple SD Gothic Neo", "Malgun Gothic", serif`;

export const Header: React.FC<{ title: string; tone?: string; date?: string }> = ({
  title,
  tone,
  date,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 140, mass: 0.75 },
  });

  const dateText = formatDate(date);
  const toneText = tone ? String(tone).trim() : "";

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        zIndex: 5000,
        opacity: Math.min(1, enter * 1.15),
        transform: `translateY(${(1 - enter) * -10}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 56,
          right: 56,
          top: 34,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 18,
          fontFamily: diaryFont,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: theme.ink,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: -0.6,
              lineHeight: 1.05,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title || "LifeReel"}
          </div>
          {toneText ? (
            <div
              style={{
                marginTop: 6,
                color: theme.inkMuted,
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: -0.15,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {toneText}
            </div>
          ) : null}
        </div>

        {dateText ? (
          <div
            style={{
              flex: "0 0 auto",
              color: theme.inkMuted,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.8,
            }}
          >
            {dateText}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
