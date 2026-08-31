import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { mediaBinaries, probeDuration } from "./media-tools.mjs";
import { run, writeJson } from "./utils.mjs";
import { loadProject } from "./source.mjs";
import { verifyProject } from "./verify.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function executable(candidate) {
  if (!candidate) return null;
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

export function findBrowserExecutable() {
  const windowsRoots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = [
    process.env.VIDEO_WORKFLOW_BROWSER_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    ...windowsRoots.flatMap((root) => [
      path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
    ]),
  ];
  return candidates.map(executable).find(Boolean) || null;
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".wav": "audio/wav" })[extension] || "application/octet-stream";
}

async function startServer(projectRoot) {
  const root = path.resolve(projectRoot);
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const target = path.resolve(root, relative);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": mimeType(target), "Cache-Control": "no-store" });
      fs.createReadStream(target).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
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

export async function renderProject(projectArg, { quality = "high" } = {}) {
  const verification = verifyProject(projectArg);
  const { projectRoot, source } = loadProject(projectArg);
  const { ffmpeg, ffprobe } = mediaBinaries();
  const browserPath = findBrowserExecutable();
  if (!browserPath) throw new Error("Chrome, Chromium, or Edge is required. Set VIDEO_WORKFLOW_BROWSER_PATH to its executable.");
  if (!['draft', 'medium', 'high'].includes(quality)) throw new Error("quality must be draft, medium, or high");
  prepareGsap(projectRoot);

  const fps = Number(source.render.fps);
  const width = Number(source.render.width);
  const height = Number(source.render.height);
  const frameCount = Math.max(1, Math.ceil(verification.duration * fps));
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-workflow-frames-"));
  const { server, url } = await startServer(projectRoot);
  let browser;
  const pageErrors = [];
  try {
    browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"], defaultViewport: { width, height, deviceScaleFactor: 1 } });
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForFunction(() => window.__VIDEO_READY === true, { timeout: 30_000 });
    for (let frame = 0; frame < frameCount; frame += 1) {
      const time = Math.min(verification.duration, frame / fps);
      await page.evaluate(async (seconds) => window.__seekVideo(seconds), time);
      const framePath = path.join(framesDir, `frame-${String(frame).padStart(6, "0")}.png`);
      await page.screenshot({ path: framePath, type: "png", omitBackground: false });
      if (frame === 0 || frame === frameCount - 1 || frame % Math.max(1, Math.floor(frameCount / 10)) === 0) {
        process.stdout.write(`Rendered frame ${frame + 1}/${frameCount}\n`);
      }
    }
    if (pageErrors.length) throw new Error(`Browser render errors:\n- ${pageErrors.join("\n- ")}`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const renderDir = path.join(projectRoot, "renders");
  fs.mkdirSync(renderDir, { recursive: true });
  const output = path.join(renderDir, "final.mp4");
  const masterAudio = path.join(projectRoot, "assets", "narration-master.wav");
  const settings = {
    draft: { crf: "28", preset: "veryfast" },
    medium: { crf: "22", preset: "medium" },
    high: { crf: "18", preset: "slow" },
  }[quality];
  try {
    run(
      ffmpeg,
      [
        "-y", "-v", "error",
        "-framerate", String(fps), "-start_number", "0", "-i", path.join(framesDir, "frame-%06d.png"),
        "-i", masterAudio,
        "-t", String(verification.duration),
        "-c:v", "libx264", "-preset", settings.preset, "-crf", settings.crf, "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "1",
        "-movflags", "+faststart", output,
      ],
      "encode final video",
      { stdio: "inherit" },
    );
  } finally {
    fs.rmSync(framesDir, { recursive: true, force: true });
  }
  const outputDuration = probeDuration(ffprobe, output);
  if (Math.abs(outputDuration - verification.duration) > Math.max(0.08, 1 / fps + 0.02)) throw new Error(`Rendered duration drift: expected ${verification.duration}s, got ${outputDuration}s`);
  const report = { renderer: "chromium-frames", quality, browser: path.basename(browserPath), fps, width, height, frames: frameCount, duration: outputDuration, verification };
  writeJson(path.join(renderDir, "render-report.json"), report);
  return { output, verification, report };
}
