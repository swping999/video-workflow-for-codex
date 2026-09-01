import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject, inferContentType } from "../plugins/video-workflow/runtime/src/project.mjs";
import { exportJobs } from "../plugins/video-workflow/runtime/src/export-jobs.mjs";
import { validateLockedSource } from "../plugins/video-workflow/runtime/src/source.mjs";
import { synthesizeProject } from "../plugins/video-workflow/runtime/src/tts.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "video-workflow-test-"));
  const script = path.join(root, "script.txt");
  fs.writeFileSync(script, "第一幕介绍问题。\n\n第二幕解释原因！还有一句。\n");
  return { root, script, project: path.join(root, "episode") };
}

test("create locks copy and splits paragraphs into scenes", () => {
  const item = fixture();
  const result = createProject({ scriptPath: item.script, outputDir: item.project, slug: "test-episode" });
  assert.equal(result.source.scenes.length, 2);
  assert.deepEqual(result.source.scenes[1].cues, ["第二幕解释原因！", "还有一句。"]);
  assert.equal(result.source.visual.presenter.mode, "none");
  assert.equal(result.source.audio.provider, "system");
  assert.equal(result.source.render.renderer, "chromium-frames");
  assert.equal(result.source.copy.subtitlePolicy, "verbatim");
  assert.equal(validateLockedSource(item.project).source.project.slug, "test-episode");
});

test("one-sentence brief provenance is locked beside the generated script", () => {
  const item = fixture();
  const brief = "做一个讲 MCP 的竖版科普视频。";
  const result = createProject({ scriptPath: item.script, outputDir: item.project, slug: "brief-video", brief, format: "portrait" });
  assert.equal(result.source.copy.source, "codex-generated-from-brief");
  assert.equal(result.source.brief.status, "locked");
  assert.equal(fs.readFileSync(path.join(item.project, "brief.locked.txt"), "utf8").trim(), brief);
  assert.equal(validateLockedSource(item.project).source.brief.lockedFile, "brief.locked.txt");
});

test("brief provenance rejects a changed request", () => {
  const item = fixture();
  createProject({ scriptPath: item.script, outputDir: item.project, slug: "brief-video", brief: "做一个竖版科普视频。" });
  fs.writeFileSync(path.join(item.project, "brief.locked.txt"), "改成广告视频。\n");
  assert.throws(() => validateLockedSource(item.project), /locked brief hash differs/u);
});

test("content type and format options create reusable layouts", () => {
  const item = fixture();
  const result = createProject({ scriptPath: item.script, outputDir: item.project, slug: "portrait-list", type: "listicle", format: "portrait", theme: "tech" });
  assert.equal(result.source.project.type, "listicle");
  assert.equal(result.source.project.format, "portrait");
  assert.equal(result.source.render.width, 1080);
  assert.equal(result.source.render.height, 1920);
  assert.equal(result.source.project.theme, "tech");
  assert.ok(result.source.scenes.every((scene) => ["hero", "cards", "summary"].includes(scene.layout)));
});

test("automatic routing recognizes common video structures", () => {
  assert.equal(inferContentType("第一步准备，第二步执行，最后检查。", 2), "workflow");
  assert.equal(inferContentType("A 和 B 有什么区别？完整对比。", 2), "comparison");
  assert.equal(inferContentType("GitHub 星标增长了 35%。", 2), "data-story");
});

test("all content types and formats produce bounded layouts", () => {
  const types = ["explainer", "listicle", "workflow", "comparison", "promo", "data-story"];
  const formats = { landscape: [1920, 1080], portrait: [1080, 1920], social: [1080, 1350] };
  for (const type of types) {
    for (const [format, [width, height]] of Object.entries(formats)) {
      const item = fixture();
      const project = path.join(item.root, `${type}-${format}`);
      const result = createProject({ scriptPath: item.script, outputDir: project, slug: `${type}-${format}`, type, format });
      assert.equal(result.source.project.type, type);
      assert.equal(result.source.render.width, width);
      assert.equal(result.source.render.height, height);
      assert.ok(result.source.scenes.every((scene) => scene.title.length <= (format === "portrait" ? 25 : format === "social" ? 31 : 43)));
    }
  }
});

test("create refuses to overwrite an existing project", () => {
  const item = fixture();
  createProject({ scriptPath: item.script, outputDir: item.project, slug: "test-episode" });
  assert.throws(
    () => createProject({ scriptPath: item.script, outputDir: item.project, slug: "test-episode" }),
    /Refusing to overwrite/u,
  );
});

test("locked-copy provenance rejects later script edits", () => {
  const item = fixture();
  createProject({ scriptPath: item.script, outputDir: item.project, slug: "test-episode" });
  fs.writeFileSync(path.join(item.project, "script.locked.txt"), "这不是原来的锁定文案。\n");
  assert.throws(() => validateLockedSource(item.project), /locked script hash differs|locked paragraphs=/u);
});

test("export keeps voice text and image jobs deterministic", () => {
  const item = fixture();
  createProject({ scriptPath: item.script, outputDir: item.project, slug: "test-episode" });
  const exported = exportJobs(item.project);
  assert.equal(exported.audioRequest.items.length, 3);
  assert.equal(exported.audioRequest.items[1].text, "第二幕解释原因！");
  assert.equal(exported.imageRequest.items.length, 2);
  assert.match(exported.imageRequest.items[0].prompt, /Do not include a presenter/u);
});

test("TTS pronunciation text can differ without changing locked captions", () => {
  const item = fixture();
  fs.writeFileSync(item.script, "AI 视频的字幕必须保留原文。\n");
  createProject({ scriptPath: item.script, outputDir: item.project, slug: "ai-pronunciation" });
  const exported = exportJobs(item.project);
  assert.equal(exported.audioRequest.items[0].text, "AI 视频的字幕必须保留原文。");
  assert.equal(exported.audioRequest.items[0].ttsText, "A I 视频的字幕必须保留原文。");
});

test("runtime rejects cloud speech providers before making any request", async () => {
  const item = fixture();
  createProject({ scriptPath: item.script, outputDir: item.project, slug: "free-core" });
  exportJobs(item.project);
  await assert.rejects(() => synthesizeProject(item.project, { provider: "cloud" }), /free core never calls a cloud speech API/u);
});

test("project-owned paths cannot escape the project directory", () => {
  const item = fixture();
  createProject({ scriptPath: item.script, outputDir: item.project, slug: "safe-paths" });
  const sourcePath = path.join(item.project, "story-source.json");
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  source.copy.lockedFile = "../outside.txt";
  fs.writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
  assert.throws(() => validateLockedSource(item.project), /must stay inside/u);
});
