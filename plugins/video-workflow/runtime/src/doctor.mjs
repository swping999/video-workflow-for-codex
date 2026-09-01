import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mediaBinaries } from "./media-tools.mjs";
import { findBrowserExecutable } from "./render.mjs";
import { systemProviderAvailable } from "./tts.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function doctor() {
  const failures = [];
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor < 20) failures.push(`Node.js 20+ is required; found ${process.versions.node}`);
  if (!fs.existsSync(path.join(runtimeRoot, "templates", "episode", "index.html"))) failures.push("missing runtime/templates/episode/index.html");
  try { mediaBinaries(); } catch (error) { failures.push(error.message); }
  if (!fs.existsSync(path.join(runtimeRoot, "node_modules", "puppeteer-core", "package.json"))) failures.push("Puppeteer Core is not installed; run npm ci in the plugin runtime directory");
  const browser = findBrowserExecutable();
  if (!browser) failures.push("Chrome, Chromium, or Edge is required; set VIDEO_WORKFLOW_BROWSER_PATH if it is installed in a custom location");
  if (!systemProviderAvailable()) failures.push("Free system TTS is required for one-command builds; install espeak-ng on Linux or use the staged provider=files path");
  if (failures.length) throw new Error(`Environment check failed:\n- ${failures.join("\n- ")}`);
  return { node: process.versions.node, runtimeRoot, browser, systemTts: true };
}
