import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

type Scene = { id: string; text: string };

export default function DiaryCardSample() {
  const title = "오늘의 기록";
  const scenes: Scene[] = [
    { id: "s1", text: "아침, 커피 향이 방을 채웠다." },
    { id: "s2", text: "점심엔 해야 할 일을 하나씩 정리했다." },
    { id: "s3", text: "창밖 하늘이 잠깐 환해져 마음도 풀렸다." },
    { id: "s4", text: "저녁 산책으로 숨을 고르며 하루를 마무리했다." },
    { id: "s5", text: "내일은 조금 더 가볍게 시작해 보기로 했다." },
  ];

  return (
    <section className="w-full max-w-[420px]">
      <Card
        className="relative overflow-hidden"
        style={{
          backgroundImage: [
            "repeating-linear-gradient(to right, rgba(16,24,40,0.07) 0 1px, transparent 1px 18px)",
            "repeating-linear-gradient(to bottom, rgba(16,24,40,0.07) 0 1px, transparent 1px 18px)",
            "linear-gradient(180deg, #fffdf6 0%, #ffffff 55%, #fffaf1 100%)",
          ].join(","),
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.10]" style={{
          backgroundImage:
            "radial-gradient(circle at 12% 18%, rgba(0,0,0,0.22) 0 1px, transparent 1px 100%)",
          backgroundSize: "28px 28px",
        }} />
        <CardHeader className="relative">
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <ol className="grid gap-3">
            {scenes.map((s, idx) => (
              <li
                key={s.id}
                className="rounded-lg border border-black/10 bg-white/65 px-3 py-2 text-[14px] leading-6 backdrop-blur-[1px]"
              >
                <span className="mr-2 inline-block w-6 select-none text-right font-mono text-[12px] text-black/55">
                  {idx + 1}
                </span>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}

