import fs from "node:fs";
import path from "node:path";
import { parseFile } from "music-metadata";
import { fromGlyph } from "fluentui-emoji-js";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const msToFrames = (ms, fps) => Math.max(0, Math.round((ms / 1000) * fps));
const secondsToFrames = (s, fps) => Math.max(1, Math.round(s * fps));

const stripSampleResourcePrefix = (p) => p.replace(/^SampleResource\//, "");

const defaultAssetsForIndex = (i) => {
  const n = i + 1;
  return { image_src: `s_${n}.png`, audio_src: `Narr_S_${n}.mp3` };
};

const fnv1a32 = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const computeReelKey = (input) => {
  const script = input.script || {};
  const explicit = script.reelId || script.reel_id || input.reelId || input.reel_id || input.diary_hash;
  if (explicit) return String(explicit);
  const subs = Array.isArray(script.shots) ? script.shots.map((s) => String(s.subtitle || "")).join("|") : "";
  return [script.date || "", script.title || "", script.tone || "", subs].join("|");
};

const listBgmInventory = (bgmDir) => {
  const inv = new Map(); // id -> {A?: name, B?: name}
  if (!fs.existsSync(bgmDir)) return inv;

  const files = fs.readdirSync(bgmDir);
  for (const nameRaw of files) {
    const name = String(nameRaw);
    if (!name.toLowerCase().endsWith(".mp3")) continue;

    const m = name.match(/^(BGM-\d{2})_.*_type_([AB])\.mp3$/i) || name.match(/^(BGM-\d{2})_.*\s_type_([AB])\.mp3$/i);
    if (!m) continue;
    const id = m[1].toUpperCase();
    const type = m[2].toUpperCase();

    const cur = inv.get(id) || {};
    if (!cur[type]) cur[type] = name;
    inv.set(id, cur);
  }
  return inv;
};

const sanitizeBgmFileName = (name) => String(name).replace(/\s+/g, "");

const emojiGlyphForLabel = (labelRaw) => {
  const label = String(labelRaw || "").toLowerCase();
  switch (label) {
    case "calm":
      return "\u{1F54A}\u{FE0F}"; // 🕊️
    case "warm":
      return "\u2615\u{FE0F}"; // ☕️
    case "anxious":
      return "\u{1F62C}"; // 😬
    case "relieved":
      return "\u{1F60C}"; // 😌
    case "grateful":
      return "\u{1F64F}"; // 🙏
    case "joyful":
      return "\u{1F604}"; // 😄
    case "lonely":
      return "\u{1F319}"; // 🌙
    case "bittersweet":
      return "\u{1F972}"; // 🥲
    case "hopeful":
      return "\u{1F331}"; // 🌱
    case "tired":
      return "\u{1F62E}\u{200D}\u{1F4A8}"; // 😮‍💨
    case "playful":
      return "\u{1F606}"; // 😆
    case "determined":
      return "\u{1F4AA}"; // 💪
    default:
      return "";
  }
};

const pickCaptionEmojis = (input) => {
  const rp = input.render_params || {};
  const enabled = Boolean(rp.emoji_captions_enabled);
  const max = Math.max(0, Math.min(6, Math.floor(rp.emoji_captions_max ?? 2)));
  if (!enabled || max <= 0) return [];

  const shots = Array.isArray(input?.script?.shots) ? input.script.shots : [];
  const ranked = shots
    .map((s, idx) => ({
      idx,
      shot_id: s.shot_id,
      intensity: Number(s?.narration_direction?.intensity ?? 0),
      label: String(s?.narration_direction?.label ?? ""),
    }))
    .sort((a, b) => (b.intensity - a.intensity) || (a.idx - b.idx));

  const out = [];
  const usedLabels = new Set();

  for (const r of ranked) {
    if (out.length >= max) break;
    const glyph = emojiGlyphForLabel(r.label);
    if (!glyph) continue;
    if (usedLabels.has(r.label) && ranked.length > max) continue;
    usedLabels.add(r.label);
    out.push({ shot_id: r.shot_id, glyph });
  }

  if (out.length < max) {
    for (const r of ranked) {
      if (out.length >= max) break;
      if (out.some((x) => x.shot_id === r.shot_id)) continue;
      const glyph = emojiGlyphForLabel(r.label);
      if (!glyph) continue;
      out.push({ shot_id: r.shot_id, glyph });
    }
  }

  return out;
};

const fluentFlatUrlFromGlyph = async (glyph) => {
  if (!glyph) return null;
  try {
    const rel = await fromGlyph(glyph, "Flat"); // e.g. "/Relieved face/Flat/relieved_face_flat.svg"
    if (!rel) return null;
    const p = String(rel).startsWith("/") ? String(rel) : `/${rel}`;
    return `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@latest/assets${encodeURI(p)}`;
  } catch (e) {
    return null;
  }
};

const pickBgmId = (input) => {
  const script = input.script || {};
  const tone = String(script.tone || "").toLowerCase();
  const style = String(script.style_preset || script.stylePreset || "").toLowerCase();

  const shotLabels = Array.isArray(script.shots)
    ? script.shots
        .map((s) => String(s?.narration_direction?.label || "").toLowerCase())
        .filter(Boolean)
    : [];

  const has = (needle) => tone.includes(needle) || style.includes(needle) || shotLabels.includes(needle);

  // Priority rules (from REMOTION_DATA_DRIVEN_RENDERING.md)
  if (style.includes("anime") || style.includes("storybook") || has("nostalgic") || has("bittersweet")) return "BGM-05";
  if (has("anxious") || has("determined") || tone.includes("긴장") || tone.includes("불안")) return "BGM-07";
  if (has("playful") || tone.includes("장난") || tone.includes("발랄") || tone.includes("카페") || tone.includes("음식"))
    return "BGM-04";
  if (tone.includes("minimal") || tone.includes("airy") || tone.includes("quiet") || tone.includes("고요") || tone.includes("미니멀"))
    return "BGM-06";
  if (has("warm") || has("calm") || tone.includes("따뜻") || tone.includes("잔잔") || tone.includes("일상")) return "BGM-01";

  return "BGM-01";
};

const ensureBgmInPublicDir = (srcAbs, destAbs) => {
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  try {
    const stSrc = fs.statSync(srcAbs);
    const stDst = fs.existsSync(destAbs) ? fs.statSync(destAbs) : null;
    if (!stDst || stDst.size !== stSrc.size) fs.copyFileSync(srcAbs, destAbs);
  } catch (e) {
    // If copy fails, we'll simply not set bgm_src.
    return false;
  }
  return true;
};

const transitionOverlapFrames = (transition, fps) => {
  // Keep it conservative; too much overlap can feel like a slideshow dissolve.
  const t = String(transition || "cut").toLowerCase();
  const base =
    t === "cut"
      ? 0
      : t === "fade"
        ? Math.round(fps * 0.35)
        : t === "crossfade"
          ? Math.round(fps * 0.4)
          : Math.round(fps * 0.35);
  return clamp(base, 0, Math.round(fps * 0.7));
};

const resolveAudioFsPath = (audioSrc) => {
  if (audioSrc.startsWith("http://") || audioSrc.startsWith("https://")) return null;
  const rel = stripSampleResourcePrefix(audioSrc);
  return path.join(process.cwd(), "..", "SampleResource", rel);
};

const computePlan = async ({ input, fps }) => {
  const shots = input.script.shots;
  const tmp = [];

  const rp = input.render_params || {};
  const openingEnabled = rp.opening_card !== false;
  const endingEnabled = rp.ending_card !== false;
  const openingSeconds = typeof rp.opening_card_seconds === "number" ? rp.opening_card_seconds : 1.4;
  const endingSeconds = typeof rp.ending_card_seconds === "number" ? rp.ending_card_seconds : 1.2;
  const openingFrames = openingEnabled ? secondsToFrames(openingSeconds, fps) : 0;
  const endingFrames = endingEnabled ? secondsToFrames(endingSeconds, fps) : 0;

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const assets =
      (input.assets_by_shot_id && input.assets_by_shot_id[shot.shot_id]) ||
      defaultAssetsForIndex(i);

    const audioFsPath = resolveAudioFsPath(assets.audio_src);
    let audioDurationSeconds = 0;
    if (audioFsPath) {
      const meta = await parseFile(audioFsPath);
      audioDurationSeconds = meta.format.duration || 0;
    }

    const pauseBeforeMs = shot.narration_direction?.delivery?.pause_ms_before || 0;
    const pauseAfterMs = shot.narration_direction?.delivery?.pause_ms_after || 0;
    const paddingMs = shot.timing_hints?.padding_ms || 0;

    const audioDurationFrames = secondsToFrames(audioDurationSeconds, fps);
    const audioStartInFrames = msToFrames(pauseBeforeMs, fps);
    const pauseAfterFrames = msToFrames(pauseAfterMs, fps);
    const paddingFrames = msToFrames(paddingMs, fps);

    const requiredFrames =
      audioStartInFrames +
      audioDurationFrames +
      pauseAfterFrames +
      paddingFrames;

    const minFrames = shot.timing_hints?.min_duration_seconds
      ? secondsToFrames(shot.timing_hints.min_duration_seconds, fps)
      : 1;
    const maxFramesRaw = shot.timing_hints?.max_duration_seconds
      ? secondsToFrames(shot.timing_hints.max_duration_seconds, fps)
      : null;

    let durationInFrames = Math.max(requiredFrames, minFrames);
    if (maxFramesRaw !== null && maxFramesRaw >= requiredFrames) {
      durationInFrames = clamp(durationInFrames, minFrames, maxFramesRaw);
    }

    // If duration could not be determined (remote audio), fall back to duration_seconds or min hint.
    if (!audioFsPath || audioDurationSeconds <= 0) {
      const fallbackSeconds =
        shot.duration_seconds ?? shot.timing_hints?.min_duration_seconds ?? 3;
      durationInFrames = secondsToFrames(fallbackSeconds, fps);
    }

    tmp.push({
      shot_id: shot.shot_id,
      durationInFrames,
      audioStartInFrames,
      audioDurationInFrames: audioDurationFrames,
      pauseAfterFrames,
      paddingFrames,
      minFrames,
      maxFramesRaw,
      assets,
      transitionOut: shot.transition || "cut",
    });
  }

  // Second pass: compute overlaps and from-cursor based on transitions.
  // Model: shot[i] transitions OUT into shot[i+1] by overlapping frames (crossfade-like).
  const planShots = [];
  const overlapOut = new Array(tmp.length).fill(0);
  const endFadeOutFrames = new Array(tmp.length).fill(0);

  for (let i = 0; i < tmp.length; i++) {
    const isLast = i === tmp.length - 1;
    const trans = tmp[i].transitionOut;
    const desired = transitionOverlapFrames(trans, fps);

    if (isLast) {
      // Last shot: allow fade-to-black if requested.
      if (String(trans).toLowerCase() === "fade") {
        endFadeOutFrames[i] = desired;
      }
      overlapOut[i] = 0;
      continue;
    }

    // Overlap between shot i and i+1. Clamp to keep both shots visible.
    const maxAllowed = Math.max(
      0,
      Math.min(tmp[i].durationInFrames - 1, tmp[i + 1].durationInFrames - 1, Math.round(fps * 0.9)),
    );
    overlapOut[i] = clamp(desired, 0, maxAllowed);
  }

  // Enforce a minimum "breath" gap between narrations in the final timeline.
  // This avoids narration sounding too rushed when shots overlap visually.
  const narrationGapMs = typeof rp.narration_gap_ms === "number" ? rp.narration_gap_ms : 220;
  const gapFrames = msToFrames(narrationGapMs, fps);

  const computeFroms = () => {
    const froms = new Array(tmp.length).fill(0);
    let cursor = 0;
    for (let i = 0; i < tmp.length; i++) {
      froms[i] = cursor;
      cursor += tmp[i].durationInFrames - overlapOut[i];
    }
    return froms;
  };

  const ensureDurFitsAudio = (i) => {
    const required =
      tmp[i].audioStartInFrames +
      tmp[i].audioDurationInFrames +
      tmp[i].pauseAfterFrames +
      tmp[i].paddingFrames;
    tmp[i].durationInFrames = Math.max(tmp[i].durationInFrames, required, tmp[i].minFrames);
  };

  // Iterate a couple of times because changing duration affects subsequent `from`.
  for (let iter = 0; iter < 4; iter++) {
    const froms = computeFroms();
    let changed = false;

    for (let i = 1; i < tmp.length; i++) {
      const prev = tmp[i - 1];
      const cur = tmp[i];

      const prevEnd =
        froms[i - 1] +
        prev.audioStartInFrames +
        prev.audioDurationInFrames +
        prev.pauseAfterFrames +
        prev.paddingFrames;
      const curStart = froms[i] + cur.audioStartInFrames;
      const minStart = prevEnd + gapFrames;

      if (curStart < minStart) {
        const delta = minStart - curStart;
        cur.audioStartInFrames += delta;
        ensureDurFitsAudio(i);
        changed = true;
      }
    }

    if (!changed) break;
  }

  const fromsFinal = computeFroms();
  for (let i = 0; i < tmp.length; i++) {
    const overlapInFrames = i === 0 ? 0 : overlapOut[i - 1];
    planShots.push({
      shot_id: tmp[i].shot_id,
      from: fromsFinal[i],
      durationInFrames: tmp[i].durationInFrames,
      audioStartInFrames: tmp[i].audioStartInFrames,
      audioDurationInFrames: tmp[i].audioDurationInFrames,
      overlapInFrames,
      overlapOutFrames: overlapOut[i],
      endFadeOutFrames: endFadeOutFrames[i],
      transitionOut: tmp[i].transitionOut,
      assets: tmp[i].assets,
    });

    // Also write back an explicit duration_seconds (pipeline-style).
    shots[i].duration_seconds = tmp[i].durationInFrames / fps;
  }

  // Apply opening card offset by shifting all shots forward.
  if (openingFrames > 0) {
    for (const s of planShots) s.from += openingFrames;
  }

  const contentDuration = planShots.length
    ? planShots[planShots.length - 1].from + planShots[planShots.length - 1].durationInFrames
    : openingFrames;

  const totalDuration = Math.max(1, contentDuration + endingFrames);

  return {
    fps,
    durationInFrames: totalDuration,
    opening: openingFrames > 0 ? { durationInFrames: openingFrames } : undefined,
    ending: endingFrames > 0 ? { from: totalDuration - endingFrames, durationInFrames: endingFrames } : undefined,
    shots: planShots,
  };
};

const main = async () => {
  const inputPath = process.argv[2] || "sample-props.json";
  const outputPath = process.argv[3] || "resolved-props.json";

  const absIn = path.resolve(process.cwd(), inputPath);
  const absOut = path.resolve(process.cwd(), outputPath);

  let raw = fs.readFileSync(absIn, "utf8");
  if (raw && raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const input = JSON.parse(raw);
  const fps = input.fps || 30;

  const render_plan = await computePlan({ input, fps });
  input.fps = fps;
  input.render_plan = render_plan;

  // BGM selection + wiring.
  // Notes:
  // - Remotion publicDir is set to ../SampleResource, so we must make the selected BGM file available there.
  // - If render_params.bgm_src is already set, we keep it (manual override).
  const rp = input.render_params || (input.render_params = {});

  // Manual override: if user points to a file in ../bgm, copy it into SampleResource and rewrite to public path.
  if (rp.bgm_src && typeof rp.bgm_src === "string") {
    const s = String(rp.bgm_src).trim();
    const isAlreadyPublic = s.startsWith("SampleResource/");
    const looksLikeBgm = s.startsWith("bgm/") || s.includes("\\bgm\\") || /BGM-\d{2}_.+\.mp3$/i.test(s);
    if (!isAlreadyPublic && looksLikeBgm) {
      const bgmDir = path.join(process.cwd(), "..", "bgm");
      const fileName = path.basename(s);
      const publicName = sanitizeBgmFileName(fileName);
      const srcAbs = path.join(bgmDir, fileName);
      const destAbs = path.join(process.cwd(), "..", "SampleResource", "bgm", publicName);
      const ok = ensureBgmInPublicDir(srcAbs, destAbs);
      if (ok) rp.bgm_src = `SampleResource/bgm/${publicName}`;
    }
  }

  if (!rp.bgm_src) {
    const bgmDir = path.join(process.cwd(), "..", "bgm");
    const inv = listBgmInventory(bgmDir);

    const id = pickBgmId(input);
    const reelKey = computeReelKey(input);
    const type = fnv1a32(reelKey) % 2 === 0 ? "A" : "B";

    const entry = inv.get(id) || {};
    const pickedName = entry[type] || entry[type === "A" ? "B" : "A"];
    const fallbackEntry = inv.get("BGM-01") || {};
    const fallbackName = fallbackEntry[type] || fallbackEntry[type === "A" ? "B" : "A"];

    const fileName = pickedName || fallbackName;
    if (fileName) {
      const srcAbs = path.join(bgmDir, fileName);
      const publicName = sanitizeBgmFileName(fileName);
      const destAbs = path.join(process.cwd(), "..", "SampleResource", "bgm", publicName);
      const ok = ensureBgmInPublicDir(srcAbs, destAbs);
      if (ok) {
        rp.bgm_src = `SampleResource/bgm/${publicName}`;
        input.bgm_selected = { id: pickedName ? id : "BGM-01", type, file: rp.bgm_src, loop: true };
      }
    }
  }

  // Caption emojis (Fluent Emoji: Flat). Resolve to explicit asset URLs in props.
  // This keeps the render deterministic and avoids async work inside Remotion components.
  if (rp.emoji_captions_enabled) {
    const picked = pickCaptionEmojis(input);
    const out = {};
    for (const p of picked) {
      const src = await fluentFlatUrlFromGlyph(p.glyph);
      if (!src) continue;
      out[p.shot_id] = { glyph: p.glyph, style: "fluent_flat", src };
    }
    if (Object.keys(out).length > 0) input.caption_emojis_by_shot_id = out;
    else delete input.caption_emojis_by_shot_id;
  } else {
    delete input.caption_emojis_by_shot_id;
  }

  fs.writeFileSync(absOut, JSON.stringify(input, null, 2));
  process.stdout.write(absOut + "\n");
};

main().catch((e) => {
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
