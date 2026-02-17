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

export type TimingHints = {
  min_duration_seconds?: number;
  max_duration_seconds?: number;
  padding_ms?: number;
};

export type ReelShotV2 = {
  shot_id: string;
  duration_seconds: number;
  visual_description: string;
  subtitle: string;
  narration: string;
  image_prompt: string;
  transition: TransitionType;
  narration_direction: NarrationDirection;
};

export type ReelShotV3 = Omit<ReelShotV2, "duration_seconds"> & {
  duration_seconds?: number;
  timing_hints?: TimingHints;
};

export type ReelScriptV3 = {
  schema_version: "reels_script_v3";
  language: string;
  date?: string; // ISO date string or free-form, shown on opening/ending cards
  title: string;
  tone: string;
  target_total_duration_seconds?: number;
  shots: ReelShotV3[];
};

export type ShotAssets = {
  image_src: string;
  audio_src: string;
  sfx_src?: string;
};

export type LayoutPreset =
  | "full_bg_sub_bottom"
  | "full_bg_sub_top"
  | "split_caption_band"
  | "frame_matte";

export type SubtitlePreset =
  | "soft_box"
  | "clean_text"
  | "band_caption"
  | "gradient_underlay"
  | "overlay_gradient";

export type RenderParams = {
  layout_preset?: LayoutPreset;
  subtitle_preset?: SubtitlePreset;
  show_debug_hints?: boolean;
  show_title?: boolean;
  opening_card?: boolean; // default true
  opening_card_seconds?: number; // default 1.4
  ending_card?: boolean; // default true
  ending_card_seconds?: number; // default 1.2
  bgm_src?: string;
  bgm_volume?: number; // 0..1
  bgm_duck_volume?: number; // 0..1 when narration plays
  bgm_duck_attack_frames?: number;
  bgm_duck_release_frames?: number;
  bgm_fade_in_ms?: number; // default 200
  bgm_fade_out_ms?: number; // default 260
  narration_gap_ms?: number; // minimum silence between narrations in the final timeline (default ~220ms)
  emoji_captions_enabled?: boolean; // default false
  emoji_captions_max?: number; // default 2 per video
};

export type CaptionEmoji = {
  // The original unicode glyph we selected (useful for debug/logging).
  glyph: string;
  // Fluent Emoji asset style. We currently only support Flat for now.
  style: "fluent_flat";
  // URL or public path to an image/SVG.
  src: string;
};

export type BgmSelected = {
  id: string; // e.g. "BGM-01"
  type: "A" | "B";
  file: string; // e.g. "SampleResource/bgm/....mp3"
  loop: boolean;
};

export type RenderPlanShot = {
  shot_id: string;
  from: number;
  durationInFrames: number;
  audioStartInFrames: number;
  audioDurationInFrames: number;
  overlapInFrames?: number; // frames overlapped from previous shot (crossfade in)
  overlapOutFrames?: number; // frames overlapped into next shot (crossfade out)
  endFadeOutFrames?: number; // for last shot fade-to-black (no overlap)
  transitionOut?: TransitionType;
  assets: ShotAssets;
};

export type RenderPlan = {
  fps: number;
  durationInFrames: number;
  opening?: { durationInFrames: number };
  ending?: { from: number; durationInFrames: number };
  shots: RenderPlanShot[];
};

export type RenderInput = {
  script: ReelScriptV3;
  fps?: number;
  assets_by_shot_id?: Record<string, ShotAssets>;
  render_params?: RenderParams;
  render_plan?: RenderPlan;
  caption_emojis_by_shot_id?: Record<string, CaptionEmoji>;
  bgm_selected?: BgmSelected;
};
