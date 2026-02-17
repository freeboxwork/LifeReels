import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const FadeInOut: React.FC<{
  inFrames?: number;
  outFrames?: number;
  children: React.ReactNode;
}> = ({
  inFrames = 6,
  outFrames = 10,
  children,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const inOp = interpolate(frame, [0, inFrames], [0, 1], { extrapolateRight: "clamp" });
  const outOp = interpolate(
    frame,
    [Math.max(0, durationInFrames - outFrames), durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: "clamp" },
  );

  return <AbsoluteFill style={{ opacity: Math.min(inOp, outOp) }}>{children}</AbsoluteFill>;
};
