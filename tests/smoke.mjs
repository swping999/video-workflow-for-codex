import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "../plugins/video-workflow/runtime/src/project.mjs";
import { exportJobs } from "../plugins/video-workflow/runtime/src/export-jobs.mjs";
import { processAudio } from "../plugins/video-workflow/runtime/src/process-audio.mjs";
import { verifyProject } from "../plugins/video-workflow/runtime/src/verify.mjs";
import { mediaBinaries } from "../plugins/video-workflow/runtime/src/media-tools.mjs";
import { run } from "../plugins/video-workflow/runtime/src/utils.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "video-workflow-smoke-"));
const script = path.join(root, "script.txt");
const project = path.join(root, "episode");
fs.writeFileSync(script, "字幕和旁白应该来自同一份文案。\n\n真实音频决定场景时长。\n");

createProject({ scriptPath: script, outputDir: project, slug: "smoke-episode", type: "explainer", format: "portrait", theme: "editorial" });
const jobs = exportJobs(project);
const { ffmpeg } = mediaBinaries();
const rawDir = path.join(project, ".media", "raw-cues");
for (const [index, item] of jobs.audioRequest.items.entries()) {
  run(
    ffmpeg,
    ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=${440 + index * 40}:duration=0.6`, "-ar", "48000", "-ac", "1", path.join(rawDir, `${item.id}.wav`)],
    `generate smoke cue ${item.id}`,
  );
}

const processed = processAudio(project);
const verified = verifyProject(project);
assert.equal(processed.story.scenes.length, 2);
assert.equal(verified.scenes, 2);
assert.ok(verified.duration > 1);

const storyPath = path.join(project, "story.js");
const originalStory = fs.readFileSync(storyPath, "utf8");
fs.writeFileSync(storyPath, originalStory.replace("真实音频决定场景时长。", "字幕已经被错误改写。"));
assert.throws(() => verifyProject(project), /captions differ from locked narration/u);
fs.writeFileSync(storyPath, originalStory);

const firstVoice = path.join(project, processed.manifestScenes[0].file);
const originalVoice = fs.readFileSync(firstVoice);
fs.appendFileSync(firstVoice, Buffer.from([0]));
assert.throws(() => verifyProject(project), /normalized audio changed after processing/u);
fs.writeFileSync(firstVoice, originalVoice);

console.log(`Smoke test passed: ${verified.scenes} scenes, ${verified.duration.toFixed(3)}s`);
