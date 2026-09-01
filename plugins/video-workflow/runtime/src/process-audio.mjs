import fs from "node:fs";
import path from "node:path";
import { sha256File, sha256Text, writeJson, readJson, run } from "./utils.mjs";
import { findCueAudio, mediaBinaries, probeDuration } from "./media-tools.mjs";
import { spokenText, validateLockedSource } from "./source.mjs";
import { estimateWordTiming, writeDeliverables } from "./deliverables.mjs";

function concatEscape(filePath) {
  return filePath.replaceAll("'", "'\\''");
}

function silenceFile(ffmpeg, directory, duration) {
  const rounded = Number(duration.toFixed(6));
  const target = path.join(directory, `silence-${rounded.toFixed(6)}.wav`);
  if (!fs.existsSync(target)) {
    run(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", String(rounded), "-c:a", "pcm_s16le", target], "create timeline silence");
  }
  return target;
}

function analyze(ffmpeg, inputPath, targetI, targetTp, preFilter = null) {
  const loudness = `loudnorm=I=${targetI}:TP=${targetTp}:LRA=7:print_format=json`;
  const result = run(
    ffmpeg,
    ["-hide_banner", "-nostats", "-i", inputPath, "-af", preFilter ? `${preFilter},${loudness}` : loudness, "-f", "null", "-"],
    `analyze ${path.basename(inputPath)}`,
  );
  const json = result.stderr.match(/\{[\s\S]*?\}/gu)?.at(-1);
  if (!json) throw new Error(`Could not parse loudness data for ${inputPath}`);
  return JSON.parse(json);
}

function cueWordTiming(rawDir, itemId, text, duration, language) {
  const timingPath = path.join(rawDir, `${itemId}.words.json`);
  if (!fs.existsSync(timingPath)) return estimateWordTiming(text, duration, language);
  const parsed = readJson(timingPath);
  const words = Array.isArray(parsed) ? parsed : parsed.words;
  if (!Array.isArray(words) || words.some((word) => !Number.isFinite(Number(word.start)) || !Number.isFinite(Number(word.end)) || Number(word.start) < 0 || Number(word.end) < Number(word.start) || Number(word.end) > duration + 0.08)) {
    throw new Error(`${itemId}: invalid word timestamp file`);
  }
  return words.map((word) => ({ text: String(word.text || word.word || ""), start: Number(word.start), end: Number(word.end), estimated: false }));
}

function projectMediaPath(projectRoot, relative) {
  const resolved = path.resolve(projectRoot, relative);
  if (resolved !== projectRoot && !resolved.startsWith(`${projectRoot}${path.sep}`)) throw new Error(`Audio media path leaves the project: ${relative}`);
  if (!fs.existsSync(resolved)) throw new Error(`Audio media file is missing: ${relative}`);
  return resolved;
}

function sfxStart(item, story) {
  if (Number.isFinite(Number(item.at))) return Math.max(0, Number(item.at));
  if (item.at && typeof item.at === "object") {
    const scene = story.scenes.find((entry) => entry.id === item.at.sceneId);
    if (!scene) throw new Error(`SFX references unknown scene: ${item.at.sceneId}`);
    return Math.max(0, scene.start + Number(item.at.offset || 0));
  }
  if (item.sceneId) {
    const scene = story.scenes.find((entry) => entry.id === item.sceneId);
    if (!scene) throw new Error(`SFX references unknown scene: ${item.sceneId}`);
    return Math.max(0, scene.start + Number(item.offset || 0));
  }
  return 0;
}

function buildAudioMix({ ffmpeg, projectRoot, source, story, narrationPath, targetI, targetTp }) {
  const music = source.audio.music;
  const sfx = Array.isArray(source.audio.sfx) ? source.audio.sfx : [];
  const outputRelative = "assets/audio-master.wav";
  const outputPath = path.join(projectRoot, outputRelative);
  if (!music && !sfx.length) {
    const measured = analyze(ffmpeg, narrationPath, targetI, targetTp);
    const normalization = [`loudnorm=I=${targetI}`, `TP=${targetTp}`, "LRA=7", `measured_I=${measured.input_i}`, `measured_TP=${measured.input_tp}`, `measured_LRA=${measured.input_lra}`, `measured_thresh=${measured.input_thresh}`, `offset=${measured.target_offset}`, "linear=true", "print_format=summary"].join(":");
    run(ffmpeg, ["-y", "-v", "error", "-i", narrationPath, "-af", normalization, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", outputPath], "normalize narration master");
    const verified = analyze(ffmpeg, outputPath, targetI, targetTp);
    return { file: outputRelative, fileSha256: sha256File(outputPath), duration: story.duration, integratedLufs: Number(verified.input_i), truePeakDbtp: Number(verified.input_tp), music: false, sfx: 0 };
  }

  const args = ["-y", "-hide_banner", "-nostats", "-i", narrationPath];
  const filters = [`[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,atrim=0:${story.duration},asetpts=N/SR/TB[narrbase]`];
  let inputIndex = 1;
  let baseLabel = "narrbase";
  if (music) {
    const musicPath = projectMediaPath(projectRoot, music.file);
    args.push("-stream_loop", "-1", "-i", musicPath);
    const volume = Math.max(0, Math.min(1, Number(music.volume ?? 0.15)));
    const ducking = Math.max(0.05, Math.min(0.9, Number(music.ducking ?? 0.28)));
    filters.push("[narrbase]asplit=2[narrside][narrmix]");
    filters.push(`[${inputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,volume=${volume},atrim=0:${story.duration},asetpts=N/SR/TB[bg]`);
    filters.push(`[bg][narrside]sidechaincompress=threshold=${ducking}:ratio=8:attack=15:release=260[ducked]`);
    filters.push("[narrmix][ducked]amix=inputs=2:duration=first:normalize=0[musicmix]");
    baseLabel = "musicmix";
    inputIndex += 1;
  }
  const mixLabels = [`[${baseLabel}]`];
  for (const [index, item] of sfx.entries()) {
    const sfxPath = projectMediaPath(projectRoot, item.file);
    args.push("-i", sfxPath);
    const delay = Math.round(sfxStart(item, story) * 1000);
    const volume = Math.max(0, Math.min(2, Number(item.volume ?? 0.5)));
    filters.push(`[${inputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,volume=${volume},adelay=${delay}:all=1,apad,atrim=0:${story.duration}[sfx${index}]`);
    mixLabels.push(`[sfx${index}]`);
    inputIndex += 1;
  }
  if (sfx.length) filters.push(`${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:normalize=0[mix]`);
  else filters.push(`[${baseLabel}]anull[mix]`);
  const rawPath = path.join(projectRoot, ".media", "audio-mix-raw.wav");
  args.push("-filter_complex", filters.join(";"), "-map", "[mix]", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", rawPath);
  run(ffmpeg, args, "mix narration, music, and sound effects");
  const measured = analyze(ffmpeg, rawPath, targetI, targetTp);
  const normalization = [
    `loudnorm=I=${targetI}`,
    `TP=${targetTp}`,
    "LRA=7",
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    "linear=true",
    "print_format=summary",
  ].join(":");
  run(ffmpeg, ["-y", "-v", "error", "-i", rawPath, "-af", normalization, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", outputPath], "normalize final audio mix");
  const verified = analyze(ffmpeg, outputPath, targetI, targetTp);
  return { file: outputRelative, fileSha256: sha256File(outputPath), duration: story.duration, integratedLufs: Number(verified.input_i), truePeakDbtp: Number(verified.input_tp), music: Boolean(music), sfx: sfx.length };
}

export function processAudio(projectArg) {
  const project = validateLockedSource(projectArg);
  const { projectRoot, source } = project;
  const { ffmpeg, ffprobe } = mediaBinaries();
  const requestPath = path.join(projectRoot, ".media", "audio-request.json");
  if (!fs.existsSync(requestPath)) throw new Error("Missing .media/audio-request.json; run export first");
  const request = readJson(requestPath);
  const expectedHash = sha256Text(source.scenes.map(spokenText).join("\n"));
  if (request.lockedCopySha256 !== expectedHash) throw new Error("Audio request does not match the locked script");

  const rawDir = path.join(projectRoot, ".media", "raw-cues");
  const balancedDir = path.join(projectRoot, ".media", "balanced-cues");
  const concatDir = path.join(projectRoot, ".media", "scene-concats");
  const assetDir = path.join(projectRoot, "assets");
  for (const directory of [balancedDir, concatDir, assetDir]) fs.mkdirSync(directory, { recursive: true });

  const targetI = Number(source.audio.targetLufs);
  const targetTp = Number(source.audio.targetTruePeak);
  const sentenceGap = Number(source.audio.sentenceGap);
  const compression = "dynaudnorm=f=120:g=5:p=0.85:m=10:r=0.14:s=8:b=true";
  const trim = [
    "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-42dB",
    "areverse",
    "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-42dB",
    "areverse",
  ].join(",");

  const generatedScenes = [];
  const manifestScenes = [];
  let timeline = 0;

  for (const [sceneIndex, scene] of source.scenes.entries()) {
    const cueEntries = [];
    const concatLines = [];
    let cueCursor = 0;

    for (const [cueIndex, text] of scene.cues.entries()) {
      const itemId = `${scene.id}-cue-${String(cueIndex + 1).padStart(2, "0")}`;
      const requestItem = request.items.find((item) => item.id === itemId);
      if (!requestItem || requestItem.text !== text) throw new Error(`${itemId}: audio request text drift`);
      const rawPath = findCueAudio(rawDir, itemId);
      if (!rawPath) throw new Error(`${itemId}: raw cue audio is missing from ${rawDir}`);
      const balancedPath = path.join(balancedDir, `${itemId}.wav`);
      run(
        ffmpeg,
        ["-y", "-hide_banner", "-nostats", "-i", rawPath, "-af", `${trim},${compression}`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", balancedPath],
        `balance ${itemId}`,
      );
      const cueDuration = probeDuration(ffprobe, balancedPath);
      cueEntries.push({
        at: Number(cueCursor.toFixed(6)),
        duration: Number(cueDuration.toFixed(6)),
        text,
        words: cueWordTiming(rawDir, itemId, text, cueDuration, source.copy.language),
      });
      cueCursor += cueDuration;
      concatLines.push(`file '${concatEscape(balancedPath)}'`);

      if (cueIndex < scene.cues.length - 1) {
        const silencePath = path.join(concatDir, `silence-${sentenceGap.toFixed(3)}.wav`);
        if (!fs.existsSync(silencePath)) {
          run(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", String(sentenceGap), "-c:a", "pcm_s16le", silencePath], "create sentence gap");
        }
        concatLines.push(`file '${concatEscape(silencePath)}'`);
        cueCursor += sentenceGap;
      }
    }

    const concatList = path.join(concatDir, `${scene.id}.txt`);
    const concatAudio = path.join(concatDir, `${scene.id}.wav`);
    fs.writeFileSync(concatList, `${concatLines.join("\n")}\n`);
    run(ffmpeg, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", concatAudio], `join ${scene.id}`);

    const measured = analyze(ffmpeg, concatAudio, targetI, targetTp, compression);
    const normalization = [
      `loudnorm=I=${targetI}`,
      `TP=${targetTp}`,
      "LRA=7",
      `measured_I=${measured.input_i}`,
      `measured_TP=${measured.input_tp}`,
      `measured_LRA=${measured.input_lra}`,
      `measured_thresh=${measured.input_thresh}`,
      `offset=${measured.target_offset}`,
      "linear=true",
      "print_format=summary",
    ].join(":");

    const finalRelative = `assets/voice-${String(sceneIndex + 1).padStart(2, "0")}.wav`;
    const finalPath = path.join(projectRoot, finalRelative);
    run(
      ffmpeg,
      ["-y", "-hide_banner", "-nostats", "-i", concatAudio, "-af", `${compression},${normalization}`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", finalPath],
      `normalize ${scene.id}`,
    );

    let verified = analyze(ffmpeg, finalPath, targetI, targetTp);
    for (let pass = 0; pass < 2; pass += 1) {
      const gain = targetI - Number.parseFloat(verified.input_i);
      if (Math.abs(gain) <= 0.2) break;
      const corrected = `${finalPath}.corrected.wav`;
      run(
        ffmpeg,
        ["-y", "-v", "error", "-i", finalPath, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.8414:attack=5:release=80:level=false`, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", corrected],
        `correct ${scene.id}`,
      );
      fs.copyFileSync(corrected, finalPath);
      fs.unlinkSync(corrected);
      verified = analyze(ffmpeg, finalPath, targetI, targetTp);
    }

    const audioDuration = Number(probeDuration(ffprobe, finalPath).toFixed(6));
    const lead = Number(source.audio.sceneLead);
    const tail = sceneIndex === source.scenes.length - 1 ? Number(source.audio.finalTail) : Number(source.audio.sceneTail);
    const sceneDuration = Number((lead + audioDuration + tail).toFixed(6));
    const voiceStart = Number((timeline + lead).toFixed(6));
    const visualAssetPath = scene.visual.asset ? path.resolve(projectRoot, scene.visual.asset) : null;
    const generatedVisual = {
      ...scene.visual,
      asset: visualAssetPath && fs.existsSync(visualAssetPath) ? scene.visual.asset : null,
    };
    generatedScenes.push({
      id: scene.id,
      kind: scene.kind,
      start: Number(timeline.toFixed(6)),
      duration: sceneDuration,
      eyebrow: scene.eyebrow,
      chapter: scene.chapter,
      title: scene.title,
      layout: scene.layout,
      visual: generatedVisual,
      ...(scene.visualNumber ? { visualNumber: scene.visualNumber } : {}),
      voice: { src: finalRelative, start: voiceStart, duration: audioDuration, cues: cueEntries },
    });
    manifestScenes.push({
      id: scene.id,
      textSha256: sha256Text(spokenText(scene)),
      file: finalRelative,
      fileSha256: sha256File(finalPath),
      duration: audioDuration,
      integratedLufs: Number.parseFloat(verified.input_i),
      truePeakDbtp: Number.parseFloat(verified.input_tp),
      cueCount: cueEntries.length,
    });
    timeline += sceneDuration;
  }

  const story = {
    duration: Number(timeline.toFixed(6)),
    project: source.project,
    copy: source.copy,
    audio: source.audio,
    visual: source.visual,
    render: source.render,
    scenes: generatedScenes,
  };

  const masterLines = [];
  let audioCursor = 0;
  for (const scene of generatedScenes) {
    const gap = scene.voice.start - audioCursor;
    if (gap > 0.0005) masterLines.push(`file '${concatEscape(silenceFile(ffmpeg, concatDir, gap))}'`);
    masterLines.push(`file '${concatEscape(path.join(projectRoot, scene.voice.src))}'`);
    audioCursor = scene.voice.start + scene.voice.duration;
  }
  const finalGap = story.duration - audioCursor;
  if (finalGap > 0.0005) masterLines.push(`file '${concatEscape(silenceFile(ffmpeg, concatDir, finalGap))}'`);
  const masterList = path.join(concatDir, "narration-master.txt");
  const masterRelative = "assets/narration-master.wav";
  const masterPath = path.join(projectRoot, masterRelative);
  fs.writeFileSync(masterList, `${masterLines.join("\n")}\n`);
  run(ffmpeg, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", masterList, "-c", "copy", masterPath], "build narration master");
  const masterDuration = Number(probeDuration(ffprobe, masterPath).toFixed(6));

  const mix = buildAudioMix({ ffmpeg, projectRoot, source, story, narrationPath: masterPath, targetI, targetTp });
  mix.duration = Number(probeDuration(ffprobe, path.join(projectRoot, mix.file)).toFixed(6));
  story.audio = { ...story.audio, finalMix: mix.file };

  fs.writeFileSync(path.join(projectRoot, "story.js"), `window.VIDEO_WORKFLOW_STORY = ${JSON.stringify(story, null, 2)};\n`);
  writeJson(path.join(assetDir, "voice-manifest.json"), {
    schemaVersion: 3,
    verifiedAgainst: "locked-copy-free-local-dynamic-balanced-loudness",
    scenes: manifestScenes,
    master: { file: masterRelative, fileSha256: sha256File(masterPath), duration: masterDuration },
    mix,
  });
  const deliverables = writeDeliverables(projectRoot, source, story);
  const indexPath = path.join(projectRoot, "index.html");
  const html = fs.readFileSync(indexPath, "utf8")
    .replace(/data-duration="[0-9.]+"/u, `data-duration="${story.duration}"`)
    .replace(/data-width="[0-9.]+"/u, `data-width="${story.render.width}"`)
    .replace(/data-height="[0-9.]+"/u, `data-height="${story.render.height}"`);
  fs.writeFileSync(indexPath, html);
  return { story, manifestScenes, master: { path: masterPath, duration: masterDuration }, mix, deliverables };
}
