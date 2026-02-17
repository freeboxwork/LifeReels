import { describe, expect, it } from "vitest";
import type { ReelShotV2 } from "../src/lib/reelsScriptTypes";
import {
  buildElevenLabsTtsRequestBody,
  buildElevenLabsVoiceSettingsFromShot,
} from "../src/lib/elevenlabsTts";

function sampleShot(): ReelShotV2 {
  return {
    shot_id: "s1",
    duration_seconds: 3,
    visual_description: "도시 거리",
    subtitle: "점심에 친구를 만났어",
    narration: "점심에 오랜만에 친구를 만났어.",
    image_prompt: "city street lunch",
    transition: "cut",
    narration_direction: {
      label: "calm",
      intensity: 0.6,
      delivery: {
        speaking_rate: 1.1,
        energy: 0.4,
        pause_ms_before: 250,
        pause_ms_after: 650,
      },
      tts_instruction: "Calm and professional.",
    },
  };
}

describe("elevenlabs tts payload", () => {
  it("builds a request body using model_id + voice_settings", () => {
    const shot = sampleShot();
    const body = buildElevenLabsTtsRequestBody(shot, "eleven_flash_v2_5");

    expect(body.model_id).toBe("eleven_flash_v2_5");
    expect(body.text).toContain(shot.narration);
    expect(body.language_code).toBe("ko");
    expect(body.voice_settings?.speed).toBeDefined();
  });

  it("maps intensity/energy/speaking_rate into settings within bounds", () => {
    const settings = buildElevenLabsVoiceSettingsFromShot(sampleShot());
    expect(settings.stability).toBeGreaterThanOrEqual(0);
    expect(settings.stability).toBeLessThanOrEqual(1);
    expect(settings.style).toBeGreaterThanOrEqual(0);
    expect(settings.style).toBeLessThanOrEqual(1);
    expect(settings.similarity_boost).toBeGreaterThanOrEqual(0);
    expect(settings.similarity_boost).toBeLessThanOrEqual(1);
    expect(settings.speed).toBeGreaterThanOrEqual(0.7);
    expect(settings.speed).toBeLessThanOrEqual(1.3);
  });

  it("slows down when instruction suggests slower/calm delivery", () => {
    const shot = sampleShot();
    shot.narration_direction.delivery.speaking_rate = 1.0;
    shot.narration_direction.tts_instruction = "속도를 조금만 느리게 편안하게 읽어줘";
    const settings = buildElevenLabsVoiceSettingsFromShot(shot);
    expect(settings.speed).toBeLessThan(1.0);
    expect(settings.stability).toBeGreaterThan(0.5);
  });
});
