import { useEffect, useState } from "react";
import type { ReelScriptV2, ReelShotV2 } from "./lib/reelsScriptTypes";
import { parseAndValidateScenarioV2 } from "./lib/reelsScriptValidation";
import {
  generateElevenLabsNarrationAudio,
  generateElevenLabsNarrationAudioViaProxy,
} from "./lib/elevenlabsTts";

type ResponsesApiResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type GeneratedAsset = {
  shotId: string;
  subtitle: string;
  narration: string;
  imageUrl: string;
  prompt: string;
  narrationDirection: ReelShotV2["narration_direction"];
};

const MODEL = import.meta.env.VITE_OPENAI_MODEL ?? "gpt-4.1-mini";
const IMAGE_MODEL = "gpt-image-1.5";
const MAX_SCENARIO_RETRY = 2;
const MAX_ASSET_CONCURRENCY = 3;
const MAX_ASSET_RETRIES = 2;
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const ELEVENLABS_MODEL =
  (import.meta.env.VITE_ELEVENLABS_MODEL_ID as string | undefined) ??
  "eleven_flash_v2_5";
const ELEVENLABS_VOICE_NAME =
  (import.meta.env.VITE_ELEVENLABS_VOICE_NAME as string | undefined) ??
  "Hyein - Calm & Professional";

const BASE_STYLE =
  "Art Style: Warm animation background painting mixed with cinematic film photography. Geography: Modern South Korea, Seoul city vibe, clean streets, power lines against the sky. Texture: Soft watercolor feel, gentle hand-painted textures, subtle film grain. Lighting: Soft natural daylight, warm palette, shallow depth of field (bokeh). Vibe: Nostalgic, cozy, calm, sentimental, emotional.";

const CHARACTER_ANCHOR =
  "Presence Rule: ABSOLUTELY NO HUMANS. No people, no faces, no silhouettes, no hands/arms/legs, no body parts. Text Rule: ABSOLUTELY NO TEXT. No letters, no numbers, no signage, no labels, no menus, no posters, no captions anywhere in the image. Camera Role: Invisible observer capturing still life or landscape. Composition: Cinematic composition, rule of thirds, focus on inanimate objects and environmental details (light rays, steam, wind). Scale Rule: Realistic proportions, normal scale, no forced perspective, no wide-angle distortion. Lens/feel: 50mm natural perspective. Street Rule (when outdoors): empty streets only, no pedestrians, no crossing people, no cropped passersby.";

const NEGATIVE_PROMPT =
  "any text, readable text, letters, typography, words, numbers, subtitles, captions, Hangul, Korean text, Korean characters, Hanja, Chinese characters, Japanese text, Kanji, Hiragana, Katakana, sign, signage, signboard, shop sign, neon sign, billboard, poster, menu, label, packaging text, street name, watermark, signature, logo, video game, FPS, first-person shooter, HUD, UI overlay, game screenshot, VR, person, people, human, crowd, face, body parts, silhouette, hands, arms, legs, pedestrian, passerby, crossing, walking person, street crossing, crosswalk person, close-up legs, close-up shoes, cropped body, giant legs, oversized shoes, foreground legs, low angle, floating hands, holding objects, eating, drinking, touching, distorted perspective, surreal scale, giant objects, miniature world.";

function buildPrompt(diaryText: string) {
  return `
You are a strict JSON generator for a short-form video scenario.
Return ONLY a valid JSON object. No markdown. No comments.
Schema version must be reels_script_v2.

Output schema:
{
  "schema_version": "reels_script_v2",
  "language": "ko",
  "total_duration_seconds": 15,
  "title": "string",
  "tone": "string",
  "narration_defaults": {
    "label": "optional",
    "intensity": 0.5,
    "delivery": {
      "speaking_rate": 1.0,
      "energy": 0.5,
      "pause_ms_before": 150,
      "pause_ms_after": 150
    },
    "tts_instruction": "optional global default"
  },
  "shots": [
    {
      "shot_id": "s1",
      "duration_seconds": 3,
      "visual_description": "string",
      "subtitle": "string",
      "narration": "string",
      "image_prompt": "string",
      "transition": "cut|fade|crossfade|zoom_in|zoom_out|slide_left|slide_right",
      "narration_direction": {
        "label": "calm|warm|anxious|relieved|grateful|joyful|lonely|bittersweet|hopeful|tired|playful|determined",
        "intensity": 0.0,
        "arc_hint": "optional subtle arc hint",
        "delivery": {
          "speaking_rate": 1.0,
          "energy": 0.5,
          "pause_ms_before": 150,
          "pause_ms_after": 150,
          "emphasis_words": ["optional"]
        },
        "tts_instruction": "natural language direction for TTS"
      }
    }
  ]
}

Rules:
- language: ko
- total_duration_seconds must be 15 exactly
- sum(shots.duration_seconds) must be 15 exactly
- Use 5 shots by default
- Preserve privacy and avoid sensitive personal details
- narration_direction.label should reflect emotional arc (use at least 2 distinct labels across shots)
- Every shot must have a distinct tts_instruction text (no duplicates across shots)
- Do not output fields outside schema
- additionalProperties are forbidden

Diary:
${diaryText}
  `.trim();
}

function buildRepairPrompt(
  diaryText: string,
  previousJson: string,
  errors: string[],
) {
  return `
Your previous JSON did not pass validation. Rewrite it as valid reels_script_v2 JSON only.
Return ONLY a valid JSON object. No markdown. No comments.

Validation errors to fix:
${errors.map((e) => `- ${e}`).join("\n")}

Hard constraints:
- schema_version must be reels_script_v2
- total_duration_seconds must be 15
- sum(shots.duration_seconds) must be 15
- each shot must include narration_direction with required fields
- use at least 2 distinct narration_direction.label values across shots
- each shot must have a distinct tts_instruction text
- use only allowed labels taxonomy
- no additional properties

Diary:
${diaryText}

Previous invalid JSON:
${previousJson}
  `.trim();
}

function normalizeApiKey(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractHttpStatusFromError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/\b(408|409|425|429|500|502|503|504)\b/);
  return m ? Number(m[1]) : undefined;
}

function isRetriableError(err: unknown) {
  const status = extractHttpStatusFromError(err);
  if (status && RETRYABLE_HTTP_STATUSES.has(status)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /network|fetch failed|timeout|timed out|econnreset|enotfound|socket hang up/i.test(msg);
}

function computeRetryDelayMs(attempt: number, status?: number) {
  const base = status === 429 ? 1200 : 700;
  const jitter = Math.floor(Math.random() * 250);
  return base * 2 ** attempt + jitter;
}

async function withRetries<T>(fn: () => Promise<T>) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_ASSET_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ASSET_RETRIES || !isRetriableError(err)) {
        break;
      }
      await sleep(computeRetryDelayMs(attempt, extractHttpStatusFromError(err)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function mapWithConcurrencyAndRetry<T, R>({
  items,
  concurrency,
  worker,
}: {
  items: T[];
  concurrency: number;
  worker: (item: T, index: number) => Promise<R>;
}) {
  const results = new Array<R>(items.length);
  const maxWorkers = Math.max(1, Math.min(concurrency, items.length || 1));
  let cursor = 0;

  const runWorker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const value = await withRetries(() => worker(items[index], index));
      results[index] = value;
    }
  };

  await Promise.all(Array.from({ length: maxWorkers }, () => runWorker()));
  return results;
}

function extractTextFromResponse(data: ResponsesApiResponse) {
  if (data.output_text?.trim()) {
    return data.output_text.trim();
  }

  const chunks =
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((c) => c.type === "output_text" && typeof c.text === "string")
      .map((c) => c.text?.trim() ?? "")
      .filter(Boolean) ?? [];

  return chunks.join("\n").trim();
}

function buildImagePrompt(shot: ReelShotV2) {
  const rawInput = (shot.image_prompt?.trim() || shot.visual_description || "").replace(
    /^Scene:\s*/i,
    "",
  );
  const sceneCore = rawInput || "Quiet cinematic still life scene with environmental atmosphere.";
  const sceneDetail = `${sceneCore}${sceneCore.endsWith(".") ? "" : "."} Focus on inanimate objects and environmental details only. No humans visible.`;
  return `AESTHETIC_LENS:\n${BASE_STYLE}\n\nATMOSPHERE_ANCHOR:\n${CHARACTER_ANCHOR}\n\nSCENE_DETAIL:\n${sceneDetail}\n\nNEGATIVE:\n${NEGATIVE_PROMPT}`;
}

async function generateImage(apiKey: string, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: "1024x1536",
      quality: "low",
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Image generation failed: ${response.status} ${errBody}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  const item = data.data?.[0];
  if (!item) throw new Error("Image generation returned empty data.");
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;

  throw new Error("Image payload missing both url and b64_json.");
}

export default function DiaryScenarioPrototype() {
  const [diaryText, setDiaryText] = useState("");
  const [loading, setLoading] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineJobId, setPipelineJobId] = useState<string>("");
  const [pipelineStatus, setPipelineStatus] = useState<
    | {
        status: string;
        progress: number;
        message: string;
        error?: string;
        outputUrl?: string;
        totalShots?: number;
        completedShots?: number;
      }
    | undefined
  >(undefined);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [elevenLoading, setElevenLoading] = useState(false);
  const [elevenQuickLoading, setElevenQuickLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReelScriptV2 | null>(null);
  const [rawJson, setRawJson] = useState("");
  const [assets, setAssets] = useState<GeneratedAsset[]>([]);
  const [elevenAudioByShotId, setElevenAudioByShotId] = useState<
    Record<
      string,
      { audioUrl: string; payloadPreview: Record<string, unknown> }
    >
  >({});
  const [elevenQuickText, setElevenQuickText] = useState(
    "移댄럹濡???꺼 李쎄????됱븘, ?대윴???洹쇳솴???섎댋??",
  );
  const [elevenQuickInstruction, setElevenQuickInstruction] = useState(
    "Read slowly and calmly with a quiet, comfortable tone.",
  );
  const [elevenQuickAudio, setElevenQuickAudio] = useState<
    { audioUrl: string; payloadPreview: Record<string, unknown> } | undefined
  >(undefined);

  useEffect(() => {
    return () => {
      assets.forEach((asset) => {
        void asset;
      });
      Object.values(elevenAudioByShotId).forEach((item) => {
        if (item.audioUrl.startsWith("blob:")) URL.revokeObjectURL(item.audioUrl);
      });
      if (elevenQuickAudio?.audioUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(elevenQuickAudio.audioUrl);
      }
    };
  }, [assets, elevenAudioByShotId, elevenQuickAudio]);

  // Poll pipeline status while running.
  useEffect(() => {
    if (!pipelineJobId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const resp = await fetch(`/api/pipeline/status?id=${encodeURIComponent(pipelineJobId)}`);
        if (!resp.ok) return;
        const data = (await resp.json()) as {
          status: string;
          progress: number;
          message: string;
          error?: string;
          outputUrl?: string;
          totalShots?: number;
          completedShots?: number;
        };
        if (cancelled) return;
        setPipelineStatus(data);
        if (data.status === "done" || data.status === "error") {
          setPipelineLoading(false);
        }
      } catch {
        // ignore transient polling errors
      }
    };

    const handle = setInterval(() => void tick(), 900);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [pipelineJobId]);

  function getValidatedApiKey() {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
    if (!apiKey) {
      throw new Error("Set VITE_OPENAI_API_KEY in your environment variables.");
    }

    const normalizedApiKey = normalizeApiKey(apiKey);
    if (!normalizedApiKey.startsWith("sk-")) {
      throw new Error(
        "Invalid OpenAI API key format. Use a real key from https://platform.openai.com/api-keys (usually starts with sk-).",
      );
    }

    return normalizedApiKey;
  }

  async function handleGenerateScenario() {
    if (!diaryText.trim()) {
      setError("Enter your diary text first.");
      return;
    }

    let apiKey: string;
    try {
      apiKey = getValidatedApiKey();
    } catch (err) {
      setError(err instanceof Error ? err.message : "API key error.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setRawJson("");
    setAssets([]);
    setElevenAudioByShotId({});
    setElevenQuickAudio(undefined);

    try {
      let previousOutput = "";
      let lastValidationErrors: string[] = [];

      for (let attempt = 0; attempt <= MAX_SCENARIO_RETRY; attempt++) {
        const prompt =
          attempt === 0
            ? buildPrompt(diaryText)
            : buildRepairPrompt(diaryText, previousOutput, lastValidationErrors);

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
                content: [{ type: "input_text", text: prompt }],
              },
            ],
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          if (response.status === 401) {
            throw new Error(
              "OpenAI authentication failed (401). Check VITE_OPENAI_API_KEY in Cloudflare Pages Variables/Secrets and redeploy.",
            );
          }
          throw new Error(`OpenAI API error: ${response.status} ${errBody}`);
        }

        const data = (await response.json()) as ResponsesApiResponse;
        const outputText = extractTextFromResponse(data);
        if (!outputText) {
          throw new Error(
            "Scenario response was empty. Try again or switch model in VITE_OPENAI_MODEL.",
          );
        }

        previousOutput = outputText;
        setRawJson(outputText);

        const validation = parseAndValidateScenarioV2(outputText);
        if (validation.ok) {
          setResult(validation.value);
          return;
        }

        lastValidationErrors = validation.errors;
      }

      throw new Error(
        `Invalid reels_script_v2 after retries: ${lastValidationErrors.join(" | ")}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate scenario.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateAssets() {
    if (!result?.shots?.length) {
      setError("Generate a scenario first.");
      return;
    }

    let apiKey: string;
    try {
      apiKey = getValidatedApiKey();
    } catch (err) {
      setError(err instanceof Error ? err.message : "API key error.");
      return;
    }

    setAssetsLoading(true);
    setError("");

    try {
      const generated = await mapWithConcurrencyAndRetry({
        items: result.shots,
        concurrency: MAX_ASSET_CONCURRENCY,
        worker: async (shot) => {
          const prompt = buildImagePrompt(shot);
          const imageUrl = await generateImage(apiKey, prompt);
          return {
            shotId: shot.shot_id,
            subtitle: shot.subtitle,
            narration: shot.narration,
            imageUrl,
            prompt,
            narrationDirection: shot.narration_direction,
          } satisfies GeneratedAsset;
        },
      });

      setAssets((prev) => {
        void prev;
        return generated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate images.");
    } finally {
      setAssetsLoading(false);
    }
  }

  async function handleGenerateElevenLabsNarration() {
    if (!result?.shots?.length) {
      setError("Generate a scenario first.");
      return;
    }

    setElevenLoading(true);
    setError("");

    try {
      const voiceIdFromEnv = import.meta.env
        .VITE_ELEVENLABS_VOICE_ID as string | undefined;
      const voiceId = voiceIdFromEnv?.trim();
      if (!voiceId) {
        throw new Error(
          `Set VITE_ELEVENLABS_VOICE_ID (e.g. "${ELEVENLABS_VOICE_NAME}" voice id). For production, store ELEVENLABS_API_KEY as a Cloudflare Pages Secret and call via /api/elevenlabs/tts.`,
        );
      }

      const directApiKey = import.meta.env
        .VITE_ELEVENLABS_API_KEY as string | undefined;
      const directApiKeyNormalized =
        directApiKey?.trim() ? normalizeApiKey(directApiKey) : "";

      const next: Record<
        string,
        { audioUrl: string; payloadPreview: Record<string, unknown> }
      > = {};

      const generated = await mapWithConcurrencyAndRetry({
        items: result.shots,
        concurrency: MAX_ASSET_CONCURRENCY,
        worker: async (shot) => {
          const res = directApiKeyNormalized
            ? await generateElevenLabsNarrationAudio(
                directApiKeyNormalized,
                voiceId,
                shot,
                ELEVENLABS_MODEL,
              )
            : await generateElevenLabsNarrationAudioViaProxy(
                voiceId,
                shot,
                ELEVENLABS_MODEL,
              );
          return { shotId: shot.shot_id, res };
        },
      });

      generated.forEach(({ shotId, res }) => {
        next[shotId] = res;
      });

      setElevenAudioByShotId((prev) => {
        Object.values(prev).forEach((item) => {
          if (item.audioUrl.startsWith("blob:")) URL.revokeObjectURL(item.audioUrl);
        });
        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate ElevenLabs narration.",
      );
    } finally {
      setElevenLoading(false);
    }
  }

  async function handleGenerateElevenLabsQuickTts() {
    if (!elevenQuickText.trim()) {
      setError("Enter text to synthesize first.");
      return;
    }

    setElevenQuickLoading(true);
    setError("");

    try {
      const voiceIdFromEnv = import.meta.env
        .VITE_ELEVENLABS_VOICE_ID as string | undefined;
      const voiceId = voiceIdFromEnv?.trim();
      if (!voiceId) {
        throw new Error(
          "Set VITE_ELEVENLABS_VOICE_ID first (ElevenLabs voice id).",
        );
      }

      const directApiKey = import.meta.env
        .VITE_ELEVENLABS_API_KEY as string | undefined;
      const directApiKeyNormalized =
        directApiKey?.trim() ? normalizeApiKey(directApiKey) : "";

      const fakeShot: ReelShotV2 = {
        shot_id: "quick",
        duration_seconds: 3,
        visual_description: "n/a",
        subtitle: "n/a",
        narration: elevenQuickText.trim(),
        image_prompt: "n/a",
        transition: "cut",
        narration_direction: {
          label: "calm",
          intensity: 0.5,
          delivery: {
            speaking_rate: 0.92,
            energy: 0.35,
            pause_ms_before: 150,
            pause_ms_after: 150,
          },
          tts_instruction: elevenQuickInstruction.trim() || "Calm and professional.",
        },
      };

      const res = directApiKeyNormalized
        ? await generateElevenLabsNarrationAudio(
            directApiKeyNormalized,
            voiceId,
            fakeShot,
            ELEVENLABS_MODEL,
          )
        : await generateElevenLabsNarrationAudioViaProxy(
            voiceId,
            fakeShot,
            ELEVENLABS_MODEL,
          );

      setElevenQuickAudio((prev) => {
        if (prev?.audioUrl?.startsWith("blob:")) URL.revokeObjectURL(prev.audioUrl);
        return res;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate ElevenLabs audio.",
      );
    } finally {
      setElevenQuickLoading(false);
    }
  }

  async function startPipeline(imageMode: "v1" | "v2") {
    if (!diaryText.trim()) {
      setError("Enter your diary text first.");
      return;
    }

    setPipelineLoading(true);
    setPipelineJobId("");
    setPipelineStatus(undefined);
    setError("");

    try {
      const resp = await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diaryText: diaryText.trim(), imageMode }),
      });
      const text = await resp.text();
      if (!resp.ok) throw new Error(text || `Pipeline start failed: ${resp.status}`);
      const data = JSON.parse(text) as { id: string };
      setPipelineJobId(data.id);
    } catch (err) {
      setPipelineLoading(false);
      setError(err instanceof Error ? err.message : "Failed to start pipeline.");
    }
  }

  async function handleOneStopComplete() {
    await startPipeline("v1");
  }

  async function handleOneStopCompleteV2() {
    await startPipeline("v2");
  }

  return (
    <section className="auth-card prototype-card">
      <h1>Diary to Scenario (Prototype)</h1>
      <label htmlFor="diaryText">Diary</label>
      <textarea
        id="diaryText"
        value={diaryText}
        onChange={(e) => setDiaryText(e.target.value)}
        placeholder="Write your diary entry here."
        rows={8}
      />
      <div className="prototype-actions">
        <button
          type="button"
          onClick={handleOneStopComplete}
          disabled={pipelineLoading}
          title="One-stop: scenario -> images -> narration -> video render (local dev only)"
        >
          {pipelineLoading ? "Working..." : "Complete"}
        </button>
        <button
          type="button"
          onClick={handleOneStopCompleteV2}
          disabled={pipelineLoading}
          title="One-stop V2: IMAGE_GENERATION_V2 pipeline (local dev only)"
        >
          {pipelineLoading ? "Working..." : "Complete V2"}
        </button>
        <button type="button" onClick={handleGenerateScenario} disabled={loading}>
          {loading ? "Generating Scenario..." : "Scenario Only"}
        </button>
      </div>

      {pipelineStatus ? (
        <div className="pipeline-status">
          <div className="pipeline-row">
            <strong>Pipeline</strong>
            <span className="pipeline-meta">
              {pipelineStatus.message}{" "}
              {typeof pipelineStatus.completedShots === "number" &&
              typeof pipelineStatus.totalShots === "number"
                ? `(${pipelineStatus.completedShots}/${pipelineStatus.totalShots})`
                : ""}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.round(
                  clamp(Number(pipelineStatus.progress || 0), 0, 1) * 100,
                )}%`,
              }}
            />
          </div>
          <div className="pipeline-row">
            <span className="pipeline-meta">
              Status: {pipelineStatus.status} | {Math.round(clamp(pipelineStatus.progress, 0, 1) * 100)}%
            </span>
          </div>
          {pipelineStatus.error ? <p className="message err">{pipelineStatus.error}</p> : null}
          {pipelineStatus.outputUrl ? (
            <div className="pipeline-output">
              <video controls src={pipelineStatus.outputUrl} className="pipeline-video" />
              <a href={pipelineStatus.outputUrl} download={`lifereels-${pipelineJobId}.mp4`}>
                Download video
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {result && (
        <div className="prototype-actions">
          <button
            type="button"
            onClick={handleGenerateAssets}
            disabled={assetsLoading}
          >
            {assetsLoading ? "Generating Images..." : "Generate Images"}
          </button>
          <button
            type="button"
            onClick={handleGenerateElevenLabsNarration}
            disabled={elevenLoading}
          >
            {elevenLoading
              ? "Generating ElevenLabs Narration..."
              : "Generate Narration (ElevenLabs)"}
          </button>
        </div>
      )}

      {error && <p className="message err">{error}</p>}

      {result && (
        <div className="scenario-result">
          <h3>{result.title}</h3>
          <p>
            Tone: {result.tone} | Duration: {result.total_duration_seconds}s | Schema: {result.schema_version}
          </p>
          {result.shots?.map((shot) => (
            <div key={shot.shot_id} className="shot-item">
              <strong>
                {shot.shot_id} ({shot.duration_seconds}s)
              </strong>
              <p>Subtitle: {shot.subtitle}</p>
              <p>Narration: {shot.narration}</p>
              <p>Visual: {shot.visual_description}</p>
              <p>
                Direction: {shot.narration_direction.label} / intensity {shot.narration_direction.intensity}
              </p>
              <p>TTS instruction: {shot.narration_direction.tts_instruction}</p>
              <p>
                Delivery: rate {shot.narration_direction.delivery.speaking_rate}, energy{" "}
                {shot.narration_direction.delivery.energy}, pause(before/after){" "}
                {shot.narration_direction.delivery.pause_ms_before}/
                {shot.narration_direction.delivery.pause_ms_after}ms
              </p>
              {shot.narration_direction.delivery.emphasis_words?.length ? (
                <p>
                  Emphasis:{" "}
                  {shot.narration_direction.delivery.emphasis_words.join(", ")}
                </p>
              ) : null}

              {elevenAudioByShotId[shot.shot_id] ? (
                <div className="shot-audio">
                  <p>
                    ElevenLabs: {ELEVENLABS_MODEL} | {ELEVENLABS_VOICE_NAME}
                  </p>
                  <audio
                    controls
                    src={elevenAudioByShotId[shot.shot_id].audioUrl}
                    className="asset-audio"
                  />
                  <details>
                    <summary>ElevenLabs request payload</summary>
                    <pre className="raw-json">
                      <code>
                        {JSON.stringify(
                          elevenAudioByShotId[shot.shot_id].payloadPreview,
                          null,
                          2,
                        )}
                      </code>
                    </pre>
                  </details>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="eleven-quick">
        <h2>ElevenLabs Quick TTS</h2>
        <p className="hint">
          Local recommended: set <code>ELEVENLABS_API_KEY</code> in <code>.env</code>
          and restart dev server. This uses <code>/api/elevenlabs/tts</code> proxy.
        </p>
        <label htmlFor="elevenQuickText">Text</label>
        <textarea
          id="elevenQuickText"
          value={elevenQuickText}
          onChange={(e) => setElevenQuickText(e.target.value)}
          rows={3}
        />
        <label htmlFor="elevenQuickInstruction">TTS instruction</label>
        <textarea
          id="elevenQuickInstruction"
          value={elevenQuickInstruction}
          onChange={(e) => setElevenQuickInstruction(e.target.value)}
          rows={2}
          placeholder="e.g. Calm, slightly slower, comfortable delivery."
        />
        <button
          type="button"
          onClick={handleGenerateElevenLabsQuickTts}
          disabled={elevenQuickLoading}
        >
          {elevenQuickLoading ? "Generating Audio..." : "Generate Audio (ElevenLabs)"}
        </button>
        {elevenQuickAudio ? (
          <div className="shot-audio">
            <p>
              ElevenLabs: {ELEVENLABS_MODEL} | voice_id{" "}
              {(import.meta.env.VITE_ELEVENLABS_VOICE_ID as string | undefined) ??
                "(unset)"}
            </p>
            <audio controls src={elevenQuickAudio.audioUrl} className="asset-audio" />
            <details>
              <summary>Request payload</summary>
              <pre className="raw-json">
                <code>{JSON.stringify(elevenQuickAudio.payloadPreview, null, 2)}</code>
              </pre>
            </details>
          </div>
        ) : null}
      </div>

      {assets.length > 0 && (
        <div className="assets-result">
          <h3>Generated Assets</h3>
          {assets.map((asset) => (
            <div key={asset.shotId} className="asset-item">
              <strong>{asset.shotId}</strong>
              <img src={asset.imageUrl} alt={`${asset.shotId} generated`} className="asset-image" />
              {elevenAudioByShotId[asset.shotId] ? (
                <audio
                  controls
                  src={elevenAudioByShotId[asset.shotId].audioUrl}
                  className="asset-audio"
                />
              ) : null}
              <p>Subtitle: {asset.subtitle}</p>
              <p>
                Direction: {asset.narrationDirection.label} / intensity {asset.narrationDirection.intensity}
              </p>
              {elevenAudioByShotId[asset.shotId] ? (
                <details>
                  <summary>ElevenLabs request payload</summary>
                  <pre className="raw-json">
                    <code>
                      {JSON.stringify(
                        elevenAudioByShotId[asset.shotId].payloadPreview,
                        null,
                        2,
                      )}
                    </code>
                  </pre>
                </details>
              ) : null}
              <details>
                <summary>Image prompt used</summary>
                <pre className="raw-json">
                  <code>{asset.prompt}</code>
                </pre>
              </details>
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

