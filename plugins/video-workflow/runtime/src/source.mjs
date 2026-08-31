import fs from "node:fs";
import path from "node:path";
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

export function validateLockedSource(projectArg) {
  const project = typeof projectArg === "string" ? loadProject(projectArg) : projectArg;
  const { source, lockedText } = project;
  const failures = [];
  const lockedParagraphs = paragraphs(lockedText);

  if (source.schemaVersion !== 2) failures.push("unsupported story-source schema");
  if (source.copy?.status !== "locked") failures.push("copy.status must be locked");
  if (source.copy?.subtitlePolicy !== "verbatim") failures.push("subtitlePolicy must be verbatim");
  const lockedHash = sha256Text(lockedParagraphs.map(canonicalParagraph).join("\n"));
  if (source.copy?.lockedSha256 !== lockedHash) failures.push("locked script hash differs from project provenance");
  if (!Array.isArray(source.scenes) || source.scenes.length === 0) failures.push("no scenes found");
  if (lockedParagraphs.length !== source.scenes?.length) {
    failures.push(`locked paragraphs=${lockedParagraphs.length}, scenes=${source.scenes?.length || 0}`);
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
    if (scene.visual?.asset) {
      const assetPath = path.resolve(project.projectRoot, scene.visual.asset);
      if (assetPath !== project.projectRoot && !assetPath.startsWith(`${project.projectRoot}${path.sep}`)) {
        failures.push(`${scene.id}: visual asset path leaves the project directory`);
      }
    }
  }

  if (failures.length) throw new Error(`Locked-copy validation failed:\n- ${failures.join("\n- ")}`);
  return project;
}
