import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "../plugins/video-workflow/runtime/src/project.mjs";
import { exportJobs } from "../plugins/video-workflow/runtime/src/export-jobs.mjs";
import { processAudio } from "../plugins/video-workflow/runtime/src/process-audio.mjs";
import { renderProject } from "../plugins/video-workflow/runtime/src/render.mjs";
import { mediaBinaries, probeDuration } from "../plugins/video-workflow/runtime/src/media-tools.mjs";
import { run } from "../plugins/video-workflow/runtime/src/utils.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "video-workflow-render-"));
const script = path.join(root, "script.txt");
const project = path.join(root, "episode");
fs.writeFileSync(script, "一份文案驱动整条视频时间线。\n\n字幕、声音和动画都经过自动检查。\n");
const { ffmpeg, ffprobe } = mediaBinaries();

createProject({ scriptPath: script, outputDir: project, slug: "render-multi-format", type: "workflow", format: "portrait", platform: "douyin", theme: "editorial" });
const jobs = exportJobs(project);
const rawDir = path.join(project, ".media", "raw-cues");
for (const [index, item] of jobs.audioRequest.items.entries()) {
  run(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=${500 + index * 70}:duration=0.55`, "-ar", "48000", "-ac", "1", path.join(rawDir, `${item.id}.wav`)], `generate render cue ${item.id}`);
}
const processed = processAudio(project);
const rendered = await renderProject(project, { quality: "draft", formats: "landscape,portrait,social" });
assert.equal(rendered.outputs.length, 3);
assert.equal(rendered.covers.length, 3);
assert.ok(fs.statSync(rendered.output).size > 10_000);
assert.ok(Math.abs(probeDuration(ffprobe, rendered.output) - processed.story.duration) < 0.09);
assert.equal(rendered.report.renderer, "chromium-frames");
assert.equal(rendered.report.localSceneCache, true);
assert.deepEqual(rendered.report.formats.map((item) => [item.width, item.height]), [[1920, 1080], [1080, 1920], [1080, 1350]]);
for (const output of [...rendered.outputs, ...rendered.covers]) assert.ok(fs.statSync(output).size > 5_000);
console.log(`Render smoke passed (3 formats): ${rendered.outputs.join(", ")}`);
