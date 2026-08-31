import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { existingFile, run } from "./utils.mjs";

const require = createRequire(import.meta.url);

function packageBinary(packageName) {
  try {
    const resolved = require(packageName).path;
    fs.accessSync(resolved, fs.constants.X_OK);
    return resolved;
  } catch {
    return null;
  }
}

function pathBinary(name) {
  const result = run(process.platform === "win32" ? "where" : "which", [name], `locate ${name}`);
  return result.stdout.trim().split(/\r?\n/u)[0] || null;
}

export function mediaBinaries() {
  let ffmpeg = packageBinary("@ffmpeg-installer/ffmpeg");
  let ffprobe = packageBinary("@ffprobe-installer/ffprobe");
  try { ffmpeg ||= pathBinary("ffmpeg"); } catch {}
  try { ffprobe ||= pathBinary("ffprobe"); } catch {}
  if (!ffmpeg || !ffprobe) {
    throw new Error("ffmpeg and ffprobe are required. Run npm ci in the plugin runtime directory.");
  }
  return { ffmpeg, ffprobe };
}

export function probeDuration(ffprobe, inputPath) {
  const result = run(
    ffprobe,
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", inputPath],
    `probe ${path.basename(inputPath)}`,
  );
  const duration = Number.parseFloat(result.stdout);
  if (!Number.isFinite(duration)) throw new Error(`Invalid duration for ${inputPath}`);
  return duration;
}

export function findCueAudio(rawDir, itemId) {
  return existingFile(["wav", "flac", "mp3", "m4a", "aac"].map((extension) => path.join(rawDir, `${itemId}.${extension}`)));
}
