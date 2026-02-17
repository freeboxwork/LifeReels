import type { ReelShotV2 } from "./reelsScriptTypes";

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
};

export type ElevenLabsVoicesResponse = {
  voices?: ElevenLabsVoice[];
};

export type ElevenLabsVoiceSettings = {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
};

export type ElevenLabsTtsRequestBody = {
  text: string;
  model_id: string;
  language_code?: string;
  voice_settings?: ElevenLabsVoiceSettings;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function applyPauseText(input: string, beforeMs: number, afterMs: number) {
  const before = beforeMs >= 600 ? "... " : beforeMs >= 200 ? ", " : "";
  const after = afterMs >= 600 ? " ..." : afterMs >= 200 ? "," : "";
  return `${before}${input}${after}`.trim();
}

export function buildElevenLabsVoiceSettingsFromShot(
  shot: ReelShotV2,
): ElevenLabsVoiceSettings {
  const d = shot.narration_direction;

  // Heuristic mapping:
  // - higher intensity/energy => more expressive (style up) and less stable (stability down)
  // - speaking_rate maps to speed (ElevenLabs supports a "speed" setting)
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

  // Basic instruction-aware tuning. We avoid putting instruction into "text"
  // because that would be spoken verbatim.
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

export function buildElevenLabsTextFromShot(shot: ReelShotV2) {
  const d = shot.narration_direction;
  // ElevenLabs "text" is spoken verbatim; do not prefix instructions that would be read out loud.
  // Apply pause approximation similar to our OpenAI TTS fallback behavior.
  return applyPauseText(
    shot.narration,
    d.delivery.pause_ms_before,
    d.delivery.pause_ms_after,
  );
}

export function buildElevenLabsTtsRequestBody(
  shot: ReelShotV2,
  modelId: string,
): ElevenLabsTtsRequestBody {
  return {
    text: buildElevenLabsTextFromShot(shot),
    model_id: modelId,
    language_code: "ko",
    voice_settings: buildElevenLabsVoiceSettingsFromShot(shot),
  };
}

export async function resolveVoiceIdByName(
  apiKey: string,
  voiceName: string,
): Promise<string> {
  const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ElevenLabs voices list failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as ElevenLabsVoicesResponse;
  const voices = data.voices ?? [];

  const wanted = voiceName.trim().toLowerCase();
  const match = voices.find((v) => v.name?.trim().toLowerCase() === wanted);
  if (!match?.voice_id) {
    const available = voices
      .map((v) => v.name)
      .filter(Boolean)
      .slice(0, 12)
      .join(", ");
    throw new Error(
      `ElevenLabs voice not found by name: "${voiceName}". Set VITE_ELEVENLABS_VOICE_ID or adjust VITE_ELEVENLABS_VOICE_NAME. Available (first 12): ${available}`,
    );
  }

  return match.voice_id;
}

export async function generateElevenLabsNarrationAudio(
  apiKey: string,
  voiceId: string,
  shot: ReelShotV2,
  modelId: string,
) {
  const body = buildElevenLabsTtsRequestBody(shot, modelId);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    // Free plan limitation common case:
    // 402 {"detail":{"status":"payment_required","message":"Free users cannot use library voices via the API..."}}
    if (resp.status === 402 && /payment_required/i.test(text)) {
      throw new Error(
        `ElevenLabs TTS failed: 402 payment_required. Your plan cannot use this voice via the API (library voice). Use a voice you own (set VITE_ELEVENLABS_VOICE_ID) or upgrade your ElevenLabs subscription.`,
      );
    }
    throw new Error(`ElevenLabs TTS failed: ${resp.status} ${text}`);
  }

  const blob = await resp.blob();
  return {
    audioUrl: URL.createObjectURL(blob),
    payloadPreview: body as unknown as Record<string, unknown>,
  };
}

export async function generateElevenLabsNarrationAudioViaProxy(
  voiceId: string,
  shot: ReelShotV2,
  modelId: string,
) {
  const resp = await fetch("/api/elevenlabs/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voice_id: voiceId,
      model_id: modelId,
      shot: {
        narration: shot.narration,
        narration_direction: shot.narration_direction,
      },
      output_format: "mp3_44100_128",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ElevenLabs proxy failed: ${resp.status} ${text}`);
  }

  const blob = await resp.blob();
  return {
    audioUrl: URL.createObjectURL(blob),
    payloadPreview: {
      via: "cloudflare-pages-function",
      voice_id: voiceId,
      model_id: modelId,
      output_format: "mp3_44100_128",
      shot: {
        narration: shot.narration,
        narration_direction: shot.narration_direction,
      },
    } as Record<string, unknown>,
  };
}
