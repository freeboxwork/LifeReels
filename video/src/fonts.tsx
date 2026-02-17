import React from "react";

export const KYOB0_HANDWRITING_2019 = "KyoboHandwriting2019";

// Loaded via @font-face so Remotion's Chromium renderer can use it.
// If the CDN is unreachable in some environments, it will fall back to serif.
export const KyoboFontFace: React.FC = () => {
  return (
    <style>
      {`
@font-face {
  font-family: '${KYOB0_HANDWRITING_2019}';
  /* Kyobo handwriting webfont via Noonnu jsDelivr mirror. */
  src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2112@1.0/KyoboHandwriting2020A.woff') format('woff');
  font-weight: normal;
  font-style: normal;
}
      `.trim()}
    </style>
  );
};
