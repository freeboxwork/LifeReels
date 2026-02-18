import { getRenderProgress, renderMediaOnLambda } from "@remotion/lambda/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";

type JobStatus =
  | "queued"
  | "generating_scenario"
  | "generating_images"
  | "generating_narration"
  | "rendering_video"
  | "done"
  | "error";

type Job = {
  id: string;
  createdAt: number;
  status: JobStatus;
  progress: number;
  message: string;
  error?: string;
  totalShots?: number;
  completedShots?: number;
  outputUrl?: string;
};

type Shot = {
  shot_id: string;
  duration_seconds?: number;
  subtitle: string;
  narration: string;
  visual_description?: string;
  image_prompt?: string;
  transition?: string;
  narration_direction?: {
    label?: string;
    intensity?: number;
    delivery?: {
      speaking_rate?: number;
      energy?: number;
      pause_ms_before?: number;
      pause_ms_after?: number;
    };
    tts_instruction?: string;
  };
};

type ScriptV2 = {
  schema_version: string;
  language: string;
  title: string;
  tone: string;
  total_duration_seconds?: number;
  shots: Shot[];
};

type ScriptV3 = {
  schema_version: "reels_script_v3";
  language: string;
  date?: string;
  title: string;
  tone: string;
  target_total_duration_seconds?: number;
  shots: Array<
    Shot & {
      visual_description: string;
      subtitle: string;
      narration: string;
      image_prompt: string;
      transition: string;
      narration_direction: {
        label: string;
        intensity: number;
        delivery: {
          speaking_rate: number;
          energy: number;
          pause_ms_before: number;
          pause_ms_after: number;
          emphasis_words?: string[];
        };
        tts_instruction: string;
        arc_hint?: string;
      };
      timing_hints?: {
        min_duration_seconds?: number;
        max_duration_seconds?: number;
        padding_ms?: number;
      };
    }
  >;
};

type EventV2 = {
  requestContext?: {
    http?: {
      method?: string;
      path?: string;
    };
  };
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
};

const jobs = new Map<string, Job>();

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function getEnv(name: string, required = true) {
  const v = String(process.env[name] ?? "").trim();
  if (!v && required) throw new Error(`Missing env: ${name}`);
  return v;
}

function parsePositiveInt(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function nowJobId() {
  const n = randomBytes(8);
  return n.toString("hex");
}

function inferBucketName(serveUrl: string) {
  return new URL(serveUrl).hostname.split(".")[0];
}

function inferSiteName(serveUrl: string) {
  const m = new URL(serveUrl).pathname.match(/\/sites\/([^/]+)\//);
  if (!m?.[1]) throw new Error("Could not infer site name from REMOTION_SERVE_URL.");
  return m[1];
}

function applyPauseText(input: string, beforeMs: number, afterMs: number) {
  const before = beforeMs >= 600 ? "... " : beforeMs >= 200 ? ", " : "";
  const after = afterMs >= 600 ? " ..." : afterMs >= 200 ? "," : "";
  return `${before}${input}${after}`.trim();
}

function buildScenarioPrompt(diaryText: string) {
  // Keep aligned with src/DiaryScenarioPrototype.tsx so "Scenario Only" and "Complete" are consistent.
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

function buildScenarioRepairPrompt(diaryText: string, previousJson: string, errors: string[]) {
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

function stripCodeFence(text: string) {
  const t = text.trim();
  if (t.startsWith("```")) {
    const lines = t.split("\n");
    if (lines.length >= 3 && lines[lines.length - 1].trim() === "```") {
      return lines.slice(1, -1).join("\n").trim();
    }
  }
  return t;
}

function extractFirstJsonObject(text: string) {
  const s = stripCodeFence(text);
  const start = s.indexOf("{");
  if (start < 0) return s;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === "\"") {
        inStr = false;
      }
      continue;
    }
    if (ch === "\"") {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s;
}

async function callOpenAiResponses(apiKey: string, model: string, prompt: string) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    }),
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`OpenAI responses failed: ${r.status} ${raw}`);
  const data = JSON.parse(raw) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (data.output_text?.trim()) return data.output_text.trim();
  const chunks =
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((c) => c.type === "output_text" && typeof c.text === "string")
      .map((c) => c.text?.trim() ?? "")
      .filter(Boolean) ?? [];
  const out = chunks.join("\n").trim();
  if (!out) throw new Error("OpenAI responses returned empty output.");
  return out;
}

const emotionLabels = [
  "calm",
  "warm",
  "anxious",
  "relieved",
  "grateful",
  "joyful",
  "lonely",
  "bittersweet",
  "hopeful",
  "tired",
  "playful",
  "determined",
] as const;

function parseScenarioJsonLenient(rawText: string): unknown {
  const raw = extractFirstJsonObject(rawText);
  return JSON.parse(raw);
}

function validateScenarioV2(input: unknown): { ok: true; value: ScriptV2 } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return { ok: false, errors: ["(root) must be an object."] };
  const obj = input as Record<string, unknown>;

  if (obj.schema_version !== "reels_script_v2") errors.push("(root).schema_version must be reels_script_v2.");
  if (typeof obj.language !== "string" || obj.language.length < 2) errors.push("(root).language must be a string.");
  if (obj.total_duration_seconds !== 15) errors.push("(root).total_duration_seconds must be 15.");
  if (typeof obj.title !== "string" || !obj.title.trim()) errors.push("(root).title must be a non-empty string.");
  if (typeof obj.tone !== "string" || !obj.tone.trim()) errors.push("(root).tone must be a non-empty string.");

  const shots = obj.shots;
  if (!Array.isArray(shots) || shots.length !== 5) {
    errors.push("(root).shots must be an array of 5 items.");
    return { ok: false, errors };
  }

  const durationSum = shots.reduce((sum, s) => sum + Number((s as any)?.duration_seconds ?? 0), 0);
  if (durationSum !== 15) errors.push(`shots duration sum must be 15 seconds (received ${durationSum}).`);

  const labels: string[] = [];
  const instructions: string[] = [];

  for (let i = 0; i < shots.length; i++) {
    const s = shots[i] as any;
    if (!s || typeof s !== "object") {
      errors.push(`shots[${i}] must be an object.`);
      continue;
    }
    if (typeof s.shot_id !== "string" || !s.shot_id.trim()) errors.push(`shots[${i}].shot_id is required.`);
    const d = Number(s.duration_seconds);
    if (!Number.isFinite(d) || d < 1 || d > 6) errors.push(`shots[${i}].duration_seconds must be 1..6.`);
    if (typeof s.visual_description !== "string" || !s.visual_description.trim()) errors.push(`shots[${i}].visual_description is required.`);
    if (typeof s.subtitle !== "string" || !s.subtitle.trim()) errors.push(`shots[${i}].subtitle is required.`);
    if (typeof s.narration !== "string" || !s.narration.trim()) errors.push(`shots[${i}].narration is required.`);
    if (typeof s.image_prompt !== "string" || !s.image_prompt.trim()) errors.push(`shots[${i}].image_prompt is required.`);
    if (typeof s.transition !== "string" || !s.transition.trim()) errors.push(`shots[${i}].transition is required.`);

    const nd = s.narration_direction;
    if (!nd || typeof nd !== "object") {
      errors.push(`shots[${i}].narration_direction is required.`);
      continue;
    }
    const label = String((nd as any).label ?? "");
    labels.push(label);
    if (!emotionLabels.includes(label as any)) errors.push(`shots[${i}].narration_direction.label must be one of the allowed labels.`);

    const intensity = Number((nd as any).intensity);
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) errors.push(`shots[${i}].narration_direction.intensity must be 0..1.`);

    const tts = String((nd as any).tts_instruction ?? "").trim();
    if (!tts) errors.push(`shots[${i}].narration_direction.tts_instruction is required.`);
    instructions.push(tts.trim().toLowerCase());

    const del = (nd as any).delivery;
    if (!del || typeof del !== "object") {
      errors.push(`shots[${i}].narration_direction.delivery is required.`);
      continue;
    }
    const speaking = Number(del.speaking_rate);
    const energy = Number(del.energy);
    const pBefore = Number(del.pause_ms_before);
    const pAfter = Number(del.pause_ms_after);
    if (!Number.isFinite(speaking) || speaking < 0.5 || speaking > 2) errors.push(`shots[${i}].narration_direction.delivery.speaking_rate must be 0.5..2.`);
    if (!Number.isFinite(energy) || energy < 0 || energy > 1) errors.push(`shots[${i}].narration_direction.delivery.energy must be 0..1.`);
    if (!Number.isInteger(pBefore) || pBefore < 0 || pBefore > 1500) errors.push(`shots[${i}].narration_direction.delivery.pause_ms_before must be 0..1500.`);
    if (!Number.isInteger(pAfter) || pAfter < 0 || pAfter > 1500) errors.push(`shots[${i}].narration_direction.delivery.pause_ms_after must be 0..1500.`);
  }

  if (new Set(labels.filter(Boolean)).size < 2) {
    errors.push("narration_direction.label should vary across shots (use at least 2 distinct labels).");
  }
  const instr = instructions.filter(Boolean);
  if (new Set(instr).size < instr.length) {
    errors.push("Each shot must have its own distinct narration_direction.tts_instruction.");
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: input as ScriptV2 };
}

function parseScenarioText(text: string): ScriptV2 {
  const parsed = parseScenarioJsonLenient(text);
  const v = validateScenarioV2(parsed);
  if (!v.ok) throw new Error(`Invalid scenario payload. ${v.errors.join(" | ")}`);
  return v.value;
}

function buildImagePrompt(shot: Shot) {
  const scene = String(shot.image_prompt || shot.visual_description || "").trim();
  return [
    "Warm cinematic still image, Korean daily life mood, no people.",
    "No text, no signage, no labels, no logo.",
    `Scene: ${scene}`,
  ].join("\n");
}

async function callOpenAiImage(apiKey: string, model: string, prompt: string) {
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(180000),
        body: JSON.stringify({
          model,
          prompt,
          size: "1024x1536",
          quality: "low",
        }),
      });
      const raw = await r.text();
      if (!r.ok) throw new Error(`OpenAI image failed: ${r.status} ${raw}`);
      const data = JSON.parse(raw) as { data?: Array<{ b64_json?: string; url?: string }> };
      const item = data.data?.[0];
      if (!item) throw new Error("Image payload empty.");
      if (item.b64_json) return { body: Buffer.from(item.b64_json, "base64"), contentType: "image/png" };
      if (item.url) {
        const imgResp = await fetch(item.url, { signal: AbortSignal.timeout(120000) });
        if (!imgResp.ok) throw new Error(`Image download failed: ${imgResp.status}`);
        return { body: Buffer.from(await imgResp.arrayBuffer()), contentType: imgResp.headers.get("content-type") ?? "image/png" };
      }
      throw new Error("Image payload missing b64_json/url.");
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  throw new Error(`OpenAI image failed after retries: ${lastErr}`);
}

async function callElevenLabs(apiKey: string, voiceId: string, modelId: string, shot: Shot) {
  const nd = shot.narration_direction;
  const d = nd?.delivery ?? {};
  const intensity = clamp(Number(nd?.intensity ?? 0.5), 0, 1);
  const energy = clamp(Number(d.energy ?? 0.5), 0, 1);
  const speakingRate = clamp(Number(d.speaking_rate ?? 1), 0.5, 2);
  const expressiveness = clamp(intensity * 0.7 + energy * 0.3, 0, 1);
  const body = {
    text: applyPauseText(
      String(shot.narration ?? "").trim(),
      Number(d.pause_ms_before ?? 0),
      Number(d.pause_ms_after ?? 0),
    ),
    model_id: modelId,
    language_code: "ko",
    voice_settings: {
      stability: clamp(0.85 - expressiveness * 0.55, 0, 1),
      similarity_boost: clamp(0.9 - expressiveness * 0.15, 0, 1),
      style: expressiveness,
      use_speaker_boost: true,
      speed: clamp(speakingRate, 0.7, 1.3),
    },
  };
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey,
    },
    signal: AbortSignal.timeout(120000),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const raw = await r.text();
    throw new Error(`ElevenLabs failed: ${r.status} ${raw}`);
  }
  return { body: Buffer.from(await r.arrayBuffer()), contentType: "audio/mpeg" };
}

function makeRenderPlan(script: ScriptV2) {
  const fps = 30;
  const shots = script.shots.map((s) => ({ ...s, duration_seconds: Number(s.duration_seconds ?? 3) }));
  let cursor = 0;
  const planShots = shots.map((s) => {
    const durationInFrames = Math.max(1, Math.round((Number(s.duration_seconds) || 3) * fps));
    const out = {
      shot_id: s.shot_id,
      from: cursor,
      durationInFrames,
      audioStartInFrames: 0,
      audioDurationInFrames: durationInFrames,
      overlapInFrames: 0,
      overlapOutFrames: 0,
      endFadeOutFrames: 0,
      transitionOut: String(s.transition || "cut"),
      assets: { image_src: "", audio_src: "" },
    };
    cursor += durationInFrames;
    return out;
  });
  return { fps, durationInFrames: Math.max(1, cursor), shots: planShots };
}

function msToFrames(ms: number, fps: number) {
  return Math.max(0, Math.round((ms / 1000) * fps));
}

function secondsToFrames(s: number, fps: number) {
  return Math.max(1, Math.round(s * fps));
}

function transitionOverlapFrames(transition: string, fps: number) {
  const t = String(transition || "cut").toLowerCase();
  const base =
    t === "cut"
      ? 0
      : t === "fade"
        ? Math.round(fps * 0.35)
        : t === "crossfade"
          ? Math.round(fps * 0.4)
          : Math.round(fps * 0.35);
  return clamp(base, 0, Math.round(fps * 0.7));
}

function toScriptV3(script: ScriptV2): ScriptV3 {
  return {
    schema_version: "reels_script_v3",
    language: String(script.language || "ko"),
    title: String(script.title || "LifeReels"),
    tone: String(script.tone || "calm"),
    target_total_duration_seconds: 15,
    shots: script.shots.slice(0, 5).map((s, i) => {
      const nd = s.narration_direction ?? {};
      const d = nd.delivery ?? {};
      const label = String(nd.label || "calm").toLowerCase();
      const safeLabel = emotionLabels.includes(label as any) ? label : "calm";
      return {
        shot_id: String(s.shot_id || `s${i + 1}`),
        duration_seconds: Number(s.duration_seconds ?? 3),
        timing_hints: { min_duration_seconds: 2.2, max_duration_seconds: 6, padding_ms: 150 },
        visual_description: String(s.visual_description || s.image_prompt || "scene").trim() || "scene",
        subtitle: String(s.subtitle || "").trim() || `Scene ${i + 1}`,
        narration: String(s.narration || "").trim() || `Scene ${i + 1}`,
        image_prompt: String(s.image_prompt || s.visual_description || "scene").trim() || "scene",
        transition: String(s.transition || "cut"),
        narration_direction: {
          label: String(safeLabel),
          intensity: clamp(Number(nd.intensity ?? 0.5), 0, 1),
          delivery: {
            speaking_rate: clamp(Number(d.speaking_rate ?? 1), 0.5, 2),
            energy: clamp(Number(d.energy ?? 0.5), 0, 1),
            pause_ms_before: clamp(Number(d.pause_ms_before ?? 150), 0, 1500),
            pause_ms_after: clamp(Number(d.pause_ms_after ?? 150), 0, 1500),
            emphasis_words: Array.isArray((d as any).emphasis_words) ? (d as any).emphasis_words : undefined,
          },
          tts_instruction: String(nd.tts_instruction || "Speak naturally, calm, and clear.").trim(),
          arc_hint: (nd as any).arc_hint ? String((nd as any).arc_hint) : undefined,
        },
      };
    }),
  };
}

function computeRenderPlanV3(args: {
  script: ScriptV3;
  fps: number;
  renderParams: Record<string, unknown>;
  assetsByShotId: Record<string, { image_src: string; audio_src: string }>;
  audioBytesByShotId: Record<string, number>;
}) {
  const { script, fps, renderParams, assetsByShotId, audioBytesByShotId } = args;
  const shots = script.shots;

  const openingEnabled = (renderParams as any).opening_card !== false;
  const endingEnabled = (renderParams as any).ending_card !== false;
  const openingSeconds = typeof (renderParams as any).opening_card_seconds === "number" ? Number((renderParams as any).opening_card_seconds) : 1.4;
  const endingSeconds = typeof (renderParams as any).ending_card_seconds === "number" ? Number((renderParams as any).ending_card_seconds) : 1.2;
  const openingFrames = openingEnabled ? secondsToFrames(openingSeconds, fps) : 0;
  const endingFrames = endingEnabled ? secondsToFrames(endingSeconds, fps) : 0;

  const tmp = shots.map((shot) => {
    const assets = assetsByShotId[shot.shot_id];
    const bytes = Number(audioBytesByShotId[shot.shot_id] ?? 0);
    const audioDurationSeconds = bytes > 0 ? (bytes * 8) / 128000 : 0;
    const audioDurationFrames = secondsToFrames(audioDurationSeconds, fps);

    const pauseBeforeMs = Number(shot.narration_direction?.delivery?.pause_ms_before ?? 0);
    const pauseAfterMs = Number(shot.narration_direction?.delivery?.pause_ms_after ?? 0);
    const paddingMs = Number((shot as any).timing_hints?.padding_ms ?? 0);

    const audioStartInFrames = msToFrames(pauseBeforeMs, fps);
    const pauseAfterFrames = msToFrames(pauseAfterMs, fps);
    const paddingFrames = msToFrames(paddingMs, fps);

    const requiredFrames = audioStartInFrames + audioDurationFrames + pauseAfterFrames + paddingFrames;
    const minFrames = (shot as any).timing_hints?.min_duration_seconds
      ? secondsToFrames(Number((shot as any).timing_hints.min_duration_seconds), fps)
      : 1;
    const maxFramesRaw = (shot as any).timing_hints?.max_duration_seconds
      ? secondsToFrames(Number((shot as any).timing_hints.max_duration_seconds), fps)
      : null;

    let durationInFrames = Math.max(requiredFrames, minFrames);
    if (maxFramesRaw !== null && maxFramesRaw >= requiredFrames) {
      durationInFrames = clamp(durationInFrames, minFrames, maxFramesRaw);
    }
    if (bytes <= 0 || audioDurationSeconds <= 0) {
      const fallbackSeconds = Number(shot.duration_seconds ?? (shot as any).timing_hints?.min_duration_seconds ?? 3);
      durationInFrames = secondsToFrames(fallbackSeconds, fps);
    }

    return {
      shot_id: shot.shot_id,
      durationInFrames,
      audioStartInFrames,
      audioDurationInFrames: audioDurationFrames,
      pauseAfterFrames,
      paddingFrames,
      minFrames,
      assets,
      transitionOut: String(shot.transition || "cut"),
    };
  });

  const overlapOut = new Array(tmp.length).fill(0);
  const endFadeOutFrames = new Array(tmp.length).fill(0);
  for (let i = 0; i < tmp.length; i++) {
    const isLast = i === tmp.length - 1;
    const desired = transitionOverlapFrames(tmp[i].transitionOut, fps);
    if (isLast) {
      if (String(tmp[i].transitionOut).toLowerCase() === "fade") {
        endFadeOutFrames[i] = desired;
      }
      overlapOut[i] = 0;
      continue;
    }
    const maxAllowed = Math.max(
      0,
      Math.min(tmp[i].durationInFrames - 1, tmp[i + 1].durationInFrames - 1, Math.round(fps * 0.9)),
    );
    overlapOut[i] = clamp(desired, 0, maxAllowed);
  }

  const narrationGapMs = typeof (renderParams as any).narration_gap_ms === "number" ? Number((renderParams as any).narration_gap_ms) : 220;
  const gapFrames = msToFrames(narrationGapMs, fps);

  const computeFroms = () => {
    const froms = new Array(tmp.length).fill(0);
    let cursor = 0;
    for (let i = 0; i < tmp.length; i++) {
      froms[i] = cursor;
      cursor += tmp[i].durationInFrames - overlapOut[i];
    }
    return froms;
  };

  const ensureDurFitsAudio = (i: number) => {
    const required =
      tmp[i].audioStartInFrames +
      tmp[i].audioDurationInFrames +
      tmp[i].pauseAfterFrames +
      tmp[i].paddingFrames;
    tmp[i].durationInFrames = Math.max(tmp[i].durationInFrames, required, tmp[i].minFrames);
  };

  for (let iter = 0; iter < 4; iter++) {
    const froms = computeFroms();
    let changed = false;
    for (let i = 1; i < tmp.length; i++) {
      const prev = tmp[i - 1];
      const cur = tmp[i];
      const prevEnd =
        froms[i - 1] +
        prev.audioStartInFrames +
        prev.audioDurationInFrames +
        prev.pauseAfterFrames +
        prev.paddingFrames;
      const curStart = froms[i] + cur.audioStartInFrames;
      const minStart = prevEnd + gapFrames;
      if (curStart < minStart) {
        const delta = minStart - curStart;
        cur.audioStartInFrames += delta;
        ensureDurFitsAudio(i);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const fromsFinal = computeFroms();
  const planShots = tmp.map((t, i) => {
    const overlapInFrames = i === 0 ? 0 : overlapOut[i - 1];
    return {
      shot_id: t.shot_id,
      from: fromsFinal[i] + openingFrames,
      durationInFrames: t.durationInFrames,
      audioStartInFrames: t.audioStartInFrames,
      audioDurationInFrames: t.audioDurationInFrames,
      overlapInFrames,
      overlapOutFrames: overlapOut[i],
      endFadeOutFrames: endFadeOutFrames[i],
      transitionOut: t.transitionOut,
      assets: t.assets,
    };
  });

  const contentDuration = planShots.length
    ? planShots[planShots.length - 1].from + planShots[planShots.length - 1].durationInFrames
    : openingFrames;
  const totalDuration = Math.max(1, contentDuration + endingFrames);

  for (let i = 0; i < shots.length; i++) {
    shots[i].duration_seconds = tmp[i].durationInFrames / fps;
  }

  return {
    fps,
    durationInFrames: totalDuration,
    opening: openingFrames > 0 ? { durationInFrames: openingFrames } : undefined,
    ending: endingFrames > 0 ? { from: totalDuration - endingFrames, durationInFrames: endingFrames } : undefined,
    shots: planShots,
  };
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>) {
  const queue = items.map((item, index) => ({ item, index }));
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const next = queue.shift();
      if (!next) break;
      await fn(next.item, next.index);
    }
  });
  await Promise.all(workers);
}

async function runPipeline(job: Job, diaryText: string) {
  const set = (patch: Partial<Job>) => {
    Object.assign(job, patch);
    jobs.set(job.id, job);
  };

  try {
    set({ status: "generating_scenario", progress: 0.06, message: "Generating scenario..." });

    const openaiKey = getEnv("OPENAI_API_KEY");
    const openaiModel = getEnv("OPENAI_MODEL", false) || "gpt-4.1-mini";
    const imageModel = getEnv("OPENAI_IMAGE_MODEL", false) || "gpt-image-1.5";
    const elevenKey = getEnv("ELEVENLABS_API_KEY");
    const voiceId = getEnv("ELEVENLABS_VOICE_ID");
    const elevenModel = getEnv("ELEVENLABS_MODEL_ID", false) || "eleven_flash_v2_5";
    const region = getEnv("REMOTION_AWS_REGION", false) || "us-east-1";
    const functionName = getEnv("REMOTION_FUNCTION_NAME");
    const serveUrl = getEnv("REMOTION_SERVE_URL");
    const bucketName = getEnv("REMOTION_AWS_BUCKET_NAME", false) || inferBucketName(serveUrl);
    const siteName = inferSiteName(serveUrl);
    const origin = new URL(serveUrl).origin;

    const s3 = new S3Client({ region });
    let script: ScriptV2 | null = null;
    let previousOutput = "";
    let lastErrors: string[] = [];
    for (let attempt = 0; attempt <= 2; attempt++) {
      const prompt =
        attempt === 0
          ? buildScenarioPrompt(diaryText)
          : buildScenarioRepairPrompt(diaryText, previousOutput, lastErrors);
      const out = await callOpenAiResponses(openaiKey, openaiModel, prompt);
      previousOutput = out;
      try {
        script = parseScenarioText(out);
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErrors = [msg];
      }
    }
    if (!script) {
      throw new Error(`Invalid scenario payload after retries: ${lastErrors.join(" | ")}`);
    }
    set({ totalShots: script.shots.length, completedShots: 0 });

    const assetsByShotId: Record<string, { image_src: string; audio_src: string }> = {};
    const audioBytesByShotId: Record<string, number> = {};

    set({ status: "generating_images", progress: 0.12, message: "Generating assets..." });
    const assetConcurrency = parsePositiveInt(process.env.REMOTION_ASSET_CONCURRENCY, 3);
    const totalAssetSteps = script.shots.length * 2;
    let finishedAssetSteps = 0;
    let finishedShots = 0;
    const markProgress = (label: string) => {
      finishedAssetSteps++;
      set({
        status: "generating_images",
        progress: 0.12 + (finishedAssetSteps / totalAssetSteps) * 0.58,
        message: `Generating assets... (${finishedAssetSteps}/${totalAssetSteps}) ${label}`,
        completedShots: finishedShots,
      });
    };

    await mapWithConcurrency(script.shots, assetConcurrency, async (shot, i) => {
      assetsByShotId[shot.shot_id] = { image_src: "", audio_src: "" };

      const imageTask = (async () => {
        const image = await callOpenAiImage(openaiKey, imageModel, buildImagePrompt(shot));
        const imageKey = `sites/${siteName}/assets/jobs/${job.id}/s_${i + 1}.png`;
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: imageKey,
            Body: image.body,
            ContentType: image.contentType,
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
        assetsByShotId[shot.shot_id].image_src = `${origin}/${imageKey}`;
        markProgress(`image ${i + 1}/${script.shots.length}`);
      })();

      const audioTask = (async () => {
        const audio = await callElevenLabs(elevenKey, voiceId, elevenModel, shot);
        const audioKey = `sites/${siteName}/assets/jobs/${job.id}/Narr_S_${i + 1}.mp3`;
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: audioKey,
            Body: audio.body,
            ContentType: audio.contentType,
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
        assetsByShotId[shot.shot_id].audio_src = `${origin}/${audioKey}`;
        audioBytesByShotId[shot.shot_id] = Number((audio.body as Buffer).byteLength ?? 0);
        markProgress(`audio ${i + 1}/${script.shots.length}`);
      })();

      await Promise.all([imageTask, audioTask]);
      finishedShots++;
      set({ completedShots: finishedShots });
    });

    const renderParams = {
      layout_preset: "frame_matte",
      subtitle_preset: "soft_box",
      show_debug_hints: false,
      show_title: true,
      opening_card: true,
      ending_card: true,
      opening_card_seconds: 1.6,
      ending_card_seconds: 1.3,
      bgm_volume: 0.24,
      bgm_duck_volume: 0.12,
      bgm_duck_attack_frames: 8,
      bgm_duck_release_frames: 10,
      narration_gap_ms: 220,
      bgm_src:
        getEnv("REMOTION_BGM_SRC", false) ??
        `${origin}/sites/${siteName}/assets/bgm/BGM-01_warm-lofi-diary_78bpm_30s_loop_v01_type_A.mp3`,
    };

    const scriptV3 = toScriptV3(script);
    const plan = computeRenderPlanV3({
      script: scriptV3,
      fps: 30,
      renderParams,
      assetsByShotId,
      audioBytesByShotId,
    });

    const inputProps = {
      script: scriptV3,
      fps: plan.fps,
      assets_by_shot_id: assetsByShotId,
      render_params: renderParams,
      render_plan: plan,
    };

    set({ status: "rendering_video", progress: 0.8, message: "Rendering video (AWS)..." });
    const requestedConcurrency = parsePositiveInt(process.env.REMOTION_LAMBDA_CONCURRENCY, 0);
    const framesPerLambda = parsePositiveInt(process.env.REMOTION_FRAMES_PER_LAMBDA, 40);
    const maxRetries = parsePositiveInt(process.env.REMOTION_MAX_RETRIES, 1);
    const privacy = (String(process.env.REMOTION_PRIVACY ?? "public").toLowerCase() === "private" ? "private" : "public") as
      | "public"
      | "private";
    const buildArgs = (forceConcurrency?: number) => {
      const base = {
        region,
        functionName,
        serveUrl,
        composition: "LifeReels",
        inputProps,
        codec: "h264" as const,
        imageFormat: "jpeg" as const,
        maxRetries,
        privacy,
      };
      if (forceConcurrency && forceConcurrency > 0) return { ...base, concurrency: forceConcurrency };
      if (requestedConcurrency > 0) return { ...base, concurrency: requestedConcurrency };
      return { ...base, framesPerLambda };
    };

    let started: Awaited<ReturnType<typeof renderMediaOnLambda>>;
    try {
      started = await renderMediaOnLambda(buildArgs());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/rate exceeded|concurrency limit/i.test(msg)) {
        started = await renderMediaOnLambda(buildArgs(1));
      } else {
        throw e;
      }
    }

    const pollMs = parsePositiveInt(process.env.REMOTION_PROGRESS_POLL_MS, 1500);
    while (true) {
      const p = await getRenderProgress({
        region,
        functionName,
        bucketName: started.bucketName,
        renderId: started.renderId,
      });
      if (p.fatalErrorEncountered) {
        throw new Error(p.errors?.[0]?.message ?? "AWS render failed.");
      }
      set({
        progress: 0.8 + clamp(Number(p.overallProgress ?? 0), 0, 1) * 0.18,
        message: `Rendering video (AWS)... ${Math.round(clamp(Number(p.overallProgress ?? 0), 0, 1) * 100)}%`,
      });
      if (p.done) {
        if (!p.outputFile) throw new Error("Render done but output URL missing.");
        set({ status: "done", progress: 1, message: "Done", outputUrl: p.outputFile });
        break;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  } catch (e) {
    set({ status: "error", message: "Error", error: e instanceof Error ? e.message : String(e) });
  }
}

function parseBody(event: EventV2): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return raw ? JSON.parse(raw) : {};
}

function checkAuth(event: EventV2) {
  const token = String(process.env.BRIDGE_AUTH_TOKEN ?? "").trim();
  if (!token) return true;
  const auth = String(event.headers?.authorization ?? event.headers?.Authorization ?? "");
  return auth === `Bearer ${token}`;
}

export const handler = async (event: EventV2) => {
  try {
    if (!checkAuth(event)) {
      return json(401, { error: "Unauthorized" });
    }
    const method = String(event.requestContext?.http?.method ?? "").toUpperCase();
    const path = String(event.rawPath ?? event.requestContext?.http?.path ?? "");
    const qs = new URLSearchParams(event.rawQueryString ?? "");

    if (method === "POST" && path.endsWith("/pipeline/start")) {
      const body = parseBody(event) as { diaryText?: string };
      const diaryText = String(body?.diaryText ?? "").trim();
      if (!diaryText) return json(400, { error: "Missing diaryText." });

      const job: Job = {
        id: nowJobId(),
        createdAt: Date.now(),
        status: "queued",
        progress: 0,
        message: "Queued",
      };
      jobs.set(job.id, job);
      void runPipeline(job, diaryText);
      return json(200, { id: job.id });
    }

    if (method === "GET" && path.endsWith("/pipeline/status")) {
      const id = String(qs.get("id") ?? "").trim();
      if (!id) return json(400, { error: "Missing id." });
      const job = jobs.get(id);
      if (!job) return json(404, { error: "Job not found." });
      return json(200, job);
    }

    return json(404, { error: "Not found." });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
};


