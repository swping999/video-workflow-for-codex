import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { mediaBinaries, probeDuration } from "./media-tools.mjs";
import { formats } from "./project.mjs";
import { readJson, run, sha256File, sha256Text, writeJson } from "./utils.mjs";
import { loadProject } from "./source.mjs";
import { verifyProject } from "./verify.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function executable(candidate) {
  if (!candidate) return null;
  try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch { return null; }
}

export function findBrowserExecutable() {
  const windowsRoots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = [
    process.env.VIDEO_WORKFLOW_BROWSER_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    ...windowsRoots.flatMap((root) => [path.join(root, "Google", "Chrome", "Application", "chrome.exe"), path.join(root, "Microsoft", "Edge", "Application", "msedge.exe")]),
  ];
  return candidates.map(executable).find(Boolean) || null;
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
    ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac",
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/x-m4v",
  })[extension] || "application/octet-stream";
}

async function startServer(projectRoot, storyOverride) {
  const root = path.resolve(projectRoot);
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      if (relative === "story.js" && storyOverride) {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
        response.end(storyOverride);
        return;
      }
      const target = path.resolve(root, relative);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end("Forbidden"); return; }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404).end("Not found"); return; }
      response.writeHead(200, { "Content-Type": mimeType(target), "Cache-Control": "no-store" });
      fs.createReadStream(target).pipe(response);
    } catch (error) { response.writeHead(500).end(error.message); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/index.html` };
}

function prepareGsap(projectRoot) {
  const source = path.join(runtimeRoot, "node_modules", "gsap", "dist", "gsap.min.js");
  if (!fs.existsSync(source)) throw new Error("GSAP is not installed in the plugin runtime");
  const destination = path.join(projectRoot, "assets", "gsap.min.js");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function loadStory(projectRoot) {
  const sandbox = { window: {} };
  const storyPath = path.join(projectRoot, "story.js");
  vm.runInNewContext(fs.readFileSync(storyPath, "utf8"), sandbox, { filename: storyPath });
  return sandbox.window.VIDEO_WORKFLOW_STORY;
}

function referencedFiles(value, output = []) {
  if (Array.isArray(value)) for (const item of value) referencedFiles(item, output);
  else if (value && typeof value === "object") for (const child of Object.values(value)) referencedFiles(child, output);
  else if (typeof value === "string" && /\.(?:png|jpe?g|webp|gif|svg|mp4|mov|webm|m4v)$/iu.test(value)) output.push(value);
  return output;
}

function sceneFingerprint(projectRoot, story, scene, format, templateHash) {
  const assetHashes = referencedFiles(scene.visual).sort().map((relative) => {
    const filePath = path.resolve(projectRoot, relative);
    return fs.existsSync(filePath) ? `${relative}:${sha256File(filePath)}` : `${relative}:missing`;
  });
  return sha256Text(JSON.stringify({ scene, format, dimensions: formats[format], theme: story.project.theme, language: story.copy.language, visual: story.visual, platform: story.render.platform, templateHash, assetHashes })).slice(0, 20);
}

function sceneAt(story, time) {
  let selected = story.scenes[0];
  for (const scene of story.scenes) if (scene.start <= time + 0.000001) selected = scene;
  return selected;
}

function normalizeFormats(requested, fallback) {
  const values = Array.isArray(requested) ? requested : String(requested || fallback).split(",");
  const unique = [...new Set(values.map((item) => item.trim()).filter(Boolean))];
  for (const value of unique) if (!formats[value]) throw new Error(`Unknown format: ${value}`);
  return unique;
}

function normalizeScenes(requested, story) {
  if (!requested) return new Set();
  const values = Array.isArray(requested) ? requested : String(requested).split(",");
  const ids = new Set();
  for (const value of values.map((item) => String(item).trim()).filter(Boolean)) {
    const number = Number(value);
    const scene = Number.isInteger(number) && number > 0 ? story.scenes[number - 1] : story.scenes.find((item) => item.id === value);
    if (!scene) throw new Error(`Unknown scene selection: ${value}`);
    ids.add(scene.id);
  }
  return ids;
}

function linkOrCopy(source, destination) {
  try { fs.linkSync(source, destination); } catch { fs.copyFileSync(source, destination); }
}

function assertDiagnostics(sceneId, diagnostics) {
  const failures = [];
  if (diagnostics.overflows?.length) failures.push(`text overflow: ${diagnostics.overflows.join(" | ")}`);
  if (diagnostics.safeViolations?.length) failures.push(`safe-area violation: ${diagnostics.safeViolations.join(", ")}`);
  if (diagnostics.missingMedia?.length) failures.push(`missing media: ${diagnostics.missingMedia.join(", ")}`);
  if (diagnostics.layoutIssues?.length) failures.push(`layout issue: ${diagnostics.layoutIssues.join(", ")}`);
  if (Number(diagnostics.contrast) < 4.5) failures.push(`ink/background contrast is ${diagnostics.contrast}:1`);
  if (failures.length) throw new Error(`${sceneId} visual QA failed:\n- ${failures.join("\n- ")}`);
}

async function renderVariant({ projectRoot, source, verification, baseStory, format, quality, browserPath, selectedScenes }) {
  const variant = structuredClone(baseStory);
  variant.project.format = format;
  variant.render = { ...variant.render, ...formats[format] };
  const storyOverride = `window.VIDEO_WORKFLOW_STORY = ${JSON.stringify(variant, null, 2)};\n`;
  const width = formats[format].width;
  const height = formats[format].height;
  const fps = Number(variant.render.fps);
  const frameCount = Math.max(1, Math.ceil(verification.duration * fps));
  const assemblyDir = fs.mkdtempSync(path.join(os.tmpdir(), `video-workflow-${format}-`));
  const cacheRoot = path.join(projectRoot, ".media", "cache", "frames", format);
  fs.mkdirSync(cacheRoot, { recursive: true });
  const templateHash = sha256File(path.join(projectRoot, "index.html"));
  const fingerprints = Object.fromEntries(variant.scenes.map((scene) => [scene.id, sceneFingerprint(projectRoot, variant, scene, format, templateHash)]));
  for (const sceneId of selectedScenes) {
    const prefix = `${sceneId}-`;
    for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) if (entry.isDirectory() && entry.name.startsWith(prefix)) fs.rmSync(path.join(cacheRoot, entry.name), { recursive: true, force: true });
  }

  const { server, url } = await startServer(projectRoot, storyOverride);
  let browser;
  const pageErrors = [];
  const qa = [];
  try {
    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"], defaultViewport: { width, height, deviceScaleFactor: 1 } });
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForFunction(() => window.__VIDEO_READY === true, { timeout: 30_000 });

    for (const scene of variant.scenes) {
      const cacheDir = path.join(cacheRoot, `${scene.id}-${fingerprints[scene.id]}`);
      fs.mkdirSync(cacheDir, { recursive: true });
      const qaPath = path.join(cacheDir, "qa.json");
      let result;
      if (fs.existsSync(qaPath) && !selectedScenes.has(scene.id)) result = readJson(qaPath);
      else {
        const time = Math.min(scene.start + scene.duration * 0.62, scene.voice.start + Math.max(0.05, scene.voice.duration - 0.12));
        await page.evaluate(async (seconds) => window.__seekVideo(seconds), time);
        result = await page.evaluate(() => window.__videoDiagnostics());
        writeJson(qaPath, result);
      }
      assertDiagnostics(scene.id, result);
      qa.push({ sceneId: scene.id, ...result });
    }

    for (let frame = 0; frame < frameCount; frame += 1) {
      const time = Math.min(verification.duration, frame / fps);
      const scene = sceneAt(variant, time);
      const cacheDir = path.join(cacheRoot, `${scene.id}-${fingerprints[scene.id]}`);
      const localFrame = Math.max(0, frame - Math.floor(scene.start * fps));
      const cached = path.join(cacheDir, `frame-${String(localFrame).padStart(6, "0")}.png`);
      if (!fs.existsSync(cached)) {
        await page.evaluate(async (seconds) => window.__seekVideo(seconds), time);
        await page.screenshot({ path: cached, type: "png", omitBackground: false });
      }
      linkOrCopy(cached, path.join(assemblyDir, `frame-${String(frame).padStart(6, "0")}.png`));
      if (frame === 0 || frame === frameCount - 1 || frame % Math.max(1, Math.floor(frameCount / 10)) === 0) process.stdout.write(`[${format}] frame ${frame + 1}/${frameCount}\n`);
    }
    const coverSafe = variant.render.platform?.coverSafeArea || variant.render.platform?.safeArea;
    await page.evaluate(async ({ seconds, coverSafe: area }) => {
      const rootElement = document.getElementById("root");
      rootElement.style.setProperty("--safe-top", `${(area.top || 0.12) * 100}%`);
      rootElement.style.setProperty("--safe-right", `${(area.right || 0.08) * 100}%`);
      rootElement.style.setProperty("--safe-bottom", `${(area.bottom || 0.16) * 100}%`);
      rootElement.style.setProperty("--safe-left", `${(area.left || 0.08) * 100}%`);
      await window.__seekVideo(seconds);
    }, { seconds: Math.min(variant.scenes[0].voice.start + 0.35, variant.scenes[0].start + variant.scenes[0].duration - 0.05), coverSafe });
    const coverDiagnostics = await page.evaluate(() => window.__videoDiagnostics());
    assertDiagnostics("cover", coverDiagnostics);
    qa.push({ sceneId: "cover", ...coverDiagnostics });
    const renderDir = path.join(projectRoot, "renders");
    fs.mkdirSync(renderDir, { recursive: true });
    await page.screenshot({ path: path.join(renderDir, `cover-${format}.png`), type: "png", omitBackground: false });
    if (pageErrors.length) throw new Error(`Browser render errors:\n- ${pageErrors.join("\n- ")}`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const renderDir = path.join(projectRoot, "renders");
  fs.mkdirSync(renderDir, { recursive: true });
  const output = path.join(renderDir, `final-${format}.mp4`);
  const manifest = readJson(path.join(projectRoot, "assets", "voice-manifest.json"));
  const audioPath = path.join(projectRoot, manifest.mix?.file || manifest.master.file);
  const settings = { draft: { crf: "28", preset: "veryfast" }, medium: { crf: "22", preset: "medium" }, high: { crf: "18", preset: "slow" } }[quality];
  try {
    run(ffmpegPath(), ["-y", "-v", "error", "-framerate", String(fps), "-start_number", "0", "-i", path.join(assemblyDir, "frame-%06d.png"), "-i", audioPath, "-t", String(verification.duration), "-c:v", "libx264", "-preset", settings.preset, "-crf", settings.crf, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "1", "-movflags", "+faststart", output], `encode ${format} video`);
  } finally { fs.rmSync(assemblyDir, { recursive: true, force: true }); }
  const { ffmpeg, ffprobe } = mediaBinaries();
  const outputDuration = probeDuration(ffprobe, output);
  if (Math.abs(outputDuration - verification.duration) > Math.max(0.08, 1 / fps + 0.02)) throw new Error(`Rendered duration drift for ${format}: expected ${verification.duration}s, got ${outputDuration}s`);
  const black = run(ffmpeg, ["-hide_banner", "-i", output, "-vf", "blackdetect=d=0.20:pic_th=0.98", "-an", "-f", "null", "-"], `black-frame check for ${format}`);
  if (/black_start:/u.test(black.stderr)) throw new Error(`Black-frame check failed for ${format}`);
  return { output, cover: path.join(renderDir, `cover-${format}.png`), fps, width, height, frames: frameCount, duration: outputDuration, qa, cache: cacheRoot };
}

function ffmpegPath() { return mediaBinaries().ffmpeg; }

export async function renderProject(projectArg, { quality = "high", formats: requestedFormats = null, scenes = null } = {}) {
  const verification = verifyProject(projectArg);
  const { projectRoot, source } = loadProject(projectArg);
  const browserPath = findBrowserExecutable();
  if (!browserPath) throw new Error("Chrome, Chromium, or Edge is required. Set VIDEO_WORKFLOW_BROWSER_PATH to its executable.");
  if (!["draft", "medium", "high"].includes(quality)) throw new Error("quality must be draft, medium, or high");
  prepareGsap(projectRoot);
  const baseStory = loadStory(projectRoot);
  const outputFormats = normalizeFormats(requestedFormats || source.render.outputs || [source.project.format], source.project.format);
  const selectedScenes = normalizeScenes(scenes, baseStory);
  const results = [];
  for (const format of outputFormats) results.push(await renderVariant({ projectRoot, source, verification, baseStory, format, quality, browserPath, selectedScenes }));
  const primary = results.find((result) => result.output.endsWith(`final-${source.project.format}.mp4`)) || results[0];
  const compatibilityOutput = path.join(projectRoot, "renders", "final.mp4");
  fs.copyFileSync(primary.output, compatibilityOutput);
  const report = { renderer: "chromium-frames", quality, browser: path.basename(browserPath), width: primary.width, height: primary.height, fps: primary.fps, duration: primary.duration, formats: results, verification, localSceneCache: true };
  writeJson(path.join(projectRoot, "renders", "render-report.json"), report);
  return { output: compatibilityOutput, outputs: results.map((result) => result.output), covers: results.map((result) => result.cover), verification, report };
}
