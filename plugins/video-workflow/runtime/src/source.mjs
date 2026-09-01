import fs from "node:fs";
import path from "node:path";
import { validateContentPlan } from "./content-schema.mjs";
import { validateCoverPlan } from "./cover-plan.mjs";
import { validateDirectionPlan } from "./direction.mjs";
import { supportedLanguages } from "./language.mjs";
import { canonicalParagraph, paragraphs, readJson, sha256Text } from "./utils.mjs";

export function spokenText(scene) {
  return scene.cues.join("");
}

export function loadProject(projectArg) {
  const projectRoot = path.resolve(projectArg);
  const sourcePath = path.join(projectRoot, "story-source.json");
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing story-source.json in ${projectRoot}`);
  const source = readJson(sourcePath);
  const lockedPath = path.resolve(projectRoot, source.copy?.lockedFile || "script.locked.txt");
  if (lockedPath !== projectRoot && !lockedPath.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error("Locked script path must stay inside the project directory");
  }
  if (!fs.existsSync(lockedPath)) throw new Error(`Missing locked script: ${lockedPath}`);
  const lockedText = fs.readFileSync(lockedPath, "utf8").replace(/\r\n?/g, "\n").trim();
  return { projectRoot, sourcePath, source, lockedPath, lockedText };
}

function insideProject(projectRoot, relativePath) {
  const resolved = path.resolve(projectRoot, relativePath);
  return resolved === projectRoot || resolved.startsWith(`${projectRoot}${path.sep}`);
}

function collectAssetPaths(value, key = "", output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectAssetPaths(item, key, output);
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) collectAssetPaths(child, childKey, output);
  } else if (["asset", "image", "video", "screenshot", "logo"].includes(key) && typeof value === "string" && value) {
    output.push(value);
  }
  return output;
}

function numericMentions(text) {
  return (String(text).match(/-?\d+(?:\.\d+)?/gu) || []).map(Number).filter(Number.isFinite);
}

export function validateLockedSource(projectArg) {
  const project = typeof projectArg === "string" ? loadProject(projectArg) : projectArg;
  const { source, lockedText } = project;
  const failures = [];
  const lockedParagraphs = paragraphs(lockedText);

  if (![2, 3, 4].includes(source.schemaVersion)) failures.push("unsupported story-source schema");
  if (source.copy?.status !== "locked") failures.push("copy.status must be locked");
  if (source.copy?.subtitlePolicy !== "verbatim") failures.push("subtitlePolicy must be verbatim");
  if (!supportedLanguages[source.copy?.language]) failures.push(`unsupported project language: ${source.copy?.language}`);
  const lockedHash = sha256Text(lockedParagraphs.map(canonicalParagraph).join("\n"));
  if (source.copy?.lockedSha256 !== lockedHash) failures.push("locked script hash differs from project provenance");
  if (source.copy?.source === "codex-generated-from-brief") {
    const briefPath = path.resolve(project.projectRoot, source.brief?.lockedFile || "brief.locked.txt");
    if (briefPath !== project.projectRoot && !briefPath.startsWith(`${project.projectRoot}${path.sep}`)) {
      failures.push("locked brief path must stay inside the project directory");
    } else if (!fs.existsSync(briefPath)) {
      failures.push("locked brief is missing");
    } else {
      const briefText = fs.readFileSync(briefPath, "utf8").replace(/\r\n?/g, "\n").trim();
      if (!briefText || source.brief?.lockedSha256 !== sha256Text(briefText)) failures.push("locked brief hash differs from project provenance");
    }
  }
  if (source.schemaVersion >= 3) {
    const planPath = path.resolve(project.projectRoot, source.content?.lockedFile || "content-plan.locked.json");
    if (!insideProject(project.projectRoot, source.content?.lockedFile || "content-plan.locked.json")) {
      failures.push("locked content-plan path must stay inside the project directory");
    } else if (!fs.existsSync(planPath)) {
      failures.push("locked content plan is missing");
    } else {
      const planText = fs.readFileSync(planPath, "utf8");
      if (source.content?.lockedSha256 !== sha256Text(planText)) failures.push("locked content-plan hash differs from project provenance");
      try {
        const plan = JSON.parse(planText);
        validateContentPlan(plan);
        if (plan.type !== source.project?.type) failures.push("content-plan type differs from story project type");
        if (plan.scenes?.length !== source.scenes?.length) failures.push("content-plan scene count differs from story scene count");
      } catch (error) {
        failures.push(`invalid locked content plan: ${error.message}`);
      }
    }
  }
  if (source.schemaVersion >= 4) {
    for (const [label, entry, validator] of [
      ["direction plan", source.direction, (value) => validateDirectionPlan(value, source.scenes?.length || 0)],
      ["sound plan", source.sound, (value) => {
        if (value?.schemaVersion !== 1 || !["off", "subtle", "full"].includes(value?.mode) || !Array.isArray(value?.cues)) throw new Error("invalid sound-plan schema");
      }],
      ["cover plan", source.cover, validateCoverPlan],
    ]) {
      const relative = entry?.lockedFile;
      if (!relative || !insideProject(project.projectRoot, relative)) {
        failures.push(`${label} path must stay inside the project directory`);
        continue;
      }
      const filePath = path.resolve(project.projectRoot, relative);
      if (!fs.existsSync(filePath)) {
        failures.push(`locked ${label} is missing`);
        continue;
      }
      const text = fs.readFileSync(filePath, "utf8");
      if (entry.lockedSha256 !== sha256Text(text)) failures.push(`locked ${label} hash differs from project provenance`);
      try { validator(JSON.parse(text)); } catch (error) { failures.push(`invalid locked ${label}: ${error.message}`); }
    }
  }
  if (!Array.isArray(source.scenes) || source.scenes.length === 0) failures.push("no scenes found");
  if (lockedParagraphs.length !== source.scenes?.length) {
    failures.push(`locked paragraphs=${lockedParagraphs.length}, scenes=${source.scenes?.length || 0}`);
  }

  for (const asset of collectAssetPaths(source.visual?.brand)) {
    if (!insideProject(project.projectRoot, asset)) failures.push(`brand asset path leaves the project directory: ${asset}`);
    else if (!fs.existsSync(path.resolve(project.projectRoot, asset))) failures.push(`brand asset is missing: ${asset}`);
  }
  for (const audioFile of [source.audio?.music?.file, ...(source.audio?.sfx || []).map((item) => item.file)].filter(Boolean)) {
    if (!insideProject(project.projectRoot, audioFile)) failures.push(`audio asset path leaves the project directory: ${audioFile}`);
    else if (!fs.existsSync(path.resolve(project.projectRoot, audioFile))) failures.push(`audio asset is missing: ${audioFile}`);
  }

  for (const scene of source.scenes || []) {
    const paragraph = lockedParagraphs[scene.paragraph - 1];
    if (!paragraph) {
      failures.push(`${scene.id}: locked paragraph ${scene.paragraph} is missing`);
      continue;
    }
    if (spokenText(scene) !== canonicalParagraph(paragraph)) {
      failures.push(`${scene.id}: cues differ from the locked script`);
    }
    if (scene.cues.some((cue) => cue.includes("️⃣"))) {
      failures.push(`${scene.id}: a visual number emoji leaked into narration`);
    }
    for (const asset of collectAssetPaths(scene.visual)) {
      if (!insideProject(project.projectRoot, asset)) failures.push(`${scene.id}: visual asset path leaves the project directory`);
      else if (!fs.existsSync(path.resolve(project.projectRoot, asset))) failures.push(`${scene.id}: declared visual asset is missing: ${asset}`);
    }
    const model = scene.visual?.model;
    if (source.schemaVersion >= 4 && (!scene.visual?.direction?.focus || !scene.visual?.direction?.motion?.length)) failures.push(`${scene.id}: visual direction is incomplete`);
    if (model?.kind?.endsWith("-chart") && !model.illustrative && !model.sourceId && !model.source) {
      failures.push(`${scene.id}: real chart has no source`);
    }
    if (model?.kind?.endsWith("-chart") && !model.illustrative) {
      const available = [...(model.values || []).map(Number), ...numericMentions((model.labels || []).join(" "))];
      const mentioned = numericMentions(spokenText(scene));
      for (const value of mentioned) if (!available.some((candidate) => Math.abs(candidate - value) < 0.000001)) failures.push(`${scene.id}: narrated number ${value} is absent from chart labels/values`);
    }
    if (model?.kind === "comparison-table" && !model.illustrative && (!Array.isArray(model.subjects) || model.subjects.length !== 2 || !model.dimensions?.length)) {
      failures.push(`${scene.id}: comparison lacks two subjects and shared dimensions`);
    }
  }

  if (failures.length) throw new Error(`Locked-copy validation failed:\n- ${failures.join("\n- ")}`);
  return project;
}
