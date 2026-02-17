import { type ErrorObject } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import type {
  NarrationDirection,
  ReelScript,
  ReelScriptV1,
  ReelScriptV2,
  ReelShotBase,
  ReelShotV2,
} from "./reelsScriptTypes";

export const emotionLabels = [
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

const reelsScriptV2Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "language",
    "total_duration_seconds",
    "title",
    "tone",
    "shots",
  ],
  properties: {
    schema_version: { const: "reels_script_v2" },
    language: { type: "string", minLength: 2 },
    total_duration_seconds: { const: 15 },
    title: { type: "string", minLength: 1 },
    tone: { type: "string", minLength: 1 },
    narration_defaults: {
      type: "object",
      additionalProperties: false,
      properties: {
        label: { enum: [...emotionLabels] },
        intensity: { type: "number", minimum: 0, maximum: 1 },
        delivery: {
          type: "object",
          additionalProperties: false,
          properties: {
            speaking_rate: { type: "number", minimum: 0.5, maximum: 2.0 },
            energy: { type: "number", minimum: 0, maximum: 1 },
            pause_ms_before: { type: "integer", minimum: 0, maximum: 1500 },
            pause_ms_after: { type: "integer", minimum: 0, maximum: 1500 },
          },
        },
        tts_instruction: { type: "string", minLength: 1 },
      },
    },
    shots: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "shot_id",
          "duration_seconds",
          "visual_description",
          "subtitle",
          "narration",
          "image_prompt",
          "transition",
          "narration_direction",
        ],
        properties: {
          shot_id: { type: "string", minLength: 1 },
          duration_seconds: { type: "integer", minimum: 1, maximum: 6 },
          visual_description: { type: "string", minLength: 1 },
          subtitle: { type: "string", minLength: 1 },
          narration: { type: "string", minLength: 1 },
          image_prompt: { type: "string", minLength: 1 },
          transition: {
            enum: [
              "cut",
              "fade",
              "crossfade",
              "zoom_in",
              "zoom_out",
              "slide_left",
              "slide_right",
            ],
          },
          narration_direction: {
            type: "object",
            additionalProperties: false,
            required: ["label", "intensity", "delivery", "tts_instruction"],
            properties: {
              label: { enum: [...emotionLabels] },
              intensity: { type: "number", minimum: 0, maximum: 1 },
              arc_hint: { type: "string", minLength: 1 },
              delivery: {
                type: "object",
                additionalProperties: false,
                required: [
                  "speaking_rate",
                  "energy",
                  "pause_ms_before",
                  "pause_ms_after",
                ],
                properties: {
                  speaking_rate: { type: "number", minimum: 0.5, maximum: 2.0 },
                  energy: { type: "number", minimum: 0, maximum: 1 },
                  pause_ms_before: { type: "integer", minimum: 0, maximum: 1500 },
                  pause_ms_after: { type: "integer", minimum: 0, maximum: 1500 },
                  emphasis_words: {
                    type: "array",
                    items: { type: "string", minLength: 1 },
                    maxItems: 6,
                  },
                },
              },
              tts_instruction: { type: "string", minLength: 1 },
            },
          },
        },
      },
    },
  },
} as const;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateV2 = ajv.compile(reelsScriptV2Schema);

export type ValidationResult =
  | { ok: true; value: ReelScriptV2 }
  | { ok: false; errors: string[] };

function formatAjvErrors(errors: ErrorObject[] | null | undefined) {
  if (!errors?.length) return ["Unknown schema validation error."];
  return errors.map((e) => {
    const path = e.instancePath || "(root)";
    return `${path} ${e.message ?? "is invalid"}`;
  });
}

export function validateReelsScriptV2(input: unknown): ValidationResult {
  const schemaOk = validateV2(input);
  if (!schemaOk) {
    return { ok: false, errors: formatAjvErrors(validateV2.errors) };
  }

  const value = input as ReelScriptV2;
  const durationSum = value.shots.reduce((sum, shot) => sum + shot.duration_seconds, 0);
  if (durationSum !== 15) {
    return {
      ok: false,
      errors: [`shots duration sum must be 15 seconds (received ${durationSum}).`],
    };
  }

  const invalidLabelShot = value.shots.find(
    (shot) => !emotionLabels.includes(shot.narration_direction.label),
  );
  if (invalidLabelShot) {
    return {
      ok: false,
      errors: [
        `Shot ${invalidLabelShot.shot_id} has unsupported narration_direction.label: ${invalidLabelShot.narration_direction.label}`,
      ],
    };
  }

  const uniqueLabels = new Set(
    value.shots.map((shot) => shot.narration_direction.label),
  );
  if (uniqueLabels.size < 2) {
    return {
      ok: false,
      errors: [
        "narration_direction.label should vary across shots (use at least 2 distinct labels).",
      ],
    };
  }

  const normalizedInstructions = value.shots.map((shot) =>
    shot.narration_direction.tts_instruction.trim().toLowerCase(),
  );
  const uniqueInstructionCount = new Set(normalizedInstructions).size;
  if (uniqueInstructionCount < value.shots.length) {
    return {
      ok: false,
      errors: [
        "Each shot must have its own distinct narration_direction.tts_instruction.",
      ],
    };
  }

  return { ok: true, value };
}

export function toDefaultNarrationDirection(): NarrationDirection {
  return {
    label: "calm",
    intensity: 0.5,
    delivery: {
      speaking_rate: 1,
      energy: 0.5,
      pause_ms_before: 150,
      pause_ms_after: 150,
    },
    tts_instruction: "Speak naturally, calm, and clear.",
  };
}

export function upgradeV1ToV2(v1: ReelScriptV1): ReelScriptV2 {
  const shots: ReelShotV2[] = v1.shots.map((shot: ReelShotBase) => ({
    ...shot,
    narration_direction: toDefaultNarrationDirection(),
  }));

  return {
    ...v1,
    schema_version: "reels_script_v2",
    shots,
  };
}

export function parseScenarioJsonLenient(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(raw.slice(first, last + 1));
    }
    throw new Error("Failed to parse scenario JSON.");
  }
}

export function normalizeToV2(script: ReelScript): ValidationResult {
  if (script.schema_version === "reels_script_v2") {
    return validateReelsScriptV2(script);
  }

  return validateReelsScriptV2(upgradeV1ToV2(script));
}

export function parseAndValidateScenarioV2(raw: string): ValidationResult {
  const parsed = parseScenarioJsonLenient(raw) as ReelScript;
  return normalizeToV2(parsed);
}
