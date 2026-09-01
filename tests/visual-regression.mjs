import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createProject, formats, themes } from "../plugins/video-workflow/runtime/src/project.mjs";
import { findBrowserExecutable } from "../plugins/video-workflow/runtime/src/render.mjs";
import { sha256File, writeJson } from "../plugins/video-workflow/runtime/src/utils.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRequire = createRequire(new URL("../plugins/video-workflow/runtime/package.json", import.meta.url));
const puppeteer = runtimeRequire("puppeteer-core");
const outputRoot = path.resolve(process.env.VIDEO_WORKFLOW_VISUAL_OUTPUT || path.join(os.tmpdir(), "video-workflow-visual-regression"));
const types = ["explainer", "listicle", "workflow", "comparison", "promo", "data-story"];
const browserPath = findBrowserExecutable();
if (!browserPath) throw new Error("Visual regression needs Chrome, Chromium, or Edge");
fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

function mime(filePath) {
  return ({ ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" })[path.extname(filePath)] || "application/octet-stream";
}

async function serverFor(root) {
  const server = http.createServer((request, response) => {
    const relative = new URL(request.url || "/", "http://localhost").pathname.replace(/^\/+/, "") || "index.html";
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": mime(target), "Cache-Control": "no-store" });
    fs.createReadStream(target).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

function fakeStory(source) {
  return {
    duration: source.scenes.length,
    project: source.project,
    copy: source.copy,
    audio: source.audio,
    visual: source.visual,
    render: source.render,
    scenes: source.scenes.map((scene, index) => ({
      ...scene,
      start: index,
      duration: 1,
      voice: {
        src: null,
        start: index + 0.08,
        duration: 0.82,
        cues: scene.cues.map((text, cueIndex) => ({ text, at: cueIndex * (0.78 / scene.cues.length), duration: 0.78 / scene.cues.length, words: [] })),
      },
    })),
  };
}

function fixtureFor(type) {
  const genericScript = "视觉回归测试开场。\n\n第二段用于检查内容图解、文字边界和安全区域。\n\n最后总结。\n";
  const base = { schemaVersion: 1, type, sources: [], claims: [], scenes: [{ visual: { kind: "hero", points: ["结构", "同步", "质检"] } }, {}, { visual: { kind: "summary", points: ["完整", "清楚", "可验证"] } }] };
  if (type === "explainer") base.scenes[1] = { visual: { kind: "mechanism", nodes: [{ id: "input", label: "输入" }, { id: "process", label: "处理" }, { id: "output", label: "输出" }], relation: "explains" } };
  if (type === "listicle") base.scenes[1] = { visual: { kind: "list-item", item: { rank: 1, name: "示例项目", reason: "检查清单排版", audience: "内容创作者", pros: ["清晰", "连续编号"], cons: ["示例"], score: 4.8 } } };
  if (type === "workflow") base.scenes[1] = { visual: { kind: "process", current: 2, steps: [{ label: "导入", input: "脚本", operation: "读取", output: "场景" }, { label: "处理", input: "场景", operation: "排版", check: "无溢出" }, { label: "导出", operation: "渲染", output: "视频", check: "通过" }] } };
  if (type === "comparison") base.scenes[1] = { comparison: { subjects: ["方案 A", "方案 B"], dimensions: [{ name: "价格", a: "免费", b: "付费" }, { name: "难度", a: "低", b: "中" }, { name: "速度", a: "快", b: "稳定" }], verdict: "按场景选择" } };
  if (type === "promo") base.scenes[1] = { visual: { kind: "feature-demo", points: ["功能演示", "真实素材", "明确交付"], proof: [] } };
  if (type === "data-story") {
    base.sources = [{ id: "fixture", title: "Visual regression fixture" }];
    base.scenes[1] = { chart: { type: "bar", labels: ["2024", "2025", "2026"], values: [18, 31, 46], unit: "%", sourceId: "fixture", domain: [0, 50], annotations: [{ label: "趋势检查", index: 1 }] } };
    return { script: "数据回归测试开场。\n\n2024 年是 18%，2025 年是 31%，2026 年是 46%。\n\n最后总结。\n", plan: base };
  }
  return { script: genericScript, plan: base };
}

const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"] });
const report = [];
try {
  for (const type of types) {
    for (const format of Object.keys(formats)) {
      for (const theme of themes) {
        const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "video-workflow-visual-case-"));
        const scriptPath = path.join(fixtureRoot, "script.txt");
        const planPath = path.join(fixtureRoot, "plan.json");
        const projectPath = path.join(fixtureRoot, "episode");
        const fixture = fixtureFor(type);
        fs.writeFileSync(scriptPath, fixture.script);
        writeJson(planPath, fixture.plan);
        const created = createProject({ scriptPath, outputDir: projectPath, slug: `${type}-${format}-${theme}`, type, format, theme, planPath });
        const story = fakeStory(created.source);
        fs.writeFileSync(path.join(projectPath, "story.js"), `window.VIDEO_WORKFLOW_STORY = ${JSON.stringify(story)};\n`);
        fs.copyFileSync(path.join(repositoryRoot, "plugins", "video-workflow", "runtime", "node_modules", "gsap", "dist", "gsap.min.js"), path.join(projectPath, "assets", "gsap.min.js"));
        const { server, url } = await serverFor(projectPath);
        try {
          const page = await browser.newPage();
          await page.setViewport({ width: formats[format].width, height: formats[format].height, deviceScaleFactor: 1 });
          await page.goto(url, { waitUntil: "networkidle0" });
          await page.waitForFunction(() => window.__VIDEO_READY === true);
          await page.evaluate(async () => window.__seekVideo(1.84));
          const diagnostics = await page.evaluate(() => window.__videoDiagnostics());
          assert.deepEqual(diagnostics.overflows, [], `${type}/${format}/${theme} text overflow`);
          assert.deepEqual(diagnostics.safeViolations, [], `${type}/${format}/${theme} safe-area violation`);
          assert.deepEqual(diagnostics.missingMedia, [], `${type}/${format}/${theme} missing media`);
          assert.deepEqual(diagnostics.layoutIssues, [], `${type}/${format}/${theme} layout issue`);
          assert.ok(diagnostics.contrast >= 4.5, `${type}/${format}/${theme} contrast`);
          const screenshot = path.join(outputRoot, `${type}-${format}-${theme}.png`);
          await page.screenshot({ path: screenshot, type: "png" });
          report.push({ type, format, theme, screenshot: path.basename(screenshot), sha256: sha256File(screenshot), diagnostics });
          await page.close();
        } finally {
          await new Promise((resolve) => server.close(resolve));
          fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
      }
    }
  }
} finally {
  await browser.close();
}
writeJson(path.join(outputRoot, "report.json"), { schemaVersion: 1, combinations: report.length, report });
assert.equal(report.length, 72);
console.log(`Visual regression passed: ${report.length} screenshots at ${outputRoot}`);
