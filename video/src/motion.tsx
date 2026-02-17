import { Easing, interpolate } from "remotion";
import type { ReelShotV3 } from "./types";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const getMotionPreset = (label: ReelShotV3["narration_direction"]["label"]) => {
  switch (label) {
    case "anxious":
      return "pan";
    case "relieved":
    case "hopeful":
    case "determined":
      return "zoom_out";
    case "warm":
    case "grateful":
    case "calm":
    default:
      return "zoom_in";
  }
};

export const motionStyle = ({
  shot,
  localFrame,
  durationInFrames,
}: {
  shot: ReelShotV3;
  localFrame: number;
  durationInFrames: number;
}) => {
  const intensity = clamp(shot.narration_direction.intensity ?? 0.5, 0, 1);
  const preset = getMotionPreset(shot.narration_direction.label);

  const t = interpolate(localFrame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  const baseZoom = 1.03 + intensity * 0.06;
  const pan = 12 + intensity * 22;

  if (preset === "pan") {
    const x = interpolate(t, [0, 1], [-pan, pan]);
    return {
      transform: `scale(${baseZoom}) translateX(${x}px)`,
    };
  }

  if (preset === "zoom_out") {
    const z = interpolate(t, [0, 1], [baseZoom + 0.04, 1.0]);
    return {
      transform: `scale(${z})`,
    };
  }

  // zoom_in default
  const z = interpolate(t, [0, 1], [1.0, baseZoom + 0.04]);
  return {
    transform: `scale(${z})`,
  };
};
