import { useState } from "react";

type ScriptShot = {
  shot_id: string;
  duration_seconds: number;
  visual_description: string;
  subtitle: string;
  narration: string;
  image_prompt: string;
  transition: string;
};

type ScriptResult = {
  schema_version: string;
  language: string;
  total_duration_seconds: number;
  title: string;
  tone: string;
  shots: ScriptShot[];
};

const MODEL = import.meta.env.VITE_OPENAI_MODEL ?? "gpt-4.1-mini";

function buildPrompt(diaryText: string) {
  return `
You generate a short-form scenario JSON from a diary.
Output must be ONLY valid JSON object (no markdown, no explanation).
Schema:
{
  "schema_version": "reels_script_v1",
  "language": "ko",
  "total_duration_seconds": 15,
  "title": "string",
  "tone": "string",
  "shots": [
    {
      "shot_id": "s1",
      "duration_seconds": 3,
      "visual_description": "string",
      "subtitle": "string",
      "narration": "string",
      "image_prompt": "string",
      "transition": "cut|fade|crossfade|zoom_in|zoom_out|slide_left|slide_right"
    }
  ]
}
Rules:
- Use Korean language.
- total duration must be exactly 15.
- Keep 5 shots by default.
- Base strictly on diary text. Do not invent concrete sensitive personal data.

Diary:
${diaryText}
  `.trim();
}

export default function DiaryScenarioPrototype() {
  const [diaryText, setDiaryText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [rawJson, setRawJson] = useState("");

  async function handleGenerateScenario() {
    if (!diaryText.trim()) {
      setError("일기 내용을 먼저 입력해 주세요.");
      return;
    }

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
    if (!apiKey) {
      setError("VITE_OPENAI_API_KEY 환경변수를 설정해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setRawJson("");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          input: [
            {
              role: "user",
              content: [{ type: "text", text: buildPrompt(diaryText) }],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${errBody}`);
      }

      const data = (await response.json()) as { output_text?: string };
      const outputText = data.output_text?.trim();
      if (!outputText) {
        throw new Error("시나리오 응답이 비어 있습니다.");
      }

      setRawJson(outputText);
      const parsed = JSON.parse(outputText) as ScriptResult;
      setResult(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "시나리오 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-card prototype-card">
      <h1>Diary to Scenario (Prototype)</h1>
      <label htmlFor="diaryText">일기 입력</label>
      <textarea
        id="diaryText"
        value={diaryText}
        onChange={(e) => setDiaryText(e.target.value)}
        placeholder="오늘 있었던 일을 자유롭게 적어주세요."
        rows={8}
      />
      <button type="button" onClick={handleGenerateScenario} disabled={loading}>
        {loading ? "생성 중..." : "완성"}
      </button>

      {error && <p className="message err">{error}</p>}

      {result && (
        <div className="scenario-result">
          <h3>{result.title}</h3>
          <p>
            톤: {result.tone} | 길이: {result.total_duration_seconds}초
          </p>
          {result.shots?.map((shot) => (
            <div key={shot.shot_id} className="shot-item">
              <strong>
                {shot.shot_id} ({shot.duration_seconds}s)
              </strong>
              <p>자막: {shot.subtitle}</p>
              <p>나레이션: {shot.narration}</p>
              <p>장면: {shot.visual_description}</p>
            </div>
          ))}
        </div>
      )}

      {!result && rawJson && (
        <pre className="raw-json">
          <code>{rawJson}</code>
        </pre>
      )}
    </section>
  );
}
