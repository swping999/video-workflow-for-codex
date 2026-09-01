import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../plugins/video-workflow/runtime/src/project.mjs";
import { exportJobs } from "../plugins/video-workflow/runtime/src/export-jobs.mjs";
import { processAudio } from "../plugins/video-workflow/runtime/src/process-audio.mjs";
import { verifyProject } from "../plugins/video-workflow/runtime/src/verify.mjs";
import { mediaBinaries } from "../plugins/video-workflow/runtime/src/media-tools.mjs";
import { readJson, run, writeJson } from "../plugins/video-workflow/runtime/src/utils.mjs";

test("music and sound effects are mixed under narration and verified", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "video-workflow-mix-"));
  const script = path.join(root, "script.txt");
  const project = path.join(root, "episode");
  const music = path.join(root, "music.wav");
  const click = path.join(root, "click.wav");
  const sfx = path.join(root, "sfx.json");
  fs.writeFileSync(script, "第一段旁白。\n\n第二段旁白。\n");
  const { ffmpeg } = mediaBinaries();
  run(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=180:duration=1.2", "-ar", "48000", "-ac", "1", music], "generate music fixture");
  run(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=900:duration=0.12", "-ar", "48000", "-ac", "1", click], "generate SFX fixture");
  writeJson(sfx, [{ file: click, at: 0.2, volume: 0.2 }]);
  createProject({ scriptPath: script, outputDir: project, slug: "audio-mix", musicPath: music, sfxManifestPath: sfx });
  const jobs = exportJobs(project);
  const raw = path.join(project, ".media", "raw-cues");
  for (const [index, item] of jobs.audioRequest.items.entries()) {
    run(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=${440 + index * 80}:duration=0.48`, "-ar", "48000", "-ac", "1", path.join(raw, `${item.id}.wav`)], "generate narration fixture");
  }
  processAudio(project);
  verifyProject(project);
  const manifest = readJson(path.join(project, "assets", "voice-manifest.json"));
  assert.equal(manifest.mix.music, true);
  assert.equal(manifest.mix.sfx, 1);
  assert.ok(fs.statSync(path.join(project, manifest.mix.file)).size > 10_000);
});
