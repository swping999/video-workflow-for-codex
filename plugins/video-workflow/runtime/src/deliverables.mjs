import fs from "node:fs";
import path from "node:path";
import { timingTokens } from "./language.mjs";
import { writeJson } from "./utils.mjs";

function clock(seconds, decimal = ",") {
  const milliseconds = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${decimal}${String(millis).padStart(3, "0")}`;
}

export function estimateWordTiming(text, duration, language) {
  const tokens = timingTokens(text, language);
  if (!tokens.length) return [];
  const weights = tokens.map((token) => Math.max(1, [...token].length));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  return tokens.map((token, index) => {
    const start = cursor;
    cursor += duration * (weights[index] / total);
    return { text: token, start: Number(start.toFixed(6)), end: Number(cursor.toFixed(6)), estimated: true };
  });
}

function subtitleEntries(story) {
  const entries = [];
  for (const scene of story.scenes) {
    for (const [index, cue] of scene.voice.cues.entries()) {
      const start = scene.voice.start + cue.at;
      const next = scene.voice.cues[index + 1];
      const end = scene.voice.start + (next ? next.at : scene.voice.duration);
      entries.push({
        sceneId: scene.id,
        text: cue.text,
        start: Number(start.toFixed(6)),
        end: Number(end.toFixed(6)),
        words: (cue.words || []).map((word) => ({ ...word, start: Number((start + word.start).toFixed(6)), end: Number((start + word.end).toFixed(6)) })),
      });
    }
  }
  return entries;
}

function storyboardHtml(source, story) {
  const cards = story.scenes.map((scene, index) => `<article><div class="number">${String(index + 1).padStart(2, "0")}</div><div><b>${escapeHtml(scene.title)}</b><small>${escapeHtml(scene.layout)} · ${scene.duration.toFixed(2)}s</small><p>${scene.voice.cues.map((cue) => escapeHtml(cue.text)).join(" ")}</p></div></article>`).join("");
  return `<!doctype html><html lang="${escapeHtml(source.copy.language)}"><meta charset="utf-8"><title>${escapeHtml(source.project.title)} Storyboard</title><style>body{max-width:1100px;margin:40px auto;padding:0 24px;background:#f5f2ea;color:#191919;font:16px/1.5 system-ui}h1{font-size:38px}article{display:grid;grid-template-columns:70px 1fr;gap:20px;margin:18px 0;padding:24px;border:2px solid #222;border-radius:18px;background:#fff}.number{font-size:30px;font-weight:900;color:#3159c9}b{display:block;font-size:22px}small{color:#766}p{margin-bottom:0}</style><h1>${escapeHtml(source.project.title)}</h1><p>${escapeHtml(source.project.type)} · ${escapeHtml(source.project.format)} · ${escapeHtml(source.project.theme)} · ${escapeHtml(source.copy.language)}</p>${cards}</html>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

export function writeDeliverables(projectRoot, source, story) {
  const directory = path.join(projectRoot, "deliverables");
  fs.mkdirSync(directory, { recursive: true });
  const entries = subtitleEntries(story);
  const srt = entries.map((entry, index) => `${index + 1}\n${clock(entry.start)} --> ${clock(entry.end)}\n${entry.text}\n`).join("\n");
  const vtt = `WEBVTT\n\n${entries.map((entry) => `${clock(entry.start, ".")} --> ${clock(entry.end, ".")}\n${entry.text}\n`).join("\n")}`;
  fs.writeFileSync(path.join(directory, "captions.srt"), srt);
  fs.writeFileSync(path.join(directory, "captions.vtt"), vtt);
  writeJson(path.join(directory, "word-timestamps.json"), { schemaVersion: 1, language: source.copy.language, entries });
  writeJson(path.join(directory, "storyboard.json"), {
    schemaVersion: 1,
    project: source.project,
    scenes: story.scenes.map((scene) => ({ id: scene.id, title: scene.title, layout: scene.layout, start: scene.start, duration: scene.duration, visual: scene.visual.model, narration: scene.voice.cues.map((cue) => cue.text).join("") })),
  });
  fs.writeFileSync(path.join(directory, "storyboard.html"), storyboardHtml(source, story));
  const factCheck = {
    schemaVersion: 1,
    status: source.content?.claims?.every((claim) => claim.verified || !["metric", "testimonial", "capability"].includes(claim.kind)) ? "ready" : "review",
    sources: source.content?.sources || [],
    claims: source.content?.claims || [],
    charts: story.scenes.filter((scene) => scene.visual.model?.kind?.endsWith("-chart")).map((scene) => ({ sceneId: scene.id, sourceId: scene.visual.model.sourceId || null, source: scene.visual.model.source || null, illustrative: Boolean(scene.visual.model.illustrative) })),
  };
  writeJson(path.join(directory, "fact-check.json"), factCheck);
  const factMarkdown = [`# Fact-check checklist`, "", `Status: ${factCheck.status}`, "", "## Sources", "", ...(factCheck.sources.length ? factCheck.sources.map((source) => `- [${source.id}] ${source.title}${source.url ? ` — ${source.url}` : ""}`) : ["- No external sources supplied." ]), "", "## Claims", "", ...(factCheck.claims.length ? factCheck.claims.map((claim) => `- [${claim.verified ? "x" : " "}] ${claim.text}${claim.sourceId ? ` (${claim.sourceId})` : ""}`) : ["- No explicit claims supplied."]), ""].join("\n");
  fs.writeFileSync(path.join(directory, "fact-check.md"), factMarkdown);
  return { directory, entries, factCheck };
}
