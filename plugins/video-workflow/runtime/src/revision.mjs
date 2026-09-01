import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "./project.mjs";
import { loadProject } from "./source.mjs";
import { readJson, writeJson } from "./utils.mjs";

function nextRevision(projectRoot) {
  const root = path.join(projectRoot, "revisions");
  fs.mkdirSync(root, { recursive: true });
  const values = fs.readdirSync(root).map((name) => Number.parseInt(name.match(/^(\d+)/u)?.[1], 10)).filter(Number.isFinite);
  return Math.max(0, ...values) + 1;
}

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, { recursive: true });
}

export function reviseProject(projectArg, { scriptPath, planPath = null, dataPath = null, brandPath = null, title = null, type = "auto", language = "auto" }) {
  const project = loadProject(projectArg);
  const { projectRoot, source } = project;
  const revision = nextRevision(projectRoot);
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const archive = path.join(projectRoot, "revisions", `${String(revision).padStart(4, "0")}-${stamp}`);
  fs.mkdirSync(archive, { recursive: true });
  for (const relative of ["script.locked.txt", "brief.locked.txt", "content-plan.locked.json", "direction-plan.locked.json", "sound-plan.locked.json", "cover-plan.locked.json", "story-source.json", "story.js", "meta.json", "PROJECT.md", "index.html", "assets", ".media", "deliverables", "renders"]) {
    copyIfExists(path.join(projectRoot, relative), path.join(archive, relative));
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "video-workflow-revision-"));
  const temporaryProject = path.join(temporaryRoot, source.project.slug);
  const musicFile = source.audio.music?.file ? path.join(projectRoot, source.audio.music.file) : null;
  let pronunciationPath = null;
  if (source.audio.pronunciationReplacements?.length) {
    pronunciationPath = path.join(temporaryRoot, "pronunciation.json");
    writeJson(pronunciationPath, source.audio.pronunciationReplacements);
  }
  let sfxManifestPath = null;
  if (source.audio.sfx?.length) {
    sfxManifestPath = path.join(temporaryRoot, "sfx.json");
    writeJson(sfxManifestPath, source.audio.sfx.map((item) => ({ ...item, file: path.join(projectRoot, item.file) })));
  }
  try {
    createProject({
      scriptPath,
      outputDir: temporaryProject,
      slug: source.project.slug,
      title: title || source.project.title,
      type,
      format: source.project.format,
      theme: source.project.theme,
      brief: source.brief?.lockedFile ? fs.readFileSync(path.join(projectRoot, source.brief.lockedFile), "utf8").trim() : null,
      planPath,
      dataPath,
      brandPath,
      language,
      platform: source.project.platform || "generic",
      voice: source.audio.voice,
      speed: source.audio.speed,
      musicPath: musicFile,
      sfxManifestPath,
      pronunciationPath,
      soundDesign: source.audio.soundDesign || "subtle",
      continuousNarration: source.audio.continuousNarration !== false,
      cacheMaxMb: source.render.cacheMaxMb || 1024,
    });
    for (const relative of ["script.locked.txt", "brief.locked.txt", "content-plan.locked.json", "direction-plan.locked.json", "sound-plan.locked.json", "cover-plan.locked.json", "story-source.json", "story.js", "meta.json", "PROJECT.md", "index.html", "assets", ".media", "deliverables", "renders"]) {
      const destination = path.join(projectRoot, relative);
      if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
      copyIfExists(path.join(temporaryProject, relative), destination);
    }
    const metaPath = path.join(projectRoot, "meta.json");
    const meta = readJson(metaPath);
    writeJson(metaPath, { ...meta, revision, revisedAt: new Date().toISOString(), previousRevision: path.relative(projectRoot, archive) });
  } catch (error) {
    throw new Error(`Revision failed; the existing project is unchanged and archived at ${archive}: ${error.message}`);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
  return { projectRoot, revision, archive };
}
