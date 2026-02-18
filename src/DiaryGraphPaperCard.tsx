import { useEffect, useRef, useState } from "react";
import { KyoboFontFace } from "./KyoboFontFace";
import "./graph-paper.css";

const CELL = 20;
const ROW = CELL * 2;

const gridBg = () => {
  const faint = "rgba(160,185,210,0.13)";
  const strong = "rgba(140,170,200,0.22)";
  return {
    backgroundImage: `
      linear-gradient(${strong} 1px, transparent 1px),
      linear-gradient(${faint} 1px, transparent 1px),
      linear-gradient(90deg, ${faint} 1px, transparent 1px)
    `.trim(),
    backgroundSize: `100% ${ROW}px, 100% ${CELL}px, ${CELL}px 100%`,
    backgroundPosition: `0 ${ROW - 1}px, 0 0, 0 0`,
  } as const;
};

export default function DiaryGraphPaperCard(props: {
  title?: string;
  narrations?: string[];
  className?: string;
  fill?: boolean;
}) {
  const title = props.title?.trim() || "오늘의 기록";
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [isTwoLineTitle, setIsTwoLineTitle] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;

    const measure = () => {
      // Multi-line headings return multiple rects (one per line fragment).
      const rects = el.getClientRects();
      setIsTwoLineTitle(rects.length >= 2);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [title]);

  const dateStr = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const entries =
    props.narrations && props.narrations.length
      ? props.narrations
      : [
          "오늘의 감정과 장면을 모아",
          "짧은 문장으로 남겨두었습니다.",
          "천천히 읽어 내려가며",
          "내일의 나에게 건네는 말도",
          "한 줄쯤 적어보세요.",
        ];

  return (
    <section className={"w-full max-w-[540px] " + (props.className ?? "")}>
      <KyoboFontFace />

      <div
        className={
          "diary-graph-card graph-paper diary-graph-paper-font" +
          (props.fill ? " fill" : "") +
          (isTwoLineTitle ? " title-two-line" : "")
        }
      >
        <div className="margin-line-1" />
        <div className="margin-line-2" />

        <div className="paper-grid" style={gridBg()} />

        <div className="paper-content">
          <div className="title-block">
            <h2 ref={titleRef} className="title">
              {title}
            </h2>
          </div>

          {entries.map((text, i) => (
            <div key={i} className="entry-row">
              <span className="entry-text">{text}</span>
            </div>
          ))}

          {Array.from({ length: 2 }).map((_, i) => (
            <div key={`b${i}`} className="entry-row" />
          ))}

          <div className="entry-row" style={{ justifyContent: "flex-end", paddingRight: 10 }}>
            <span className="entry-text" style={{ fontSize: 14, opacity: 0.6, paddingLeft: 0 }}>
              {dateStr}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
