import { getRenderProgress, renderMediaOnLambda } from "@remotion/lambda/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type Env = {
  PIPELINE_JOBS_KV?: {
    get: (key: string, type: "json") => Promise<unknown | null>;
    put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
  };
  OPENAI_API_KEY?: string;
  VITE_OPENAI_API_KEY?: string;
  VITE_OPENAI_MODEL?: string;
  OPENAI_IMAGE_MODEL?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_MODEL_ID?: string;
  VITE_ELEVENLABS_VOICE_ID?: string;
  VITE_ELEVENLABS_MODEL_ID?: string;
  REMOTION_AWS_REGION?: string;
  REMOTION_FUNCTION_NAME?: string;
  REMOTION_SERVE_URL?: string;
  REMOTION_AWS_ACCESS_KEY_ID?: string;
  REMOTION_AWS_SECRET_ACCESS_KEY?: string;
  REMOTION_AWS_SESSION_TOKEN?: string;
  REMOTION_AWS_BUCKET_NAME?: string;
  REMOTION_LAMBDA_CONCURRENCY?: string;
  REMOTION_FRAMES_PER_LAMBDA?: string;
  REMOTION_MAX_RETRIES?: string;
  REMOTION_PROGRESS_POLL_MS?: string;
  REMOTION_PRIVACY?: string;
  REMOTION_BGM_SRC?: string;
};

type PipelineJobStatus =
  | "queued"
  | "generating_scenario"
  | "generating_images"
  | "generating_narration"
  | "rendering_video"
  | "done"
  | "error";

export type PipelineJob = {
  id: string;
  createdAt: number;
  status: PipelineJobStatus;
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

const jobs = new Map<string, PipelineJob>();
const JOB_TTL_SECONDS = 60 * 60 * 24;

function jobKey(id: string) {
  return `pipeline:job:${id}`;
}

async function writeJob(env: Env, job: PipelineJob) {
  const kv = env.PIPELINE_JOBS_KV;
  if (kv) {
    await kv.put(jobKey(job.id), JSON.stringify(job), { expirationTtl: JOB_TTL_SECONDS });
  } else {
    jobs.set(job.id, job);
  }
}

export async function getJob(env: Env, id: string) {
  const kv = env.PIPELINE_JOBS_KV;
  if (kv) {
    const data = await kv.get(jobKey(id), "json");
    return (data as PipelineJob | null) ?? undefined;
  }
  return jobs.get(id);
}

export async function createJob(env: Env): Promise<PipelineJob> {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const job: PipelineJob = {
    id,
    createdAt: Date.now(),
    status: "queued",
    progress: 0,
    message: "Queued",
  };
  await writeJob(env, job);
  return job;
}

export async function setJob(env: Env, job: PipelineJob, patch: Partial<PipelineJob>) {
  const next = { ...job, ...patch };
  await writeJob(env, next);
  return next;
}

function requireEnv(env: Env, key: keyof Env) {
  const v = String(env[key] ?? "").trim();
  if (!v) throw new Error(`Missing env: ${String(key)}`);
  return v;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function parsePositiveInt(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function inferBucketName(env: Env, serveUrl: string) {
  const explicit = String(env.REMOTION_AWS_BUCKET_NAME ?? "").trim();
  if (explicit) return explicit;
  return new URL(serveUrl).hostname.split(".")[0];
}

function inferSiteName(serveUrl: string) {
  const m = new URL(serveUrl).pathname.match(/\/sites\/([^/]+)\//);
  if (!m?.[1]) throw new Error("Could not infer site name from REMOTION_SERVE_URL.");
  return m[1];
}

function parseScenarioText(text: string): ScriptV2 {
  const parsed = JSON.parse(text) as ScriptV2;
  if (!parsed || !Array.isArray(parsed.shots) || parsed.shots.length === 0) {
    throw new Error("Invalid scenario payload.");
  }
  return parsed;
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

async function callOpenAiResponses(apiKey: string, model: string, prompt: string) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
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

async function callOpenAiImage(apiKey: string, model: string, prompt: string) {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
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
  if (item.b64_json) {
    const bin = atob(item.b64_json);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { body: bytes, contentType: "image/png" };
  }
  if (item.url) {
    const imgResp = await fetch(item.url);
    if (!imgResp.ok) throw new Error(`Image download failed: ${imgResp.status}`);
    const ab = await imgResp.arrayBuffer();
    return { body: new Uint8Array(ab), contentType: imgResp.headers.get("content-type") ?? "image/png" };
  }
  throw new Error("Image payload missing b64_json/url.");
}

async function callElevenLabs(
  apiKey: string,
  voiceId: string,
  modelId: string,
  shot: Shot,
) {
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
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const raw = await r.text();
    throw new Error(`ElevenLabs failed: ${r.status} ${raw}`);
  }
  const ab = await r.arrayBuffer();
  return { body: new Uint8Array(ab), contentType: "audio/mpeg" };
}

function buildImagePrompt(shot: Shot) {
  const scene = String(shot.image_prompt || shot.visual_description || "").trim();
  return [
    "Warm cinematic still image, Korean daily life mood, no people.",
    "No text, no signage, no labels, no logo.",
    `Scene: ${scene}`,
  ].join("\n");
}

function makeRenderPlan(script: ScriptV2) {
  const fps = 30;
  const shots = script.shots.map((s) => ({
    ...s,
    duration_seconds: Number(s.duration_seconds ?? 3),
  }));
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

export async function runPipelineJob(env: Env, job: PipelineJob, diaryText: string) {
  try {
    job = await setJob(env, job, {
      status: "generating_scenario",
      progress: 0.06,
      message: "Generating scenario...",
    });

    const openaiKey = String(env.OPENAI_API_KEY ?? env.VITE_OPENAI_API_KEY ?? "").trim();
    if (!openaiKey) throw new Error("Missing env: OPENAI_API_KEY (or VITE_OPENAI_API_KEY)");
    const openaiModel = String(env.VITE_OPENAI_MODEL ?? "gpt-4.1-mini");
    const imageModel = String(env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5");
    const elevenKey = requireEnv(env, "ELEVENLABS_API_KEY");
    const voiceId = String(env.ELEVENLABS_VOICE_ID ?? env.VITE_ELEVENLABS_VOICE_ID ?? "").trim();
    if (!voiceId) throw new Error("Missing env: ELEVENLABS_VOICE_ID (or VITE_ELEVENLABS_VOICE_ID)");
    const elevenModel = String(env.ELEVENLABS_MODEL_ID ?? env.VITE_ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5");
    const region = String(env.REMOTION_AWS_REGION ?? "us-east-1");
    const functionName = requireEnv(env, "REMOTION_FUNCTION_NAME");
    const serveUrl = requireEnv(env, "REMOTION_SERVE_URL");
    const bucketName = inferBucketName(env, serveUrl);
    const siteName = inferSiteName(serveUrl);
    const origin = new URL(serveUrl).origin;

    const scenarioText = await callOpenAiResponses(openaiKey, openaiModel, buildScenarioPrompt(diaryText));
    const script = parseScenarioText(scenarioText);
    job = await setJob(env, job, { totalShots: script.shots.length, completedShots: 0 });

    const s3 = new S3Client({
      region,
      credentials:
        env.REMOTION_AWS_ACCESS_KEY_ID && env.REMOTION_AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: String(env.REMOTION_AWS_ACCESS_KEY_ID),
              secretAccessKey: String(env.REMOTION_AWS_SECRET_ACCESS_KEY),
              sessionToken: env.REMOTION_AWS_SESSION_TOKEN,
            }
          : undefined,
    });

    const assetsByShotId: Record<string, { image_src: string; audio_src: string }> = {};
    const plan = makeRenderPlan(script);

    job = await setJob(env, job, {
      status: "generating_images",
      progress: 0.12,
      message: "Generating images...",
    });
    for (let i = 0; i < script.shots.length; i++) {
      const shot = script.shots[i];
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
      const imgUrl = `${origin}/${imageKey}`;
      assetsByShotId[shot.shot_id] = { image_src: imgUrl, audio_src: "" };
      job = await setJob(env, job, {
        progress: 0.12 + ((i + 1) / script.shots.length) * 0.28,
        message: `Generating images... (${i + 1}/${script.shots.length})`,
        completedShots: i + 1,
      });
    }

    job = await setJob(env, job, {
      status: "generating_narration",
      progress: 0.42,
      message: "Generating narration...",
    });
    for (let i = 0; i < script.shots.length; i++) {
      const shot = script.shots[i];
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
      job = await setJob(env, job, {
        progress: 0.42 + ((i + 1) / script.shots.length) * 0.28,
        message: `Generating narration... (${i + 1}/${script.shots.length})`,
        completedShots: i + 1,
      });
    }

    // BGM is expected to be pre-uploaded once.
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
        env.REMOTION_BGM_SRC ??
        `${origin}/sites/${siteName}/assets/bgm/BGM-01_warm-lofi-diary_78bpm_30s_loop_v01_type_A.mp3`,
    };

    for (let i = 0; i < plan.shots.length; i++) {
      const shot = plan.shots[i];
      const key = script.shots[i].shot_id;
      shot.assets = assetsByShotId[key];
    }

    const inputProps = {
      script,
      fps: plan.fps,
      assets_by_shot_id: assetsByShotId,
      render_params: renderParams,
      render_plan: plan,
    };

    job = await setJob(env, job, {
      status: "rendering_video",
      progress: 0.8,
      message: "Rendering video (AWS)...",
    });
    const requestedConcurrency = parsePositiveInt(env.REMOTION_LAMBDA_CONCURRENCY, 0);
    const framesPerLambda = parsePositiveInt(env.REMOTION_FRAMES_PER_LAMBDA, 40);
    const maxRetries = parsePositiveInt(env.REMOTION_MAX_RETRIES, 1);
    const privacy = String(env.REMOTION_PRIVACY ?? "public").toLowerCase() === "private" ? "private" : "public";

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

    let started;
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

    const pollMs = parsePositiveInt(env.REMOTION_PROGRESS_POLL_MS, 1500);
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
      job = await setJob(env, job, {
        progress: 0.8 + clamp(Number(p.overallProgress ?? 0), 0, 1) * 0.18,
        message: `Rendering video (AWS)... ${Math.round(clamp(Number(p.overallProgress ?? 0), 0, 1) * 100)}%`,
      });
      if (p.done) {
        if (!p.outputFile) throw new Error("Render done but output URL missing.");
        await setJob(env, job, { status: "done", progress: 1, message: "Done", outputUrl: p.outputFile });
        break;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  } catch (err) {
    await setJob(env, job, {
      status: "error",
      message: "Error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
