import fs from "node:fs";
import path from "node:path";

function cacheRoot(projectRoot) {
  return path.join(path.resolve(projectRoot), ".media", "cache");
}

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target, output);
    else if (entry.isFile()) output.push({ path: target, size: fs.statSync(target).size, mtimeMs: fs.statSync(target).mtimeMs });
  }
  return output;
}

export function cacheStats(projectArg) {
  const projectRoot = path.resolve(projectArg);
  const root = cacheRoot(projectRoot);
  const files = walk(root);
  const bytes = files.reduce((sum, item) => sum + item.size, 0);
  const byExtension = {};
  for (const item of files) {
    const extension = path.extname(item.path).toLowerCase() || "other";
    byExtension[extension] = (byExtension[extension] || 0) + item.size;
  }
  return { root, files: files.length, bytes, megabytes: Number((bytes / 1024 / 1024).toFixed(2)), byExtension };
}

export function cleanCache(projectArg) {
  const projectRoot = path.resolve(projectArg);
  const root = cacheRoot(projectRoot);
  const before = cacheStats(projectRoot);
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  return { removedFiles: before.files, removedBytes: before.bytes, removedMegabytes: before.megabytes, root };
}

function cacheUnits(root) {
  if (!fs.existsSync(root)) return [];
  const entries = [];
  for (const child of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, child.name);
    if (child.isDirectory() && child.name === "frames") {
      for (const format of fs.readdirSync(target, { withFileTypes: true })) {
        const formatRoot = path.join(target, format.name);
        if (!format.isDirectory()) continue;
        for (const scene of fs.readdirSync(formatRoot, { withFileTypes: true })) {
          const sceneRoot = path.join(formatRoot, scene.name);
          if (!scene.isDirectory()) continue;
          const files = walk(sceneRoot);
          entries.push({ target: sceneRoot, bytes: files.reduce((sum, item) => sum + item.size, 0), mtimeMs: Math.max(fs.statSync(sceneRoot).mtimeMs, ...files.map((item) => item.mtimeMs)) });
        }
      }
      continue;
    }
    const files = child.isDirectory() ? walk(target) : [{ path: target, size: fs.statSync(target).size, mtimeMs: fs.statSync(target).mtimeMs }];
    entries.push({ target, bytes: files.reduce((sum, item) => sum + item.size, 0), mtimeMs: Math.max(fs.statSync(target).mtimeMs, ...files.map((item) => item.mtimeMs)) });
  }
  return entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

export function enforceCacheLimit(projectArg, maximumMegabytes = 1024) {
  const projectRoot = path.resolve(projectArg);
  const root = cacheRoot(projectRoot);
  const maximumBytes = Math.max(32, Number(maximumMegabytes) || 1024) * 1024 * 1024;
  let stats = cacheStats(projectRoot);
  const removed = [];
  for (const entry of cacheUnits(root)) {
    if (stats.bytes <= maximumBytes) break;
    fs.rmSync(entry.target, { recursive: true, force: true });
    removed.push({ path: path.relative(projectRoot, entry.target), bytes: entry.bytes });
    stats = cacheStats(projectRoot);
  }
  return { maximumMegabytes: Number(maximumMegabytes), removed, stats };
}
