import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { sha256File, sha256Text, readJson } from "./utils.mjs";
import { mediaBinaries, probeDuration } from "./media-tools.mjs";
import { spokenText, validateLockedSource } from "./source.mjs";

export function verifyProject(projectArg) {
  const project = validateLockedSource(projectArg);
  const { projectRoot, source } = project;
  const failures = [];
  const storyPath = path.join(projectRoot, "story.js");
  const manifestPath = path.join(projectRoot, "assets", "voice-manifest.json");
  if (!fs.existsSync(storyPath)) failures.push("story.js is missing; process audio first");
  if (!fs.existsSync(manifestPath)) failures.push("assets/voice-manifest.json is missing; process audio first");
  if (failures.length) throw new Error(`Project verification failed:\n- ${failures.join("\n- ")}`);

  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(storyPath, "utf8"), sandbox, { filename: storyPath });
  const story = sandbox.window.VIDEO_WORKFLOW_STORY;
  const manifest = readJson(manifestPath);
  const { ffprobe } = mediaBinaries();

  if (!story || !Array.isArray(story.scenes)) throw new Error("Project verification failed:\n- story.js does not contain a valid story");
  if (story.copy?.subtitlePolicy !== "verbatim") failures.push("story subtitle policy is not verbatim");
  if (story.scenes.length !== source.scenes.length) failures.push("story scene count differs from the locked source");
  if (story.render?.renderer !== "chromium-frames") failures.push("story renderer is not chromium-frames");
  if (story.render?.width !== source.render.width || story.render?.height !== source.render.height) failures.push("story dimensions differ from source format");
  if (!story.visual?.languageFontFamily) failures.push("language-aware font family is missing");

  for (const [index, sceneSource] of source.scenes.entries()) {
    const scene = story.scenes[index];
    if (!scene || scene.id !== sceneSource.id) {
      failures.push(`${sceneSource.id}: generated scene is missing`);
      continue;
    }
    if (scene.layout !== sceneSource.layout) failures.push(`${scene.id}: scene layout differs from source`);
    if (JSON.stringify(scene.visual?.model) !== JSON.stringify(sceneSource.visual?.model)) failures.push(`${scene.id}: structured visual model differs from source`);
    if (scene.voice.cues.map((cue) => cue.text).join("") !== spokenText(sceneSource)) {
      failures.push(`${scene.id}: captions differ from locked narration`);
    }
    for (const [cueIndex, cue] of scene.voice.cues.entries()) {
      if (!Number.isFinite(cue.at) || cue.at < 0 || cue.at > scene.voice.duration) {
        failures.push(`${scene.id}: cue ${cueIndex + 1} is outside the narration timeline`);
      }
      if (cueIndex > 0 && cue.at <= scene.voice.cues[cueIndex - 1].at) {
        failures.push(`${scene.id}: cue ${cueIndex + 1} is not ordered after the previous cue`);
      }
      if (!Array.isArray(cue.words) || cue.words.some((word) => !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end < word.start || word.end > cue.duration + 0.08)) {
        failures.push(`${scene.id}: cue ${cueIndex + 1} has invalid word timing`);
      }
    }
    const item = manifest.scenes?.find((entry) => entry.id === scene.id);
    if (!item) {
      failures.push(`${scene.id}: voice manifest entry is missing`);
      continue;
    }
    if (item.textSha256 !== sha256Text(spokenText(sceneSource))) failures.push(`${scene.id}: narration hash differs`);
    const audioPath = path.join(projectRoot, item.file);
    if (!fs.existsSync(audioPath)) {
      failures.push(`${scene.id}: normalized audio is missing`);
      continue;
    }
    if (sha256File(audioPath) !== item.fileSha256) failures.push(`${scene.id}: normalized audio changed after processing`);
    const duration = probeDuration(ffprobe, audioPath);
    if (Math.abs(duration - item.duration) > 0.04 || Math.abs(duration - scene.voice.duration) > 0.04) {
      failures.push(`${scene.id}: audio duration drift`);
    }
    if (Math.abs(item.integratedLufs - source.audio.targetLufs) > 0.5) failures.push(`${scene.id}: loudness outside target tolerance`);
    if (item.truePeakDbtp > source.audio.targetTruePeak + 0.2) failures.push(`${scene.id}: true peak exceeds target`);
    if (index < source.scenes.length - 1) {
      const next = story.scenes[index + 1];
      const gap = next.voice.start - (scene.voice.start + scene.voice.duration);
      if (gap < -0.02) failures.push(`${scene.id}: narration overlaps the next scene by ${Math.abs(gap).toFixed(3)}s`);
      if (gap > 0.4) failures.push(`${scene.id}: inter-scene narration gap is ${gap.toFixed(3)}s`);
    }
    if (source.visual.requireSceneAssets) {
      const visualPath = path.resolve(projectRoot, sceneSource.visual.asset);
      if (!fs.existsSync(visualPath)) failures.push(`${scene.id}: required visual asset is missing`);
    }
  }

  const master = manifest.master;
  if (!master?.file) failures.push("narration master entry is missing");
  else {
    const masterPath = path.join(projectRoot, master.file);
    if (!fs.existsSync(masterPath)) failures.push("narration master audio is missing");
    else {
      if (sha256File(masterPath) !== master.fileSha256) failures.push("narration master audio changed after processing");
      const masterDuration = probeDuration(ffprobe, masterPath);
      if (Math.abs(masterDuration - story.duration) > 0.04 || Math.abs(masterDuration - master.duration) > 0.04) failures.push("narration master duration differs from the video timeline");
    }
  }
  const mix = manifest.mix;
  if (!mix?.file) failures.push("final audio mix entry is missing");
  else {
    const mixPath = path.join(projectRoot, mix.file);
    if (!fs.existsSync(mixPath)) failures.push("final audio mix is missing");
    else {
      if (sha256File(mixPath) !== mix.fileSha256) failures.push("final audio mix changed after processing");
      const mixDuration = probeDuration(ffprobe, mixPath);
      if (Math.abs(mixDuration - story.duration) > 0.05) failures.push("final audio mix duration differs from video timeline");
      if (Math.abs(mix.integratedLufs - source.audio.targetLufs) > 0.6) failures.push("final audio mix loudness is outside target tolerance");
      if (mix.truePeakDbtp > source.audio.targetTruePeak + 0.25) failures.push("final audio mix true peak exceeds target");
    }
  }

  for (const file of ["captions.srt", "captions.vtt", "word-timestamps.json", "storyboard.json", "storyboard.html", "fact-check.json", "fact-check.md"]) {
    if (!fs.existsSync(path.join(projectRoot, "deliverables", file))) failures.push(`deliverable is missing: ${file}`);
  }
  const wordFile = path.join(projectRoot, "deliverables", "word-timestamps.json");
  if (fs.existsSync(wordFile)) {
    const captions = readJson(wordFile);
    if (captions.entries?.map((entry) => entry.text).join("") !== source.scenes.map(spokenText).join("")) failures.push("subtitle deliverables differ from locked narration");
  }

  const indexPath = path.join(projectRoot, "index.html");
  const html = fs.readFileSync(indexPath, "utf8");
  if (!html.includes("scene.voice.cues")) failures.push("template captions do not read from voice cues");
  if (html.includes("scene.caption")) failures.push("template contains a second caption source");
  if (html.includes("34+(i*19)%58")) failures.push("template still contains fake chart heights");
  if (!html.includes("window.__videoDiagnostics")) failures.push("template visual diagnostics are missing");
  const compositionDuration = Number.parseFloat(html.match(/data-duration="([0-9.]+)"/u)?.[1]);
  const compositionWidth = Number.parseInt(html.match(/data-width="([0-9.]+)"/u)?.[1], 10);
  const compositionHeight = Number.parseInt(html.match(/data-height="([0-9.]+)"/u)?.[1], 10);
  if (!Number.isFinite(compositionDuration) || Math.abs(compositionDuration - story.duration) > 0.000001) {
    failures.push("composition duration differs from the narration timeline");
  }
  if (compositionWidth !== story.render.width || compositionHeight !== story.render.height) failures.push("composition dimensions differ from the selected format");
  if (failures.length) throw new Error(`Project verification failed:\n- ${failures.join("\n- ")}`);
  return {
    scenes: source.scenes.length,
    duration: story.duration,
    fingerprint: sha256Text(source.scenes.map(spokenText).join("\n")).slice(0, 16),
  };
}
