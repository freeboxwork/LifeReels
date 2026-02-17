import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

function readRequestBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

type PipelineJobStatus =
  | "queued"
  | "generating_scenario"
  | "generating_images"
  | "generating_narration"
  | "rendering_video"
  | "done"
  | "error";

type PipelineJob = {
  id: string;
  createdAt: number;
  status: PipelineJobStatus;
  progress: number; // 0..1
  message: string;
  imageMode?: "v1" | "v2";
  error?: string;
  totalShots?: number;
  completedShots?: number;
  outputMp4Path?: string;
  outputUrl?: string;
};

type RenderProvider = "local" | "aws";

const pipelineJobs = new Map<string, PipelineJob>();

function writeJson(res: import("http").ServerResponse, status: number, obj: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function safeJsonParse(raw: string) {
  const s = raw && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(s);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

const MAX_ASSET_CONCURRENCY = 3;
const MAX_ASSET_RETRIES = 2;
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

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
  onItemDone,
}: {
  items: T[];
  concurrency: number;
  worker: (item: T, index: number) => Promise<R>;
  onItemDone?: (completedCount: number) => void;
}) {
  const results = new Array<R>(items.length);
  const maxWorkers = Math.max(1, Math.min(concurrency, items.length || 1));
  let cursor = 0;
  let completed = 0;

  const runWorker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const value = await withRetries(() => worker(items[index], index));
      results[index] = value;
      completed += 1;
      onItemDone?.(completed);
    }
  };

  await Promise.all(Array.from({ length: maxWorkers }, () => runWorker()));
  return results;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function sanitizeFileName(name: string) {
  return String(name).replace(/\s+/g, "");
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function getRenderProvider(env: Record<string, string>) {
  const raw = String(env.RENDER_PROVIDER || "local").trim().toLowerCase();
  return (raw === "aws" ? "aws" : "local") as RenderProvider;
}

function getRequiredEnv(env: Record<string, string>, key: string) {
  const value = String(env[key] || "").trim();
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

async function renderVideoOnAwsLambda({
  env,
  inputProps,
  set,
}: {
  env: Record<string, string>;
  inputProps: unknown;
  set: (patch: Partial<PipelineJob>) => void;
}) {
  const { getRenderProgress, renderMediaOnLambda } = await import("@remotion/lambda/client");
  const region = String(env.REMOTION_AWS_REGION || env.AWS_REGION || "us-east-1").trim();
  const functionName = getRequiredEnv(env, "REMOTION_FUNCTION_NAME");
  const serveUrl = getRequiredEnv(env, "REMOTION_SERVE_URL");

  // Support both standard AWS env names and project-prefixed names.
  if (!process.env.AWS_ACCESS_KEY_ID && env.REMOTION_AWS_ACCESS_KEY_ID) {
    process.env.AWS_ACCESS_KEY_ID = env.REMOTION_AWS_ACCESS_KEY_ID;
  }
  if (!process.env.AWS_SECRET_ACCESS_KEY && env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    process.env.AWS_SECRET_ACCESS_KEY = env.REMOTION_AWS_SECRET_ACCESS_KEY;
  }
  if (!process.env.AWS_SESSION_TOKEN && env.REMOTION_AWS_SESSION_TOKEN) {
    process.env.AWS_SESSION_TOKEN = env.REMOTION_AWS_SESSION_TOKEN;
  }
  if (!process.env.AWS_REGION) {
    process.env.AWS_REGION = region;
  }

  const framesPerLambda = parsePositiveInt(env.REMOTION_FRAMES_PER_LAMBDA, 40);
  const requestedConcurrency = parsePositiveInt(env.REMOTION_LAMBDA_CONCURRENCY, 0);
  const maxRetries = parsePositiveInt(env.REMOTION_MAX_RETRIES, 1);
  const privacy = String(env.REMOTION_PRIVACY || "public").trim().toLowerCase();
  const buildRenderArgs = (concurrencyOverride?: number) => {
    const base = {
      region,
      functionName,
      serveUrl,
      composition: "LifeReels",
      inputProps: inputProps as Record<string, unknown>,
      codec: "h264" as const,
      imageFormat: "jpeg" as const,
      maxRetries,
      privacy: (privacy === "private" ? "private" : "public") as "private" | "public",
    };
    if (concurrencyOverride && concurrencyOverride > 0) {
      return { ...base, concurrency: concurrencyOverride };
    }
    if (requestedConcurrency > 0) {
      return { ...base, concurrency: requestedConcurrency };
    }
    return { ...base, framesPerLambda };
  };

  let started: Awaited<ReturnType<typeof renderMediaOnLambda>>;
  try {
    started = await renderMediaOnLambda(buildRenderArgs());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/rate exceeded|concurrency limit/i.test(msg)) {
      set({
        message: "AWS concurrency limit hit. Retrying with concurrency=1...",
      });
      started = await renderMediaOnLambda(buildRenderArgs(1));
    } else {
      throw err;
    }
  }

  const pollMs = parsePositiveInt(env.REMOTION_PROGRESS_POLL_MS, 1500);
  while (true) {
    const progress = await getRenderProgress({
      region,
      functionName,
      bucketName: started.bucketName,
      renderId: started.renderId,
    });

    const overall = clamp(progress.overallProgress || 0, 0, 1);
    set({
      progress: 0.8 + overall * 0.18,
      message: `Rendering video (AWS)... ${Math.round(overall * 100)}%`,
    });

    if (progress.fatalErrorEncountered) {
      const reason = progress.errors?.[0]?.message || "Unknown AWS render error.";
      throw new Error(`AWS render failed: ${reason}`);
    }

    if (progress.done) {
      if (!progress.outputFile) {
        throw new Error("AWS render completed but outputFile is missing.");
      }
      return { outputUrl: progress.outputFile };
    }

    await sleep(pollMs);
  }
}

function isHttpUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function toPosixPath(s: string) {
  return String(s).replace(/\\/g, "/").replace(/^\/+/, "");
}

function getContentTypeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function getBucketNameForAwsRender(env: Record<string, string>, serveUrl: string) {
  const explicit = String(env.REMOTION_AWS_BUCKET_NAME || "").trim();
  if (explicit) return explicit;
  const host = new URL(serveUrl).hostname;
  return host.split(".")[0];
}

function getSiteNameFromServeUrl(serveUrl: string) {
  const u = new URL(serveUrl);
  const m = u.pathname.match(/\/sites\/([^/]+)\//);
  if (!m?.[1]) {
    throw new Error("Could not determine siteName from REMOTION_SERVE_URL.");
  }
  return m[1];
}

async function uploadRenderAssetsToS3ForAws({
  env,
  jobId,
  inputProps,
  set,
}: {
  env: Record<string, string>;
  jobId: string;
  inputProps: unknown;
  set: (patch: Partial<PipelineJob>) => void;
}) {
  const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
  const serveUrl = getRequiredEnv(env, "REMOTION_SERVE_URL");
  const region = String(env.REMOTION_AWS_REGION || env.AWS_REGION || "us-east-1").trim();
  const bucketName = getBucketNameForAwsRender(env, serveUrl);
  const siteName = getSiteNameFromServeUrl(serveUrl);
  const origin = new URL(serveUrl).origin;

  if (!process.env.AWS_ACCESS_KEY_ID && env.REMOTION_AWS_ACCESS_KEY_ID) {
    process.env.AWS_ACCESS_KEY_ID = env.REMOTION_AWS_ACCESS_KEY_ID;
  }
  if (!process.env.AWS_SECRET_ACCESS_KEY && env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    process.env.AWS_SECRET_ACCESS_KEY = env.REMOTION_AWS_SECRET_ACCESS_KEY;
  }
  if (!process.env.AWS_SESSION_TOKEN && env.REMOTION_AWS_SESSION_TOKEN) {
    process.env.AWS_SESSION_TOKEN = env.REMOTION_AWS_SESSION_TOKEN;
  }
  if (!process.env.AWS_REGION) {
    process.env.AWS_REGION = region;
  }

  const cloned = JSON.parse(JSON.stringify(inputProps ?? {})) as any;
  const refs: string[] = [];

  const assetsByShot = (cloned.assets_by_shot_id ?? {}) as Record<
    string,
    { image_src?: string; audio_src?: string }
  >;
  for (const v of Object.values(assetsByShot)) {
    if (v?.image_src) refs.push(String(v.image_src));
    if (v?.audio_src) refs.push(String(v.audio_src));
  }

  const planShots = Array.isArray(cloned.render_plan?.shots) ? cloned.render_plan.shots : [];
  for (const s of planShots) {
    const a = s?.assets;
    if (a?.image_src) refs.push(String(a.image_src));
    if (a?.audio_src) refs.push(String(a.audio_src));
  }

  if (cloned.render_params?.bgm_src) {
    refs.push(String(cloned.render_params.bgm_src));
  }

  const uniqueLocalRefs = Array.from(new Set(refs.filter((r) => r && !isHttpUrl(r))));
  if (uniqueLocalRefs.length === 0) {
    return cloned;
  }

  const s3 = new S3Client({ region });
  const mapped = new Map<string, string>();

  const resolveLocalAbsPath = (src: string) => {
    const raw = String(src || "");
    const rel = raw.replace(/^SampleResource\//, "");
    const candidates = [
      path.join(process.cwd(), "SampleResource", rel),
      path.join(process.cwd(), rel),
      path.join(process.cwd(), "bgm", path.basename(rel)),
      path.join(process.cwd(), "SampleResource", "bgm", path.basename(rel)),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return candidates[0];
  };

  const buildS3Key = (src: string) => {
    const rel = toPosixPath(src.replace(/^SampleResource\//, ""));
    if (rel.startsWith("jobs/")) {
      return `sites/${siteName}/assets/${rel}`;
    }
    if (rel.startsWith("bgm/")) {
      return `sites/${siteName}/assets/${rel}`;
    }
    return `sites/${siteName}/assets/jobs/${jobId}/${path.posix.basename(rel)}`;
  };

  for (let i = 0; i < uniqueLocalRefs.length; i++) {
    const src = uniqueLocalRefs[i];
    const absPath = resolveLocalAbsPath(src);
    if (!fs.existsSync(absPath)) {
      throw new Error(`AWS render asset missing: ${absPath}`);
    }
    const key = buildS3Key(src);
    const body = fs.readFileSync(absPath);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: getContentTypeFromPath(absPath),
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    const remoteUrl = `${origin}/${key}`;
    mapped.set(src, remoteUrl);
    mapped.set(src.replace(/^SampleResource\//, ""), remoteUrl);

    set({
      progress: 0.8 + ((i + 1) / uniqueLocalRefs.length) * 0.05,
      message: `Uploading render assets (AWS)... (${i + 1}/${uniqueLocalRefs.length})`,
    });
  }

  const replaceRef = (v: string | undefined) => {
    if (!v) return v;
    return mapped.get(v) || mapped.get(v.replace(/^SampleResource\//, "")) || v;
  };

  for (const v of Object.values(assetsByShot)) {
    if (v?.image_src) v.image_src = replaceRef(String(v.image_src));
    if (v?.audio_src) v.audio_src = replaceRef(String(v.audio_src));
  }
  for (const s of planShots) {
    if (s?.assets?.image_src) s.assets.image_src = replaceRef(String(s.assets.image_src));
    if (s?.assets?.audio_src) s.assets.audio_src = replaceRef(String(s.assets.audio_src));
  }
  if (cloned.render_params?.bgm_src) {
    cloned.render_params.bgm_src = replaceRef(String(cloned.render_params.bgm_src));
  }

  return cloned;
}

function normalizeApiKey(value: string) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function normalizeStyleName(input: unknown) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function resolveV2Style(scene: any, scenarioObj: any) {
  const explicit = normalizeStyleName(scenarioObj?.visual_dna?.style);
  if (explicit) return explicit;
  const tone = String(scenarioObj?.tone || scene?.narration_direction?.label || "").toLowerCase();
  if (/(sad|lonely|nostalg|regret|bittersweet)/i.test(tone)) return "blue_velvet";
  if (/(excited|hopeful|romantic|playful|joyful)/i.test(tone)) return "pastel_bloom";
  if (/(tired|stressed|overwhelmed|healing|comfort)/i.test(tone)) return "ember_glow";
  return "golden_hour";
}

function getV2StyleLayer(styleName: string) {
  switch (styleName) {
    case "blue_velvet":
      return [
        "Art Direction: Muted cinematic photography with cool undertones.",
        "Color Palette: Slate blue, lavender grey, dusty rose, faded navy.",
        "Lighting: Overcast daylight, blue hour twilight, soft diffused light.",
        "Texture: Heavy film grain, slightly desaturated, rain-on-glass softness.",
      ].join(" ");
    case "pastel_bloom":
      return [
        "Art Direction: Bright pastel illustration with dreamy photography blend.",
        "Color Palette: Soft pink, mint green, sky blue, light peach, cream.",
        "Lighting: Bright diffused daylight, cherry blossom light, airy glow.",
        "Texture: Light watercolor wash, minimal grain, clean and fresh.",
      ].join(" ");
    case "ember_glow":
      return [
        "Art Direction: Intimate low-light photography with warm dark tones.",
        "Color Palette: Deep burgundy, warm brown, candlelight orange, dark cream.",
        "Lighting: Candlelight, desk lamp glow, fireplace warmth, dusk interior.",
        "Texture: Rich film grain, vignette, shallow depth of field.",
      ].join(" ");
    default:
      return [
        "Art Direction: Warm cinematic photography with soft watercolor overlay.",
        "Color Palette: Amber, honey gold, warm cream, soft terracotta.",
        "Lighting: Golden hour sunlight, warm window glow, soft lens flare.",
        "Texture: Gentle film grain, soft focus edges, hand-painted warmth.",
      ].join(" ");
  }
}

function getV2CameraLayer(cutTypeInput: unknown) {
  const cutType = String(cutTypeInput || "").trim().toLowerCase();
  if (cutType === "establishing") {
    return "Camera: Wide shot, eye-level, deep focus, environmental composition.";
  }
  if (cutType === "detail") {
    return "Camera: Close-up, shallow depth of field, centered detail focus.";
  }
  if (cutType === "emotional") {
    return "Camera: Medium shot, rule of thirds, soft bokeh background.";
  }
  if (cutType === "transition") {
    return "Camera: Dynamic framing with subtle motion-blur hint, no people.";
  }
  if (cutType === "closing") {
    return "Camera: Medium-wide, centered composition, soft vignette for closure.";
  }
  return "Camera: Cinematic eye-level framing, stable composition, no people.";
}

function getV2PresenceLayer(levelInput: unknown) {
  const level = Number(levelInput);
  if (level === 1) {
    return [
      "Presence: ABSOLUTELY NO HUMANS. No people, no faces, no silhouettes, no body parts, no shadows of people, no figures of any size.",
      "Only gender-neutral object traces of recent human activity are allowed: condensation on glass, a half-empty cup, a crumpled napkin, a creased blanket, an open book left face-down, water rings on a table.",
      "NEVER show: shoes, clothing, bags, accessories, shadows of people, silhouettes, or any item that could indicate gender, age, or appearance.",
    ].join(" ");
  }
  return [
    "Presence: ABSOLUTELY NO HUMANS. No people, no faces, no silhouettes, no hands, no arms, no legs, no body parts, no shadows of people, no figures of any size or distance.",
    "Pure still life or landscape only.",
  ].join(" ");
}

function buildV2VisualDnaLayer(visualDna: any) {
  const primary = String(visualDna?.primary_location || "").trim();
  const timeOfDay = String(visualDna?.time_of_day || "").trim();
  const weather = String(visualDna?.weather || "").trim();
  const recurring = Array.isArray(visualDna?.recurring_objects)
    ? visualDna.recurring_objects.map((v: unknown) => String(v || "").trim()).filter(Boolean).slice(0, 6)
    : [];
  const anchors = Array.isArray(visualDna?.color_anchors)
    ? visualDna.color_anchors.map((v: unknown) => String(v || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  const world = [primary, timeOfDay, weather].filter(Boolean).join(", ");
  const parts = [
    world ? `Consistent World: ${world}.` : "Consistent World: quiet cinematic memory fragments.",
    recurring.length ? `Recurring Elements: ${recurring.join(", ")}.` : "",
    anchors.length ? `Color Anchors: ${anchors.join(", ")}.` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function buildV2Negative(levelInput: unknown, scene: any) {
  const common = [
    "any text, readable text, letters, typography, words, numbers, subtitles, captions",
    "Hangul, Korean text, Chinese characters, Japanese text",
    "sign, signage, signboard, shop sign, neon sign, billboard, poster, menu, label",
    "watermark, signature, logo",
    "video game, FPS, HUD, UI overlay, game screenshot, VR",
    "distorted perspective, surreal scale, giant objects, miniature world",
    "cartoon face, anime character, chibi, mascot",
    "person, people, human, crowd, face, body parts, silhouette",
    "hands, arms, legs, feet, fingers, torso",
    "pedestrian, passerby, crossing, walking person",
    "close-up legs, close-up shoes, cropped body, giant legs, oversized shoes",
    "foreground legs, low angle, floating hands, holding objects",
    "shadow of person, human shadow, figure shadow",
  ];
  const level0 = [
    "footprint, human trace, used tissue, personal belongings",
    "shoes, slippers, sandals, sneakers, boots",
    "clothing, jacket, scarf, hat, bag, purse, backpack",
    "cosmetics, razor, toothbrush, personal care items",
  ];
  const level1 = [
    "shoes, slippers, sandals, sneakers, boots, high heels",
    "clothing, jacket, scarf, hat, bag, purse, backpack, watch",
    "cosmetics, makeup, razor, hair accessories, jewelry",
    "gendered items, feminine items, masculine items",
    "shadow of person, human shadow, figure shadow, silhouette",
  ];
  const extraExercise = /(exercise|workout|stretch|yoga|athlete|jog|running|run|training)/i.test(
    `${scene?.visual_description || ""} ${scene?.image_prompt || ""}`,
  )
    ? [
        "athlete, workout person, stretching person",
        "street workout, exercising on road, lying on asphalt, outdoor yoga person",
      ]
    : [];
  const level = Number(levelInput);
  return [...common, ...(level === 1 ? level1 : level0), ...extraExercise].join(", ");
}

function buildShotSpecificForImagePrompt(rawInput: unknown) {
  const raw = String(rawInput || "").trim().replace(/^Scene:\s*/i, "");
  const sceneCore = raw || "Quiet cinematic still life scene with environmental atmosphere.";
  return `${sceneCore}${sceneCore.endsWith(".") ? "" : "."} Focus on inanimate objects and environmental details only. No humans visible.`;
}

function buildV2ImagePrompt({
  shot,
  scenarioObj,
}: {
  shot: any;
  scenarioObj: any;
}) {
  const shotId = String(shot?.shot_id || "");
  const sceneById = Array.isArray(scenarioObj?.scenes)
    ? scenarioObj.scenes.find((s: any) => String(s?.scene_id || "") === shotId)
    : undefined;
  const styleName = resolveV2Style(sceneById, scenarioObj);
  const styleLayer = getV2StyleLayer(styleName);
  const visualDnaLayer = buildV2VisualDnaLayer(scenarioObj?.visual_dna);
  const presenceLayer = getV2PresenceLayer(sceneById?.presence_level ?? 0);
  const cameraLayer = getV2CameraLayer(sceneById?.cut_type);

  const sceneCore = String(
    sceneById?.scene_description || shot?.image_prompt || shot?.visual_description || "",
  )
    .trim()
    .replace(/^Scene:\s*/i, "");
  const settingAnchor = scenarioObj?.visual_dna?.primary_location
    ? `Setting Anchor: ${String(scenarioObj.visual_dna.primary_location)}.`
    : "Setting Anchor: consistent still-life world.";
  const sceneLayer = `${settingAnchor} ${sceneCore}${sceneCore.endsWith(".") ? "" : "."}`.trim();
  const negativeLayer = buildV2Negative(sceneById?.presence_level ?? 0, shot);

  return [
    "[L1_STYLE]",
    styleLayer,
    "",
    "[L2_VISUAL_DNA]",
    visualDnaLayer,
    "",
    "[L3_PRESENCE]",
    presenceLayer,
    "",
    "[L4_SCENE]",
    sceneLayer,
    "",
    "[L5_CAMERA]",
    cameraLayer,
    "",
    "[NEGATIVE]",
    negativeLayer,
  ].join("\n");
}

function quoteArgWindows(s: string) {
  // Quote for cmd.exe. Spawn passes args; we build a command string for cmd /c.
  const v = String(s);
  if (!/[\s"]/g.test(v)) return v;
  return `"${v.replace(/"/g, '\\"')}"`;
}

async function runCmdWindows(
  command: string,
  cwd: string,
  onStdout?: (chunk: string) => void,
) {
  await new Promise<void>((resolve, reject) => {
    const p = spawn("cmd.exe", ["/d", "/s", "/c", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let err = "";
    p.stdout.on("data", (d) => onStdout?.(String(d)));
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("error", (e) => reject(e));
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code}): ${err}`));
    });
  });
}

async function callOpenAiResponses({
  apiKey,
  model,
  prompt,
}: {
  apiKey: string;
  model: string;
  prompt: string;
}) {
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`OpenAI Responses failed: ${resp.status} ${text}`);
  }

  const data = safeJsonParse(text) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  if (data.output_text?.trim()) return data.output_text.trim();
  const chunks =
    data.output
      ?.flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text" && typeof c.text === "string")
      .map((c) => c.text?.trim() ?? "")
      .filter(Boolean) ?? [];
  return chunks.join("\n").trim();
}

async function callOpenAiImage({
  apiKey,
  model,
  prompt,
}: {
  apiKey: string;
  model: string;
  prompt: string;
}) {
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
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

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`OpenAI image failed: ${resp.status} ${text}`);
  }

  const data = safeJsonParse(text) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = data.data?.[0];
  if (!item) throw new Error("OpenAI image returned empty data.");
  if (item.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item.url) {
    const imgResp = await fetch(item.url);
    if (!imgResp.ok) throw new Error(`OpenAI image URL fetch failed: ${imgResp.status}`);
    return Buffer.from(await imgResp.arrayBuffer());
  }
  throw new Error("OpenAI image missing b64_json/url.");
}

function buildScenarioPromptV3(diaryText: string) {
  // Keep it deterministic and strict.
  return `
You are a strict JSON generator for a short-form video scenario.
Return ONLY a valid JSON object. No markdown. No comments.
Schema version must be reels_script_v3.

Output schema:
{
  "schema_version": "reels_script_v3",
  "language": "ko",
  "date": "YYYY-MM-DD",
  "title": "string",
  "tone": "string",
  "target_total_duration_seconds": 15,
  "shots": [
    {
      "shot_id": "s1",
      "visual_description": "string",
      "subtitle": "string",
      "narration": "string",
      "image_prompt": "string",
      "transition": "cut|fade|crossfade|zoom_in|zoom_out|slide_left|slide_right",
      "timing_hints": {
        "min_duration_seconds": 2.2,
        "max_duration_seconds": 7,
        "padding_ms": 180
      },
      "narration_direction": {
        "label": "calm|warm|anxious|relieved|grateful|joyful|lonely|bittersweet|hopeful|tired|playful|determined",
        "intensity": 0.0,
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

function buildScenarioPromptV3V2(diaryText: string) {
  return `
You are a strict JSON generator for a short-form video scenario.
Return ONLY a valid JSON object. No markdown. No comments.
Schema version must be reels_script_v3.

Output schema:
{
  "schema_version": "reels_script_v3",
  "language": "ko",
  "date": "YYYY-MM-DD",
  "title": "string",
  "tone": "string",
  "target_total_duration_seconds": 15,
  "visual_dna": {
    "style": "golden_hour|blue_velvet|pastel_bloom|ember_glow",
    "primary_location": "string",
    "secondary_location": "string",
    "time_of_day": "string",
    "weather": "string",
    "recurring_objects": ["string"],
    "color_anchors": ["string"]
  },
  "scenes": [
    {
      "scene_id": "s1",
      "cut_type": "establishing|detail|emotional|transition|closing",
      "presence_level": 0,
      "emotion_intensity": 0.0,
      "scene_description": "string"
    }
  ],
  "shots": [
    {
      "shot_id": "s1",
      "visual_description": "string",
      "subtitle": "string",
      "narration": "string",
      "image_prompt": "string",
      "transition": "cut|fade|crossfade|zoom_in|zoom_out|slide_left|slide_right",
      "timing_hints": {
        "min_duration_seconds": 2.2,
        "max_duration_seconds": 7,
        "padding_ms": 180
      },
      "narration_direction": {
        "label": "calm|warm|anxious|relieved|grateful|joyful|lonely|bittersweet|hopeful|tired|playful|determined",
        "intensity": 0.0,
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
- Use 5 shots by default
- Preserve privacy and avoid sensitive personal details
- Enforce no humans in visual descriptions
- Convert action verbs into object/environment cues
- Provide visual_dna and scenes aligned by scene_id with shots
- scenes.presence_level must be only 0 or 1
- At most two scenes can use presence_level=1
- Do not output fields outside schema

Diary:
${diaryText}
  `.trim();
}

const EMOTION_LABELS = new Set([
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
]);

function validateScenarioV3(obj: any) {
  const errors: string[] = [];
  if (!obj || typeof obj !== "object") errors.push("Scenario is not an object.");
  if (obj?.schema_version !== "reels_script_v3") errors.push("schema_version must be reels_script_v3.");
  if (obj?.language !== "ko") errors.push("language must be ko.");
  if (!Array.isArray(obj?.shots) || obj.shots.length < 1) errors.push("shots must be a non-empty array.");

  const ttsSet = new Set<string>();
  const labelSet = new Set<string>();

  const shots = Array.isArray(obj?.shots) ? obj.shots : [];
  for (const s of shots) {
    if (!s?.shot_id) errors.push("shot_id missing.");
    if (!s?.subtitle) errors.push(`${s?.shot_id || "shot"} subtitle missing.`);
    if (!s?.narration) errors.push(`${s?.shot_id || "shot"} narration missing.`);
    if (!s?.image_prompt) errors.push(`${s?.shot_id || "shot"} image_prompt missing.`);
    if (!s?.visual_description) errors.push(`${s?.shot_id || "shot"} visual_description missing.`);
    if (!s?.narration_direction) errors.push(`${s?.shot_id || "shot"} narration_direction missing.`);

    const nd = s?.narration_direction;
    if (nd) {
      const label = String(nd.label || "");
      if (!EMOTION_LABELS.has(label)) errors.push(`${s?.shot_id || "shot"} invalid label: ${label}`);
      labelSet.add(label);
      const inst = String(nd.tts_instruction || "").trim();
      if (!inst) errors.push(`${s?.shot_id || "shot"} tts_instruction missing.`);
      if (inst) {
        if (ttsSet.has(inst)) errors.push(`duplicate tts_instruction: ${inst}`);
        ttsSet.add(inst);
      }
      if (typeof nd.intensity !== "number" || nd.intensity < 0 || nd.intensity > 1) {
        errors.push(`${s?.shot_id || "shot"} intensity must be 0..1`);
      }
      const d = nd.delivery;
      if (!d) errors.push(`${s?.shot_id || "shot"} delivery missing.`);
    }
  }
  if (labelSet.size < 2) errors.push("Use at least 2 distinct narration_direction.label values.");
  return { ok: errors.length === 0, errors };
}

function applyPauseText(input: string, beforeMs: number, afterMs: number) {
  const before = beforeMs >= 600 ? "... " : beforeMs >= 200 ? ", " : "";
  const after = afterMs >= 600 ? " ..." : afterMs >= 200 ? "," : "";
  return `${before}${input}${after}`.trim();
}

function buildElevenVoiceSettingsFromShot(shot: any) {
  const d = shot.narration_direction;
  const intensity = clamp(Number(d.intensity ?? 0.5), 0, 1);
  const energy = clamp(Number(d.delivery.energy ?? 0.5), 0, 1);
  const speakingRate = clamp(Number(d.delivery.speaking_rate ?? 1), 0.5, 2.0);
  const expressiveness = clamp(intensity * 0.7 + energy * 0.3, 0, 1);

  let stability = 0.85 - expressiveness * 0.55;
  let similarityBoost = 0.9 - expressiveness * 0.15;
  let style = expressiveness;
  let speed = speakingRate;

  const instruction = String(d.tts_instruction || "").toLowerCase();
  const hasAny = (tokens: string[]) => tokens.some((t) => instruction.includes(t));
  if (hasAny(["slow", "slower"])) speed *= 0.9;
  if (hasAny(["calm", "comfortable", "soft"])) {
    stability += 0.12;
    style -= 0.12;
  }
  if (hasAny(["clear"])) {
    similarityBoost += 0.05;
    stability += 0.05;
  }
  if (hasAny(["energetic", "bright"])) {
    style += 0.15;
    stability -= 0.08;
    speed *= 1.05;
  }

  return {
    stability: clamp(stability, 0, 1),
    similarity_boost: clamp(similarityBoost, 0, 1),
    style: clamp(style, 0, 1),
    use_speaker_boost: true,
    speed: clamp(speed, 0.7, 1.3),
  };
}

async function callElevenLabsTtsToFile({
  apiKey,
  voiceId,
  modelId,
  shot,
  outPath,
}: {
  apiKey: string;
  voiceId: string;
  modelId: string;
  shot: any;
  outPath: string;
}) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const elevenBody = {
    text: applyPauseText(
      String(shot.narration || ""),
      Number(shot.narration_direction?.delivery?.pause_ms_before ?? 0),
      Number(shot.narration_direction?.delivery?.pause_ms_after ?? 0),
    ),
    model_id: modelId,
    language_code: "ko",
    voice_settings: buildElevenVoiceSettingsFromShot(shot),
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(elevenBody),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ElevenLabs TTS failed: ${resp.status} ${text}`);
  }
  ensureDir(path.dirname(outPath));
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

async function runPipelineJob({
  job,
  diaryText,
  env,
  imageMode,
}: {
  job: PipelineJob;
  diaryText: string;
  env: Record<string, string>;
  imageMode: "v1" | "v2";
}) {
  const set = (patch: Partial<PipelineJob>) => {
    const next = { ...job, ...patch };
    Object.assign(job, next);
    pipelineJobs.set(job.id, job);
  };

  const openaiKey = normalizeApiKey(env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY);
  if (!openaiKey) throw new Error("Missing OPENAI_API_KEY in .env (server-side).");
  const model = env.OPENAI_MODEL || env.VITE_OPENAI_MODEL || "gpt-4.1-mini";
  const imageModel = env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";

  const elevenKey = normalizeApiKey(env.ELEVENLABS_API_KEY);
  if (!elevenKey) throw new Error("Missing ELEVENLABS_API_KEY in .env (server-side).");
  const voiceId = String(env.VITE_ELEVENLABS_VOICE_ID || env.ELEVENLABS_VOICE_ID || "").trim();
  if (!voiceId) throw new Error("Missing VITE_ELEVENLABS_VOICE_ID (or ELEVENLABS_VOICE_ID) in .env.");
  const elevenModel = String(env.VITE_ELEVENLABS_MODEL_ID || "eleven_flash_v2_5").trim();

  const sampleResourceDir = path.join(process.cwd(), "SampleResource");
  const jobAssetDir = path.join(sampleResourceDir, "jobs", job.id);
  ensureDir(jobAssetDir);

  set({
    status: "generating_scenario",
    progress: 0.03,
    message: `Generating scenario... (${imageMode.toUpperCase()})`,
  });
  const scenarioText = await callOpenAiResponses({
    apiKey: openaiKey,
    model,
    prompt: imageMode === "v2" ? buildScenarioPromptV3V2(diaryText) : buildScenarioPromptV3(diaryText),
  });

  const scenarioObj = safeJsonParse(scenarioText);
  const valid = validateScenarioV3(scenarioObj);
  if (!valid.ok) {
    throw new Error(`Invalid reels_script_v3: ${valid.errors.join(" | ")}`);
  }

  // Add missing metadata if needed.
  if (!scenarioObj.date) {
    const d = new Date();
    scenarioObj.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const shots = scenarioObj.shots;
  set({
    totalShots: shots.length,
    completedShots: 0,
  });

  // Generate images.
  set({ status: "generating_images", progress: 0.08, message: "Generating images..." });
  const BASE_STYLE =
    "Art Style: Warm animation background painting mixed with cinematic film photography. Geography: Modern South Korea, Seoul city vibe, clean streets, power lines against the sky. Texture: Soft watercolor feel, gentle hand-painted textures, subtle film grain. Lighting: Soft natural daylight, warm palette, shallow depth of field (bokeh). Vibe: Nostalgic, cozy, calm, sentimental, emotional.";
  const CHARACTER_ANCHOR =
    "Presence Rule: ABSOLUTELY NO HUMANS. No people, no faces, no silhouettes, no hands/arms/legs, no body parts. Text Rule: ABSOLUTELY NO TEXT. No letters, no numbers, no signage, no labels, no menus, no posters, no captions anywhere in the image. Camera Role: Invisible observer capturing still life or landscape. Composition: Cinematic composition, rule of thirds, focus on inanimate objects and environmental details (light rays, steam, wind). Scale Rule: Realistic proportions, normal scale, no forced perspective, no wide-angle distortion. Lens/feel: 50mm natural perspective. Street Rule (when outdoors): empty streets only, no pedestrians, no crossing people, no cropped passersby.";
  const NEGATIVE_PROMPT =
    "any text, readable text, letters, typography, words, numbers, subtitles, captions, Hangul, Korean text, Korean characters, Hanja, Chinese characters, Japanese text, Kanji, Hiragana, Katakana, sign, signage, signboard, shop sign, neon sign, billboard, poster, menu, label, packaging text, street name, watermark, signature, logo, video game, FPS, first-person shooter, HUD, UI overlay, game screenshot, VR, person, people, human, crowd, face, body parts, silhouette, hands, arms, legs, pedestrian, passerby, crossing, walking person, street crossing, crosswalk person, close-up legs, close-up shoes, cropped body, giant legs, oversized shoes, foreground legs, low angle, floating hands, holding objects, eating, drinking, touching, distorted perspective, surreal scale, giant objects, miniature world.";

  const assetsByShotId: Record<string, { image_src: string; audio_src: string }> = {};

  await mapWithConcurrencyAndRetry({
    items: shots,
    concurrency: MAX_ASSET_CONCURRENCY,
    worker: async (shot, i) => {
      const imgPrompt =
        imageMode === "v2"
          ? buildV2ImagePrompt({ shot, scenarioObj })
          : `AESTHETIC_LENS:\n${BASE_STYLE}\n\nATMOSPHERE_ANCHOR:\n${CHARACTER_ANCHOR}\n\nSCENE_DETAIL:\n${buildShotSpecificForImagePrompt(
              shot.image_prompt || shot.visual_description || "",
            )}\n\nNEGATIVE:\n${NEGATIVE_PROMPT}`;
      const buf = await callOpenAiImage({ apiKey: openaiKey, model: imageModel, prompt: imgPrompt });

      const imgName = `s_${i + 1}.png`;
      const imgRel = `SampleResource/jobs/${job.id}/${imgName}`;
      const imgAbs = path.join(jobAssetDir, imgName);
      fs.writeFileSync(imgAbs, buf);

      assetsByShotId[String(shot.shot_id)] = {
        image_src: imgRel,
        audio_src: `SampleResource/jobs/${job.id}/Narr_S_${i + 1}.mp3`,
      };
    },
    onItemDone: (completed) => {
      const p = 0.08 + (completed / shots.length) * 0.32;
      set({
        progress: clamp(p, 0, 1),
        message: `Generating images... (${completed}/${shots.length})`,
        completedShots: completed,
      });
    },
  });

  // Generate narration audio.
  set({ status: "generating_narration", progress: 0.42, message: "Generating narration..." });
  await mapWithConcurrencyAndRetry({
    items: shots,
    concurrency: MAX_ASSET_CONCURRENCY,
    worker: async (shot, i) => {
      const outAbs = path.join(jobAssetDir, `Narr_S_${i + 1}.mp3`);
      await callElevenLabsTtsToFile({
        apiKey: elevenKey,
        voiceId,
        modelId: elevenModel,
        shot,
        outPath: outAbs,
      });
    },
    onItemDone: (completed) => {
      const p = 0.42 + (completed / shots.length) * 0.34;
      set({
        progress: clamp(p, 0, 1),
        message: `Generating narration... (${completed}/${shots.length})`,
        completedShots: completed,
      });
    },
  });

  // Prepare render props.
  const propsDir = path.join(process.cwd(), "video", "tmp");
  ensureDir(propsDir);
  const propsPath = path.join(propsDir, `props-${job.id}.json`);
  const resolvedPath = path.join(propsDir, `resolved-${job.id}.json`);

  const renderInput = {
    script: scenarioObj,
    fps: 30,
    assets_by_shot_id: assetsByShotId,
    render_params: {
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
    },
  };
  fs.writeFileSync(propsPath, JSON.stringify(renderInput, null, 2));

  // Resolve render plan.
  const resolveScript = path.join(process.cwd(), "video", "scripts", "resolve-render-plan.mjs");
  await new Promise<void>((resolve, reject) => {
    const p = spawn(process.execPath, [resolveScript, propsPath, resolvedPath], {
      cwd: path.join(process.cwd(), "video"),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`resolve-render-plan failed (${code}): ${err}`));
    });
  });

  const resolvedInputProps = safeJsonParse(fs.readFileSync(resolvedPath, "utf8"));
  const renderProvider = getRenderProvider(env);

  // Render video using selected provider.
  set({ status: "rendering_video", progress: 0.8, message: "Rendering video..." });
  let outputMp4Path: string | undefined;
  let outputUrl: string;

  if (renderProvider === "aws") {
    set({ progress: 0.8, message: "Uploading render assets (AWS)..." });
    const awsInputProps = await uploadRenderAssetsToS3ForAws({
      env,
      jobId: job.id,
      inputProps: resolvedInputProps,
      set,
    });
    set({ progress: 0.86, message: "Rendering video (AWS)..." });
    const awsResult = await renderVideoOnAwsLambda({ env, inputProps: awsInputProps, set });
    outputUrl = awsResult.outputUrl;
  } else {
    const remotionCmd = path.join(process.cwd(), "video", "node_modules", ".bin", "remotion.cmd");
    if (!fs.existsSync(remotionCmd)) {
      throw new Error(
        `Remotion CLI not found at ${remotionCmd}. Run "cd video && npm install" first.`,
      );
    }
    const outDir = path.join(process.cwd(), "video", "out", "jobs");
    ensureDir(outDir);
    const outMp4 = path.join(outDir, `${job.id}.mp4`);
    outputMp4Path = outMp4;
    outputUrl = `/api/pipeline/video/${encodeURIComponent(job.id)}`;

    const videoCwd = path.join(process.cwd(), "video");
    const cmd =
      `${quoteArgWindows(remotionCmd)} render src/index.ts LifeReels ` +
      `${quoteArgWindows(outMp4)} --props=${quoteArgWindows(resolvedPath)}`;

    try {
      if (process.platform === "win32") {
        await runCmdWindows(cmd, videoCwd, (s) => {
          const m = s.match(/Rendered\s+(\d+)\/(\d+)/);
          if (!m) return;
          const done = Number(m[1]);
          const total = Number(m[2]) || 1;
          const t = clamp(done / total, 0, 1);
          set({
            progress: 0.8 + t * 0.18,
            message: `Rendering video... (${done}/${total})`,
          });
        });
      } else {
        // Best-effort non-Windows support.
        await new Promise<void>((resolve, reject) => {
          const p = spawn(remotionCmd, ["render", "src/index.ts", "LifeReels", outMp4, `--props=${resolvedPath}`], {
            cwd: videoCwd,
            stdio: ["ignore", "pipe", "pipe"],
          });
          p.stdout.on("data", (d) => {
            const s = String(d);
            const m = s.match(/Rendered\s+(\d+)\/(\d+)/);
            if (!m) return;
            const done = Number(m[1]);
            const total = Number(m[2]) || 1;
            const t = clamp(done / total, 0, 1);
            set({
              progress: 0.8 + t * 0.18,
              message: `Rendering video... (${done}/${total})`,
            });
          });
          let err = "";
          p.stderr.on("data", (d) => (err += String(d)));
          p.on("error", (e) => reject(e));
          p.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`remotion render failed (${code}): ${err}`));
          });
        });
      }
    } catch (e) {
      // Provide more context to the UI.
      throw new Error(
        `Remotion render failed: ${e instanceof Error ? e.message : String(e)} (cmd=${cmd})`,
      );
    }
  }

  set({
    status: "done",
    progress: 1,
    message: "Done",
    outputMp4Path,
    outputUrl,
  });
}

export default defineConfig(({ mode }) => {
  // Load non-VITE_ envs too (ex: ELEVENLABS_API_KEY) for dev-server middleware.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "elevenlabs-dev-proxy",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            // One-stop pipeline endpoints (local dev only).
            if (req.url?.startsWith("/api/pipeline/")) {
              try {
                const urlObj = new URL(req.url, "http://localhost");

                if (req.method === "POST" && urlObj.pathname === "/api/pipeline/start") {
                  const raw = await readRequestBody(req);
                  const body = safeJsonParse(raw) as { diaryText?: string; imageMode?: string };
                  const diaryText = String(body.diaryText || "").trim();
                  const imageMode: "v1" | "v2" =
                    String(body.imageMode || "").trim().toLowerCase() === "v2" ? "v2" : "v1";
                  if (!diaryText) {
                    writeJson(res, 400, { error: "Missing diaryText." });
                    return;
                  }

                  const id = crypto.randomBytes(8).toString("hex");
                  const job: PipelineJob = {
                    id,
                    createdAt: Date.now(),
                    status: "queued",
                    progress: 0,
                    message: "Queued",
                    imageMode,
                  };
                  pipelineJobs.set(id, job);

                  // Fire-and-forget async job.
                  void (async () => {
                    try {
                      await runPipelineJob({ job, diaryText, env, imageMode });
                    } catch (e) {
                      job.status = "error";
                      job.progress = job.progress || 0;
                      job.message = "Error";
                      job.error = e instanceof Error ? e.message : String(e);
                      pipelineJobs.set(id, job);
                    }
                  })();

                  writeJson(res, 200, { id });
                  return;
                }

                if (req.method === "GET" && urlObj.pathname === "/api/pipeline/status") {
                  const id = urlObj.searchParams.get("id") || "";
                  const job = pipelineJobs.get(id);
                  if (!job) {
                    writeJson(res, 404, { error: "Job not found." });
                    return;
                  }
                  writeJson(res, 200, job);
                  return;
                }

                if (req.method === "GET" && urlObj.pathname.startsWith("/api/pipeline/video/")) {
                  const id = decodeURIComponent(urlObj.pathname.split("/").pop() || "");
                  const job = pipelineJobs.get(id);
                  if (!job?.outputMp4Path) {
                    writeJson(res, 404, { error: "Video not ready." });
                    return;
                  }
                  if (!fs.existsSync(job.outputMp4Path)) {
                    writeJson(res, 404, { error: "Video file missing on disk." });
                    return;
                  }
                  res.statusCode = 200;
                  res.setHeader("Content-Type", "video/mp4");
                  res.setHeader("Cache-Control", "no-store");
                  fs.createReadStream(job.outputMp4Path).pipe(res);
                  return;
                }

                writeJson(res, 404, { error: "Unknown pipeline endpoint." });
                return;
              } catch (e) {
                writeJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
                return;
              }
            }

            if (req.method !== "POST" || !req.url?.startsWith("/api/elevenlabs/tts")) {
              next();
              return;
            }

            const apiKey = env.ELEVENLABS_API_KEY;
            if (!apiKey) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error:
                    "Missing ELEVENLABS_API_KEY for local proxy. Add ELEVENLABS_API_KEY=... to .env and restart dev server.",
                }),
              );
              return;
            }

            try {
              const raw = await readRequestBody(req);
              // Reuse the Pages Functions handler logic locally by just proxying to the real API.
              // The client request already contains voice_id/model_id/shot.
              const parsed = JSON.parse(raw) as {
                voice_id: string;
                model_id: string;
                shot: {
                  narration: string;
                  narration_direction: {
                    intensity: number;
                    delivery: {
                      speaking_rate: number;
                      energy: number;
                      pause_ms_before: number;
                      pause_ms_after: number;
                    };
                    tts_instruction?: string;
                  };
                };
                output_format?: string;
              };

              const outputFormat = parsed.output_format?.trim() || "mp3_44100_128";
              const url =
                "https://api.elevenlabs.io/v1/text-to-speech/" +
                encodeURIComponent(parsed.voice_id) +
                "?output_format=" +
                encodeURIComponent(outputFormat);

              const before =
                parsed.shot.narration_direction.delivery.pause_ms_before >= 600
                  ? "... "
                  : parsed.shot.narration_direction.delivery.pause_ms_before >= 200
                    ? ", "
                    : "";
              const after =
                parsed.shot.narration_direction.delivery.pause_ms_after >= 600
                  ? " ..."
                  : parsed.shot.narration_direction.delivery.pause_ms_after >= 200
                    ? ","
                    : "";
              const text = `${before}${parsed.shot.narration}${after}`.trim();

              const clamp = (v: number, min: number, max: number) =>
                Math.min(max, Math.max(min, v));
              const intensity = clamp(parsed.shot.narration_direction.intensity ?? 0.5, 0, 1);
              const energy = clamp(parsed.shot.narration_direction.delivery.energy ?? 0.5, 0, 1);
              const speakingRate = clamp(
                parsed.shot.narration_direction.delivery.speaking_rate ?? 1,
                0.5,
                2.0,
              );
              const expressiveness = clamp(intensity * 0.7 + energy * 0.3, 0, 1);

              let stability = 0.85 - expressiveness * 0.55;
              let similarityBoost = 0.9 - expressiveness * 0.15;
              let style = expressiveness;
              let speed = speakingRate;

              const instruction = String(
                parsed.shot.narration_direction.tts_instruction || "",
              ).toLowerCase();
              const hasAny = (tokens: string[]) =>
                tokens.some((t) => instruction.includes(t));

              if (hasAny(["slow", "slower"])) speed *= 0.9;
              if (hasAny(["?몄븞", "李⑤텇", "議곗슜", "?붿옍", "calm", "comfortable", "soft"])) {
                stability += 0.12;
                style -= 0.12;
              }
              if (hasAny(["?먮졆", "紐낇솗", "clear"])) {
                similarityBoost += 0.05;
                stability += 0.05;
              }
              if (hasAny(["?쒓린", "諛앷쾶", "?먮꼫吏", "energetic", "bright"])) {
                style += 0.15;
                stability -= 0.08;
                speed *= 1.05;
              }

              const elevenBody = {
                text,
                model_id: parsed.model_id,
                language_code: "ko",
                voice_settings: {
                  stability: clamp(stability, 0, 1),
                  similarity_boost: clamp(similarityBoost, 0, 1),
                  style: clamp(style, 0, 1),
                  use_speaker_boost: true,
                  speed: clamp(speed, 0.7, 1.3),
                },
              };

              const upstreamResp = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "audio/mpeg",
                  "xi-api-key": apiKey,
                },
                body: JSON.stringify(elevenBody),
              });

              if (!upstreamResp.ok) {
                const errText = await upstreamResp.text();
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    error: `ElevenLabs TTS failed: ${upstreamResp.status} ${errText}`,
                    status: upstreamResp.status,
                  }),
                );
                return;
              }

              const buf = Buffer.from(await upstreamResp.arrayBuffer());
              res.statusCode = 200;
              res.setHeader("Content-Type", "audio/mpeg");
              res.setHeader("Cache-Control", "no-store");
              res.end(buf);
            } catch (err) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error:
                    err instanceof Error ? err.message : "Local ElevenLabs proxy error.",
                }),
              );
            }
          });
        },
      },
    ],
  };
});

