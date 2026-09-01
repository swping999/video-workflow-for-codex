import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject, inferContentType } from "../plugins/video-workflow/runtime/src/project.mjs";
import { inferContentTypeDetailed } from "../plugins/video-workflow/runtime/src/content-schema.mjs";
import { detectLanguage, splitSubtitleCues } from "../plugins/video-workflow/runtime/src/language.mjs";
import { exportJobs } from "../plugins/video-workflow/runtime/src/export-jobs.mjs";
import { validateLockedSource } from "../plugins/video-workflow/runtime/src/source.mjs";
import { synthesizeProject } from "../plugins/video-workflow/runtime/src/tts.mjs";
import { reviseProject } from "../plugins/video-workflow/runtime/src/revision.mjs";

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
  assert.ok(result.source.scenes.every((scene) => ["hero", "list-item", "summary"].includes(scene.layout)));
});

test("automatic routing recognizes common video structures", () => {
  assert.equal(inferContentType("第一步准备，第二步执行，最后检查。", 2), "workflow");
  assert.equal(inferContentType("A 和 B 有什么区别？完整对比。", 2), "comparison");
  assert.equal(inferContentType("GitHub 星标增长了 35%。", 2), "data-story");
  assert.equal(inferContentType("产品用户增长 30%。", 1), "data-story");
  assert.equal(inferContentType("这是概念介绍。\n\n这是原理。\n\n这是类比。\n\n这是总结。", 4), "explainer");
  assert.ok(inferContentTypeDetailed("产品用户增长 30%。", 1).confidence > 0.6);
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
      assert.ok(result.source.scenes.every((scene) => !scene.title.endsWith("…")));
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

test("real charts require values and a source and preserve numeric data", () => {
  const item = fixture();
  fs.writeFileSync(item.script, "数据趋势。\n\n2024 年是 18%，2025 年是 31%。\n\n结论。\n");
  const plan = path.join(item.root, "plan.json");
  fs.writeFileSync(plan, `${JSON.stringify({
    schemaVersion: 1,
    type: "data-story",
    sources: [{ id: "report", title: "Annual report", url: "https://example.com/report" }],
    scenes: [
      {},
      { chart: { type: "bar", labels: ["2024", "2025"], values: [18, 31], unit: "%", sourceId: "report" } },
      {},
    ],
  }, null, 2)}\n`);
  const result = createProject({ scriptPath: item.script, outputDir: item.project, slug: "real-chart", planPath: plan });
  assert.deepEqual(result.source.scenes[1].visual.model.values, [18, 31]);
  assert.equal(result.source.scenes[1].visual.model.sourceId, "report");
  assert.doesNotMatch(fs.readFileSync(path.join(item.project, "index.html"), "utf8"), /34\+\(i\*19\)%58/u);
});

test("charts without a source cannot masquerade as real data", () => {
  const item = fixture();
  const plan = path.join(item.root, "plan.json");
  fs.writeFileSync(plan, `${JSON.stringify({ schemaVersion: 1, type: "data-story", scenes: [{}, { chart: { type: "bar", labels: ["A"], values: [10] } }] }, null, 2)}\n`);
  assert.throws(() => createProject({ scriptPath: item.script, outputDir: item.project, slug: "bad-chart", planPath: plan }), /requires sourceId or source/u);
});

test("comparison content uses shared dimensions instead of mechanical halves", () => {
  const item = fixture();
  fs.writeFileSync(item.script, "两个方案怎么选？\n\n按价格和难度比较。\n\n给出结论。\n");
  const plan = path.join(item.root, "plan.json");
  fs.writeFileSync(plan, `${JSON.stringify({ schemaVersion: 1, type: "comparison", comparison: { subjects: ["方案 A", "方案 B"], dimensions: [{ name: "价格", a: "免费", b: "付费" }, { name: "难度", a: "低", b: "中" }], verdict: "先用 A" } }, null, 2)}\n`);
  const result = createProject({ scriptPath: item.script, outputDir: item.project, slug: "comparison-table", planPath: plan });
  assert.deepEqual(result.source.scenes[1].visual.model.subjects, ["方案 A", "方案 B"]);
  assert.equal(result.source.scenes[1].visual.model.dimensions.length, 2);
});

test("language detection and cue splitting preserve exact locked text", () => {
  assert.equal(detectLanguage("This is an English video."), "en-US");
  assert.equal(detectLanguage("这是中文视频。"), "zh-CN");
  const text = "This is a deliberately long sentence that needs a safe subtitle break while preserving every character exactly.";
  assert.equal(splitSubtitleCues(text, "en-US").join(""), text);
});

test("locked content plan tampering is rejected", () => {
  const item = fixture();
  createProject({ scriptPath: item.script, outputDir: item.project, slug: "plan-lock" });
  fs.appendFileSync(path.join(item.project, "content-plan.locked.json"), " ");
  assert.throws(() => validateLockedSource(item.project), /content-plan hash differs/u);
});

test("revision archives the previous locked version in the same project", () => {
  const item = fixture();
  createProject({ scriptPath: item.script, outputDir: item.project, slug: "versioned-copy" });
  const revised = path.join(item.root, "revised.txt");
  fs.writeFileSync(revised, "新的第一幕。\n\n新的第二幕。\n");
  const result = reviseProject(item.project, { scriptPath: revised });
  assert.equal(result.revision, 1);
  assert.equal(fs.readFileSync(path.join(item.project, "script.locked.txt"), "utf8").trim(), "新的第一幕。\n\n新的第二幕。");
  assert.equal(fs.readFileSync(path.join(result.archive, "script.locked.txt"), "utf8").trim(), "第一幕介绍问题。\n\n第二幕解释原因！还有一句。");
});

test("promo proof cannot be an unsourced marketing claim", () => {
  const item = fixture();
  const plan = path.join(item.root, "promo-plan.json");
  fs.writeFileSync(plan, `${JSON.stringify({ schemaVersion: 1, type: "promo", scenes: [{ visual: { kind: "hero", points: ["Start"] } }, { visual: { kind: "proof", points: ["Evidence"], proof: ["增长 300%"] } }] }, null, 2)}\n`);
  assert.throws(() => createProject({ scriptPath: item.script, outputDir: item.project, slug: "unsafe-promo", planPath: plan }), /must reference a verified claim/u);
});
