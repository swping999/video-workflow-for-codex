import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export function parseArgs(argv) {
  const values = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      values._.push(item);
      continue;
    }
    const [rawKey, inlineValue] = item.slice(2).split("=", 2);
    const next = argv[index + 1];
    if (inlineValue !== undefined) values[rawKey] = inlineValue;
    else if (next && !next.startsWith("--")) {
      values[rawKey] = next;
      index += 1;
    } else values[rawKey] = true;
  }
  return values;
}

export function requireArg(args, name) {
  const value = args[name];
  if (!value || value === true) throw new Error(`Missing --${name}`);
  return String(value);
}

export function normalizeText(value) {
  return String(value).replace(/\r\n?/g, "\n").trim();
}

export function paragraphs(value) {
  return normalizeText(value).split(/\n\s*\n/u).map((item) => item.trim()).filter(Boolean);
}

export function canonicalParagraph(value) {
  return normalizeText(value).replace(/\n+/g, "");
}

export function splitCues(value) {
  const flat = canonicalParagraph(value);
  const cues = [];
  let cursor = "";
  for (const char of flat) {
    cursor += char;
    if (/[。！？?!；;：:]/u.test(char)) {
      cues.push(cursor);
      cursor = "";
    }
  }
  if (cursor.trim()) cues.push(cursor);
  return cues.map((item) => item.trim()).filter(Boolean);
}

export function shortTitle(value, limit = 24) {
  const clean = String(value).replace(/[。！？?!；;：:]$/u, "").trim();
  return [...clean].length > limit ? `${[...clean].slice(0, limit).join("")}…` : clean;
}

export function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function run(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
    env: { ...process.env, ...(options.env || {}) },
  });
  if (result.status !== 0) {
    const details = result.stderr || result.stdout || result.error?.message || "unknown error";
    throw new Error(`${label} failed:\n${details}`);
  }
  return result;
}

export function existingFile(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}
