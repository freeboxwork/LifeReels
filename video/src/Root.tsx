import React from "react";
import { Composition as RemotionComposition } from "remotion";
import { z } from "zod";
import type { RenderInput } from "./types";
import { Composition } from "./Composition";

const narrationDeliverySchema = z.object({
  speaking_rate: z.number(),
  energy: z.number(),
  pause_ms_before: z.number(),
  pause_ms_after: z.number(),
  emphasis_words: z.array(z.string()).optional(),
});

const narrationDirectionSchema = z.object({
  label: z.string(),
  intensity: z.number(),
  arc_hint: z.string().optional(),
  delivery: narrationDeliverySchema,
  tts_instruction: z.string(),
});

const shotSchema = z.object({
  shot_id: z.string(),
  duration_seconds: z.number().optional(),
  timing_hints: z
    .object({
      min_duration_seconds: z.number().optional(),
      max_duration_seconds: z.number().optional(),
      padding_ms: z.number().optional(),
    })
    .optional(),
  visual_description: z.string(),
  subtitle: z.string(),
  narration: z.string(),
  image_prompt: z.string(),
  transition: z.string(),
  narration_direction: narrationDirectionSchema,
});

const renderInputSchema = z.object({
  script: z.object({
    schema_version: z.literal("reels_script_v3"),
    language: z.string(),
    date: z.string().optional(),
    title: z.string(),
    tone: z.string(),
    shots: z.array(shotSchema),
    target_total_duration_seconds: z.number().optional(),
  }),
  fps: z.number().optional(),
  assets_by_shot_id: z
    .record(z.string(), z.object({ image_src: z.string(), audio_src: z.string() }))
    .optional(),
  render_params: z
    .object({
      layout_preset: z.string().optional(),
      subtitle_preset: z.string().optional(),
      show_debug_hints: z.boolean().optional(),
      show_title: z.boolean().optional(),
      bgm_src: z.string().optional(),
      bgm_volume: z.number().optional(),
      bgm_duck_volume: z.number().optional(),
      bgm_duck_attack_frames: z.number().optional(),
      bgm_duck_release_frames: z.number().optional(),
      opening_card: z.boolean().optional(),
      opening_card_seconds: z.number().optional(),
      ending_card: z.boolean().optional(),
      ending_card_seconds: z.number().optional(),
    })
    .optional(),
  render_plan: z.any().optional(),
});

export const Root: React.FC = () => {
  const fps = 30;

  return (
    <RemotionComposition
      id="LifeReels"
      component={Composition}
      width={1080}
      height={1920}
      fps={fps}
      durationInFrames={1}
      schema={renderInputSchema}
      calculateMetadata={async ({ props }) => {
        const chosenFps = props.fps ?? fps;
        const plan = (props as RenderInput).render_plan;
        const fallbackSeconds =
          (props as RenderInput).script.target_total_duration_seconds ?? 15;
        return {
          fps: chosenFps,
          durationInFrames: plan?.durationInFrames ?? Math.max(1, Math.round(fallbackSeconds * chosenFps)),
          props: {
            ...(props as RenderInput),
            fps: chosenFps,
          },
        };
      }}
      defaultProps={{
        script: {
          schema_version: "reels_script_v3",
          language: "ko",
          title: "Sample LifeReels",
          tone: "calm",
          target_total_duration_seconds: 15,
          shots: [
            {
              shot_id: "s1",
              visual_description: "s1",
              subtitle: "점심에, 오랜만에 친구를 만났어.",
              narration: "점심에 오랜만에 친구를 만났어.",
              image_prompt: "s1",
              transition: "cut",
              timing_hints: { min_duration_seconds: 2.2, max_duration_seconds: 6, padding_ms: 150 },
              narration_direction: {
                label: "calm",
                intensity: 0.6,
                delivery: {
                  speaking_rate: 0.95,
                  energy: 0.4,
                  pause_ms_before: 150,
                  pause_ms_after: 150,
                },
                tts_instruction: "Calm and comfortable delivery.",
              },
            },
            {
              shot_id: "s2",
              visual_description: "s2",
              subtitle: "새로 생긴 파스타 집, 담백해서 좋더라.",
              narration: "새로 생긴 파스타 집에서 먹었는데 담백해서 좋더라.",
              image_prompt: "s2",
              transition: "crossfade",
              timing_hints: { min_duration_seconds: 2.2, max_duration_seconds: 6, padding_ms: 150 },
              narration_direction: {
                label: "warm",
                intensity: 0.55,
                delivery: {
                  speaking_rate: 1,
                  energy: 0.45,
                  pause_ms_before: 120,
                  pause_ms_after: 160,
                },
                tts_instruction: "Warm, friendly tone.",
              },
            },
            {
              shot_id: "s3",
              visual_description: "s3",
              subtitle: "카페로 옮겨 창가에 앉았어.",
              narration: "카페로 옮겨 창가에 앉아, 이런저런 근황을 나눴어.",
              image_prompt: "s3",
              transition: "crossfade",
              timing_hints: { min_duration_seconds: 2.2, max_duration_seconds: 7, padding_ms: 250 },
              narration_direction: {
                label: "calm",
                intensity: 0.6,
                delivery: {
                  speaking_rate: 0.92,
                  energy: 0.35,
                  pause_ms_before: 120,
                  pause_ms_after: 180,
                },
                tts_instruction:
                  "Keep it quiet and comfortable, slightly slower pace.",
              },
            },
            {
              shot_id: "s4",
              visual_description: "s4",
              subtitle: "말하다 보니 마음이 한결 가벼워졌지.",
              narration: "말하다 보니 마음이 한결 가벼워졌지.",
              image_prompt: "s4",
              transition: "crossfade",
              timing_hints: { min_duration_seconds: 2.2, max_duration_seconds: 6, padding_ms: 150 },
              narration_direction: {
                label: "relieved",
                intensity: 0.7,
                delivery: {
                  speaking_rate: 1.02,
                  energy: 0.55,
                  pause_ms_before: 150,
                  pause_ms_after: 150,
                },
                tts_instruction: "Relieved, light exhale at the end.",
              },
            },
            {
              shot_id: "s5",
              visual_description: "s5",
              subtitle: "집에 돌아가는 길, 괜히 웃음이 났어.",
              narration: "집에 돌아가는 길, 괜히 웃음이 났어.",
              image_prompt: "s5",
              transition: "fade",
              timing_hints: { min_duration_seconds: 2.2, max_duration_seconds: 6, padding_ms: 200 },
              narration_direction: {
                label: "hopeful",
                intensity: 0.6,
                delivery: {
                  speaking_rate: 1.03,
                  energy: 0.6,
                  pause_ms_before: 120,
                  pause_ms_after: 200,
                },
                tts_instruction: "Hopeful ending, gentle smile.",
              },
            },
          ],
        },
        render_params: {
          layout_preset: "full_bg_sub_bottom",
          subtitle_preset: "soft_box",
          show_debug_hints: false,
          bgm_volume: 0.16,
          bgm_duck_volume: 0.05,
          bgm_duck_attack_frames: 8,
          bgm_duck_release_frames: 10
        }
      }}
    />
  );
};
