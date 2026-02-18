import React from "react";

export const KYOB0_HANDWRITING_2019 = "KyoboHandwriting2019";

// Match Remotion's font setup (video/src/fonts.tsx).
export const KyoboFontFace: React.FC = () => {
  return (
    <style>
      {`
@font-face {
  font-family: '${KYOB0_HANDWRITING_2019}';
  src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2112@1.0/KyoboHandwriting2020A.woff') format('woff');
  font-weight: normal;
  font-style: normal;
}
      `.trim()}
    </style>
  );
};

