export type Env = {
  // Cloudflare Pages Functions env var (set as Secret)
  ELEVENLABS_API_KEY?: string;
};

type NarrationDirection = {
  intensity: number;
  delivery: {
    speaking_rate: number;
    energy: number;
    pause_ms_before: number;
    pause_ms_after: number;
  };
  tts_instruction?: string;
};

type ShotLike = {
  narration: string;
  narration_direction: NarrationDirection;
};

type RequestBody = {
  voice_id: string;
  model_id: string;
  shot: ShotLike;
  output_format?: string; // default mp3_44100_128
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function applyPauseText(input: string, beforeMs: number, afterMs: number) {
  const before = beforeMs >= 600 ? "... " : beforeMs >= 200 ? ", " : "";
  const after = afterMs >= 600 ? " ..." : afterMs >= 200 ? "," : "";
  return `${before}${input}${after}`.trim();
}

function buildVoiceSettings(shot: ShotLike) {
  const d = shot.narration_direction;

  const intensity = clamp(d.intensity ?? 0.5, 0, 1);
  const energy = clamp(d.delivery.energy ?? 0.5, 0, 1);
  const speakingRate = clamp(d.delivery.speaking_rate ?? 1, 0.5, 2.0);

  const expressiveness = clamp(intensity * 0.7 + energy * 0.3, 0, 1);

  let stability = 0.85 - expressiveness * 0.55;
  let similarityBoost = 0.9 - expressiveness * 0.15;
  let style = expressiveness;
  let speed = speakingRate;

  const instruction = (d.tts_instruction ?? "").toLowerCase();
  const hasAny = (tokens: string[]) => tokens.some((t) => instruction.includes(t));

  if (hasAny(["느리", "천천히", "slow", "slower"])) {
    speed *= 0.9;
  }
  if (hasAny(["편안", "차분", "조용", "잔잔", "calm", "comfortable", "soft"])) {
    stability += 0.12;
    style -= 0.12;
  }
  if (hasAny(["또렷", "명확", "clear"])) {
    similarityBoost += 0.05;
    stability += 0.05;
  }
  if (hasAny(["활기", "밝게", "에너지", "energetic", "bright"])) {
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          "Missing ELEVENLABS_API_KEY on server. Configure it as a Cloudflare Pages Secret and redeploy.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: RequestBody;
  try {
    body = (await context.request.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body?.voice_id || !body?.model_id || !body?.shot?.narration) {
    return new Response(
      JSON.stringify({
        error:
          "Missing required fields. Expected { voice_id, model_id, shot: { narration, narration_direction } }.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const outputFormat = body.output_format?.trim() || "mp3_44100_128";
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(body.voice_id)}?output_format=${encodeURIComponent(outputFormat)}`;

  const elevenBody = {
    text: applyPauseText(
      body.shot.narration,
      body.shot.narration_direction.delivery.pause_ms_before,
      body.shot.narration_direction.delivery.pause_ms_after,
    ),
    model_id: body.model_id,
    language_code: "ko",
    voice_settings: buildVoiceSettings(body.shot),
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
    return new Response(
      JSON.stringify({
        error: `ElevenLabs TTS failed: ${resp.status} ${text}`,
        status: resp.status,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Stream audio through as mp3.
  return new Response(resp.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
};
