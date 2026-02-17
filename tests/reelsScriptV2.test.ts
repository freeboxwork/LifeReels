import { describe, expect, it } from "vitest";
import { parseAndValidateScenarioV2 } from "../src/lib/reelsScriptValidation";
import type { ReelScriptV2 } from "../src/lib/reelsScriptTypes";

function sampleV2(): ReelScriptV2 {
  return {
    schema_version: "reels_script_v2",
    language: "ko",
    total_duration_seconds: 15,
    title: "퇴근길 위로",
    tone: "cozy",
    narration_defaults: {
      label: "calm",
      intensity: 0.5,
      delivery: {
        speaking_rate: 1,
        energy: 0.5,
        pause_ms_before: 120,
        pause_ms_after: 120,
      },
      tts_instruction: "Speak naturally.",
    },
    shots: [
      {
        shot_id: "s1",
        duration_seconds: 3,
        visual_description: "도시 거리",
        subtitle: "오늘은 좀 지쳤다",
        narration: "오늘은 조금 지쳤다.",
        image_prompt: "city street at lunch",
        transition: "cut",
        narration_direction: {
          label: "anxious",
          intensity: 0.4,
          arc_hint: "anxious->relieved",
          delivery: {
            speaking_rate: 0.95,
            energy: 0.4,
            pause_ms_before: 150,
            pause_ms_after: 200,
            emphasis_words: ["지쳤다"],
          },
          tts_instruction: "Speak softly with slight anxiety.",
        },
      },
      {
        shot_id: "s2",
        duration_seconds: 3,
        visual_description: "파스타 접시",
        subtitle: "한 입 먹는 순간",
        narration: "한 입 먹는 순간 마음이 풀렸다.",
        image_prompt: "pasta plate close-up",
        transition: "fade",
        narration_direction: {
          label: "relieved",
          intensity: 0.7,
          delivery: {
            speaking_rate: 1,
            energy: 0.6,
            pause_ms_before: 250,
            pause_ms_after: 250,
          },
          tts_instruction: "Warm and relieved delivery.",
        },
      },
      {
        shot_id: "s3",
        duration_seconds: 3,
        visual_description: "카페 창가",
        subtitle: "잠깐의 대화",
        narration: "짧은 대화가 큰 위로가 됐다.",
        image_prompt: "cafe window",
        transition: "crossfade",
        narration_direction: {
          label: "grateful",
          intensity: 0.8,
          delivery: {
            speaking_rate: 1,
            energy: 0.5,
            pause_ms_before: 200,
            pause_ms_after: 180,
          },
          tts_instruction: "Convey gratitude with warmth.",
        },
      },
      {
        shot_id: "s4",
        duration_seconds: 3,
        visual_description: "노을 거리",
        subtitle: "가벼워진 발걸음",
        narration: "노을 아래 발걸음이 가벼워졌다.",
        image_prompt: "sunset walk",
        transition: "slide_left",
        narration_direction: {
          label: "hopeful",
          intensity: 0.6,
          delivery: {
            speaking_rate: 1.05,
            energy: 0.65,
            pause_ms_before: 120,
            pause_ms_after: 120,
          },
          tts_instruction: "Bright hopeful tone.",
        },
      },
      {
        shot_id: "s5",
        duration_seconds: 3,
        visual_description: "집 앞 골목",
        subtitle: "내일도 괜찮을 거야",
        narration: "내일도 괜찮을 거라는 생각이 들었다.",
        image_prompt: "alley near home",
        transition: "fade",
        narration_direction: {
          label: "calm",
          intensity: 0.5,
          delivery: {
            speaking_rate: 1,
            energy: 0.45,
            pause_ms_before: 150,
            pause_ms_after: 220,
          },
          tts_instruction: "Calm ending tone.",
        },
      },
    ],
  };
}

describe("reels_script_v2 validation", () => {
  it("accepts valid v2 JSON", () => {
    const raw = JSON.stringify(sampleV2());
    const validation = parseAndValidateScenarioV2(raw);
    expect(validation.ok).toBe(true);
  });

  it("rejects invalid duration sum", () => {
    const bad = sampleV2();
    bad.shots[0].duration_seconds = 2;
    const validation = parseAndValidateScenarioV2(JSON.stringify(bad));
    expect(validation.ok).toBe(false);
  });

  it("rejects invalid narration label", () => {
    const bad = sampleV2() as unknown as {
      shots: Array<{ narration_direction: { label: string } }>;
    };
    bad.shots[0].narration_direction.label = "panic";

    const validation = parseAndValidateScenarioV2(JSON.stringify(bad));
    expect(validation.ok).toBe(false);
  });

  it("rejects duplicated shot instructions", () => {
    const bad = sampleV2();
    bad.shots[1].narration_direction.tts_instruction =
      bad.shots[0].narration_direction.tts_instruction;
    const validation = parseAndValidateScenarioV2(JSON.stringify(bad));
    expect(validation.ok).toBe(false);
  });

  it("rejects non-varying labels", () => {
    const bad = sampleV2();
    for (const shot of bad.shots) {
      shot.narration_direction.label = "calm";
    }
    const validation = parseAndValidateScenarioV2(JSON.stringify(bad));
    expect(validation.ok).toBe(false);
  });
});

