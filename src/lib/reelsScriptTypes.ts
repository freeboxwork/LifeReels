export type TransitionType =
  | "cut"
  | "fade"
  | "crossfade"
  | "zoom_in"
  | "zoom_out"
  | "slide_left"
  | "slide_right";

export type EmotionLabel =
  | "calm"
  | "warm"
  | "anxious"
  | "relieved"
  | "grateful"
  | "joyful"
  | "lonely"
  | "bittersweet"
  | "hopeful"
  | "tired"
  | "playful"
  | "determined";

export type NarrationDelivery = {
  speaking_rate: number;
  energy: number;
  pause_ms_before: number;
  pause_ms_after: number;
  emphasis_words?: string[];
};

export type NarrationDirection = {
  label: EmotionLabel;
  intensity: number;
  arc_hint?: string;
  delivery: NarrationDelivery;
  tts_instruction: string;
};

export type NarrationDefaults = {
  label?: EmotionLabel;
  intensity?: number;
  delivery?: {
    speaking_rate?: number;
    energy?: number;
    pause_ms_before?: number;
    pause_ms_after?: number;
  };
  tts_instruction?: string;
};

export type ReelShotBase = {
  shot_id: string;
  duration_seconds: number;
  visual_description: string;
  subtitle: string;
  narration: string;
  image_prompt: string;
  transition: TransitionType;
};

export type ReelScriptV1 = {
  schema_version: "reels_script_v1";
  language: string;
  total_duration_seconds: 15;
  title: string;
  tone: string;
  shots: ReelShotBase[];
};

export type ReelShotV2 = ReelShotBase & {
  narration_direction: NarrationDirection;
};

export type ReelScriptV2 = {
  schema_version: "reels_script_v2";
  language: string;
  total_duration_seconds: 15;
  title: string;
  tone: string;
  narration_defaults?: NarrationDefaults;
  shots: ReelShotV2[];
};

export type ReelScript = ReelScriptV1 | ReelScriptV2;
