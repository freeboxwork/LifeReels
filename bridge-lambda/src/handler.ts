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

function buildScenarioPrompt(diaryText: string) {
  return [
    "You are a strict JSON generator for reels_script_v2.",
    "Return ONLY JSON. No markdown.",
    "Use Korean language and 5 shots.",
    "Each shot must include: shot_id, duration_seconds, subtitle, narration, image_prompt, transition, narration_direction.",
    "Sum of duration_seconds must be 15.",
    `Diary:\n${diaryText}`,
  ].join("\n");
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

function parseScenarioText(text: string): ScriptV2 {
  const raw = extractFirstJsonObject(text);
  const parsed = JSON.parse(raw) as Partial<ScriptV2>;
  if (!parsed || !Array.isArray(parsed.shots) || parsed.shots.length === 0) {
    throw new Error("Invalid scenario payload.");
  }
  const normalizedShots = parsed.shots.slice(0, 5).map((s, i) => {
    const shot = (s ?? {}) as Partial<Shot>;
    return {
      shot_id: String(shot.shot_id ?? `S${i + 1}`),
      duration_seconds: Number(shot.duration_seconds ?? 3),
      subtitle: String(shot.subtitle ?? "").trim() || `장면 ${i + 1}`,
      narration: String(shot.narration ?? "").trim() || `장면 ${i + 1} 내레이션`,
      image_prompt: String(shot.image_prompt ?? shot.visual_description ?? "").trim() || "Korean daily life cinematic still",
      transition: String(shot.transition ?? "cut"),
      narration_direction: shot.narration_direction ?? { intensity: 0.5, delivery: { speaking_rate: 1, energy: 0.5 } },
      visual_description: shot.visual_description,
    } satisfies Shot;
  });
  return {
    schema_version: String(parsed.schema_version ?? "reels_script_v2"),
    language: String(parsed.language ?? "ko"),
    title: String(parsed.title ?? "오늘의 기록"),
    tone: String(parsed.tone ?? "warm"),
    total_duration_seconds: Number(parsed.total_duration_seconds ?? 15),
    shots: normalizedShots,
  };
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
    text: String(shot.narration ?? "").trim(),
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
    let scenarioErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const retryHint =
          attempt === 1
            ? ""
            : `\n\nRetry ${attempt}: Your previous output was invalid. Return one JSON object only. No prose, no markdown, no code fences.`;
        script = parseScenarioText(await callOpenAiResponses(openaiKey, openaiModel, buildScenarioPrompt(diaryText) + retryHint));
        break;
      } catch (e) {
        scenarioErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (!script) {
      throw new Error(`Invalid scenario payload after retries: ${scenarioErr}`);
    }
    set({ totalShots: script.shots.length, completedShots: 0 });

    const assetsByShotId: Record<string, { image_src: string; audio_src: string }> = {};
    const plan = makeRenderPlan(script);

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

    for (let i = 0; i < plan.shots.length; i++) {
      plan.shots[i].assets = assetsByShotId[script.shots[i].shot_id];
    }

    const inputProps = {
      script,
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
