export const theme = {
  // Warm, cozy palette (no pure white).
  bg: "#FFFBF0",
  bg2: "#F3EBDD",
  ink: "rgba(78, 52, 46, 0.92)", // warm deep brown (#4E342E-ish)
  inkMuted: "rgba(88, 72, 58, 0.66)",
  paper: "rgba(255, 252, 244, 0.86)",
  paperBorder: "rgba(72, 56, 42, 0.10)",
  shadow: "0 80px 240px rgba(40, 28, 18, 0.12), 0 26px 110px rgba(40, 28, 18, 0.08)",
} as const;

// Background patterns are intentionally disabled (requested).
export const paperTextureBackground = () =>
  [
    `linear-gradient(180deg, ${theme.bg} 0%, ${theme.bg2} 100%)`,
  ].join(", ");
