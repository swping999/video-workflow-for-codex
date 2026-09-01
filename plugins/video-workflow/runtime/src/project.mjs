import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildContentPlan,
  contentTypes,
  inferContentTypeDetailed,
  validateContentPlan,
} from "./content-schema.mjs";
import {
  defaultPronunciations,
  fontFamilyFor,
  resolveLanguage,
  splitSubtitleCues,
} from "./language.mjs";
import {
  canonicalParagraph,
  paragraphs,
  readJson,
  sha256File,
  sha256Text,
  writeJson,
} from "./utils.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = path.join(runtimeRoot, "templates", "episode");

export { contentTypes };

export const formats = {
  landscape: { width: 1920, height: 1080, aspect: "16:9" },
  portrait: { width: 1080, height: 1920, aspect: "9:16" },
  social: { width: 1080, height: 1350, aspect: "4:5" },
};

export const themes = ["whiteboard", "editorial", "tech", "product"];

export const platforms = {
  generic: {
    label: "Generic",
    safeArea: { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 },
    coverSafeArea: { top: 0.12, right: 0.08, bottom: 0.16, left: 0.08 },
  },
  douyin: {
    label: "Douyin",
    safeArea: { top: 0.09, right: 0.16, bottom: 0.20, left: 0.07 },
    coverSafeArea: { top: 0.18, right: 0.10, bottom: 0.22, left: 0.10 },
  },
  reels: {
    label: "Instagram Reels",
    safeArea: { top: 0.10, right: 0.08, bottom: 0.18, left: 0.08 },
    coverSafeArea: { top: 0.18, right: 0.10, bottom: 0.20, left: 0.10 },
  },
  shorts: {
    label: "YouTube Shorts",
    safeArea: { top: 0.10, right: 0.15, bottom: 0.18, left: 0.07 },
    coverSafeArea: { top: 0.18, right: 0.10, bottom: 0.20, left: 0.10 },
  },
  xiaohongshu: {
    label: "Xiaohongshu",
    safeArea: { top: 0.09, right: 0.08, bottom: 0.18, left: 0.08 },
    coverSafeArea: { top: 0.18, right: 0.10, bottom: 0.20, left: 0.10 },
  },
};

const themeSystems = {
  whiteboard: {
    style: "warm hand-drawn explanatory illustration on lightly textured paper",
    palette: ["#F8F0DE", "#28241E", "#E89436", "#2565C7", "#F4C85B"],
    typography: { display: '"Kaiti SC","STKaiti","KaiTi",serif', body: '"PingFang SC","Microsoft YaHei",sans-serif' },
    iconStyle: "ink-outline",
    borderStyle: "hand-drawn",
    texture: "paper-grain",
    transition: "draw-and-slide",
    motion: "gentle-spring",
    captions: "ink-card",
    musicTendency: "light-acoustic",
  },
  editorial: {
    style: "clean editorial infographic with bold type and restrained geometric accents",
    palette: ["#F4F0E8", "#171717", "#F68B36", "#3159C9", "#D8D0C2"],
    typography: { display: 'Inter,"Helvetica Neue",sans-serif', body: 'Inter,"Helvetica Neue",sans-serif' },
    iconStyle: "geometric-line",
    borderStyle: "fine-rule",
    texture: "subtle-newsprint",
    transition: "editorial-wipe",
    motion: "crisp-ease",
    captions: "high-contrast-bar",
    musicTendency: "minimal-percussion",
  },
  tech: {
    style: "high-contrast technology editorial graphic with luminous blue accents",
    palette: ["#071428", "#EDF4FF", "#4B8DFF", "#21D4B4", "#FF9F45"],
    typography: { display: 'Inter,"SF Pro Display",sans-serif', body: 'Inter,"SF Pro Text",sans-serif' },
    iconStyle: "luminous-grid",
    borderStyle: "neon-hairline",
    texture: "digital-grid",
    transition: "scan-and-focus",
    motion: "precise-kinetic",
    captions: "glass-panel",
    musicTendency: "electronic-pulse",
  },
  product: {
    style: "polished product-launch composition with clear evidence, generous whitespace, and brand-led hierarchy",
    palette: ["#F8F9FC", "#111827", "#2563EB", "#F97316", "#DCE6F7"],
    typography: { display: 'Inter,"SF Pro Display",sans-serif', body: 'Inter,"SF Pro Text",sans-serif' },
    iconStyle: "product-glyph",
    borderStyle: "soft-card",
    texture: "clean-gradient",
    transition: "product-reveal",
    motion: "smooth-premium",
    captions: "brand-pill",
    musicTendency: "modern-corporate",
  },
};

const assetKeys = new Set(["asset", "image", "video", "screenshot", "logo"]);
const mediaExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".mov", ".webm", ".m4v"]);

function assertChoice(name, value, choices) {
  if (!choices.includes(value)) throw new Error(`${name} must be one of: ${choices.join(", ")}`);
  return value;
}

export function inferContentType(text, paragraphCount) {
  return inferContentTypeDetailed(text, paragraphCount).primary;
}

function importLocalFile(rawValue, sourceDirectory, target, bucket) {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  const value = String(rawValue);
  if (/^(?:https?:|data:)/iu.test(value)) throw new Error(`Remote media is not fetched automatically: ${value}. Download it locally for a deterministic build.`);
  const resolved = path.isAbsolute(value) ? value : path.resolve(sourceDirectory, value);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Media file not found: ${resolved}`);
  const extension = path.extname(resolved).toLowerCase();
  if (bucket === "imported" && !mediaExtensions.has(extension)) throw new Error(`Unsupported media type: ${extension || "none"}`);
  const name = `${sha256File(resolved).slice(0, 12)}-${path.basename(resolved).replace(/[^A-Za-z0-9._-]+/gu, "-")}`;
  const relative = path.posix.join("assets", bucket, name);
  const destination = path.join(target, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(resolved, destination);
  return relative;
}

function materializeAssets(value, sourceDirectory, target, key = "") {
  if (Array.isArray(value)) return value.map((item) => materializeAssets(item, sourceDirectory, target, key));
  if (!value || typeof value !== "object") {
    if (assetKeys.has(key) && value) return importLocalFile(value, sourceDirectory, target, "imported");
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, materializeAssets(child, sourceDirectory, target, childKey)]));
}

function loadPronunciation(filePath) {
  if (!filePath) return [];
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Pronunciation dictionary not found: ${resolved}`);
  const parsed = readJson(resolved);
  const items = Array.isArray(parsed) ? parsed : parsed.replacements;
  if (!Array.isArray(items)) throw new Error("Pronunciation dictionary must be an array or { replacements: [] }");
  return items.map((item) => ({ match: String(item.match || ""), spoken: String(item.spoken || "") })).filter((item) => item.match);
}

function materializeAudioMedia(contentPlan, target, musicPath, sfxManifestPath) {
  const sourceDirectory = contentPlan.sourceDirectory;
  let music = musicPath || contentPlan.media?.music || null;
  if (music && typeof music === "object") music = music.file;
  const musicFile = music ? importLocalFile(music, sourceDirectory, target, "audio") : null;
  let sfx = Array.isArray(contentPlan.media?.sfx) ? contentPlan.media.sfx : [];
  let sfxDirectory = sourceDirectory;
  if (sfxManifestPath) {
    const resolvedManifest = path.resolve(sfxManifestPath);
    const manifest = readJson(resolvedManifest);
    sfx = Array.isArray(manifest) ? manifest : manifest.items || [];
    sfxDirectory = path.dirname(resolvedManifest);
  }
  return {
    music: musicFile ? { file: musicFile, volume: Number(contentPlan.media?.music?.volume ?? 0.15), ducking: Number(contentPlan.media?.music?.ducking ?? 0.28) } : null,
    sfx: sfx.map((item) => ({
      ...item,
      file: importLocalFile(item.file, sfxDirectory, target, "audio"),
      volume: Number(item.volume ?? 0.5),
    })),
  };
}

function cleanStoredPlan(plan) {
  const { sourceDirectory: _sourceDirectory, brandDirectory: _brandDirectory, ...stored } = plan;
  return stored;
}

export function createProject({
  scriptPath,
  outputDir,
  slug,
  title,
  type = "auto",
  format = "landscape",
  theme = "editorial",
  brief = null,
  planPath = null,
  dataPath = null,
  brandPath = null,
  language = "auto",
  platform = "generic",
  voice = "auto",
  speed = 1,
  musicPath = null,
  sfxManifestPath = null,
  pronunciationPath = null,
}) {
  const resolvedScript = path.resolve(scriptPath);
  if (!fs.existsSync(resolvedScript)) throw new Error(`Script not found: ${resolvedScript}`);
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/u.test(slug)) throw new Error("Slug must contain 2-63 lowercase letters, digits, or hyphens");
  assertChoice("type", type, contentTypes);
  assertChoice("format", format, Object.keys(formats));
  assertChoice("theme", theme, themes);
  assertChoice("platform", platform, Object.keys(platforms));
  if (!Number.isFinite(Number(speed)) || Number(speed) < 0.5 || Number(speed) > 2) throw new Error("speed must be between 0.5 and 2");

  const target = path.resolve(outputDir);
  if (fs.existsSync(target)) throw new Error(`Refusing to overwrite existing project: ${target}`);
  const lockedText = fs.readFileSync(resolvedScript, "utf8").replace(/\r\n?/g, "\n").trim();
  const lockedBrief = brief ? String(brief).replace(/\r\n?/g, "\n").trim() : null;
  const lockedParagraphs = paragraphs(lockedText);
  if (!lockedParagraphs.length) throw new Error("The script is empty");
  const resolvedLanguage = resolveLanguage(language, lockedText);
  const contentPlan = validateContentPlan(buildContentPlan({
    scriptText: lockedText,
    paragraphs: lockedParagraphs,
    requestedType: type,
    planPath,
    dataPath,
    brandPath,
    language: resolvedLanguage,
  }));

  fs.cpSync(templateRoot, target, { recursive: true });
  for (const relative of ["assets", "assets/imported", "assets/audio", "renders", "deliverables", ".media/raw-cues", ".media/generated-images", ".media/cache"]) {
    fs.mkdirSync(path.join(target, relative), { recursive: true });
  }

  const materializedPlan = {
    ...contentPlan,
    brand: materializeAssets(contentPlan.brand, contentPlan.brandDirectory || contentPlan.sourceDirectory, target),
    scenes: contentPlan.scenes.map((scene) => materializeAssets(scene, contentPlan.sourceDirectory, target)),
  };
  const media = materializeAudioMedia(contentPlan, target, musicPath, sfxManifestPath);
  const storedPlan = cleanStoredPlan(materializedPlan);
  const planText = `${JSON.stringify(storedPlan, null, 2)}\n`;
  const systemTheme = themeSystems[theme];
  const projectTitle = title || contentPlan.title || String(splitSubtitleCues(lockedParagraphs[0], resolvedLanguage)[0] || slug).replace(/[。！？?!；;：:]$/u, "");
  const pronunciations = [
    ...defaultPronunciations(resolvedLanguage),
    ...contentPlan.pronunciation,
    ...loadPronunciation(pronunciationPath),
  ];

  const source = {
    schemaVersion: 3,
    project: {
      slug,
      title: projectTitle,
      type: contentPlan.type,
      secondaryType: contentPlan.classification.secondary,
      classificationConfidence: contentPlan.classification.confidence,
      format,
      platform,
      theme,
      language: resolvedLanguage,
      createdAt: new Date().toISOString(),
    },
    copy: {
      source: lockedBrief ? "codex-generated-from-brief" : "user-provided",
      status: "locked",
      language: resolvedLanguage,
      subtitlePolicy: "verbatim",
      lockedFile: "script.locked.txt",
      lockedSha256: sha256Text(lockedParagraphs.map(canonicalParagraph).join("\n")),
      visualNumbersAreNeverSpoken: true,
    },
    content: {
      source: contentPlan.source,
      status: "locked",
      schemaVersion: contentPlan.schemaVersion,
      lockedFile: "content-plan.locked.json",
      lockedSha256: sha256Text(planText),
      classification: contentPlan.classification,
      sources: storedPlan.sources,
      claims: storedPlan.claims,
    },
    ...(lockedBrief ? {
      brief: {
        source: "user-provided",
        status: "locked",
        lockedFile: "brief.locked.txt",
        lockedSha256: sha256Text(lockedBrief),
      },
    } : {}),
    audio: {
      provider: "system",
      voice: String(voice || "auto"),
      speed: Number(speed),
      prosody: { rate: Number(speed), pitch: 0, emphasis: "moderate" },
      sentenceGap: 0.14,
      sceneLead: 0.12,
      sceneTail: 0.12,
      finalTail: 0.35,
      targetLufs: -16,
      targetTruePeak: -1.5,
      pronunciationReplacements: pronunciations,
      music: media.music,
      sfx: media.sfx,
    },
    visual: {
      ...systemTheme,
      languageFontFamily: fontFamilyFor(resolvedLanguage),
      presenter: { mode: "none", reference: null, description: null },
      brand: storedPlan.brand,
      requireSceneAssets: false,
      assetPolicy: "local-deterministic",
    },
    render: {
      ...formats[format],
      fps: 30,
      publish: false,
      renderer: "chromium-frames",
      platform: platforms[platform],
      outputs: [format],
      captionFiles: ["srt", "vtt"],
      cover: true,
    },
    scenes: lockedParagraphs.map((paragraph, index) => {
      const planScene = storedPlan.scenes[index];
      const cues = splitSubtitleCues(paragraph, resolvedLanguage);
      const visualKind = planScene.visual.kind;
      return {
        id: `scene-${String(index + 1).padStart(2, "0")}`,
        paragraph: index + 1,
        kind: index === 0 ? "intro" : index === lockedParagraphs.length - 1 ? "summary" : "content",
        layout: visualKind,
        contentType: planScene.contentType || contentPlan.type,
        eyebrow: `${(planScene.contentType || contentPlan.type).toUpperCase()} / ${String(index + 1).padStart(2, "0")}`,
        chapter: planScene.chapter || (index === 0 ? "START" : index === lockedParagraphs.length - 1 ? "SUMMARY" : `SCENE ${String(index + 1).padStart(2, "0")}`),
        title: planScene.title || cues[0] || paragraph,
        cues,
        visual: {
          action: `compose a ${visualKind} scene for ${contentPlan.type} content`,
          model: planScene.visual,
          asset: planScene.asset || planScene.visual.asset || null,
          optionalAssetOutput: `assets/scene-visual-${String(index + 1).padStart(2, "0")}.png`,
        },
      };
    }),
  };

  fs.writeFileSync(path.join(target, "script.locked.txt"), `${lockedText}\n`);
  if (lockedBrief) fs.writeFileSync(path.join(target, "brief.locked.txt"), `${lockedBrief}\n`);
  fs.writeFileSync(path.join(target, "content-plan.locked.json"), planText);
  writeJson(path.join(target, "story-source.json"), source);
  writeJson(path.join(target, "meta.json"), {
    id: slug,
    title: source.project.title,
    type: contentPlan.type,
    secondaryType: contentPlan.classification.secondary,
    classificationConfidence: contentPlan.classification.confidence,
    format,
    platform,
    theme,
    language: resolvedLanguage,
    createdAt: source.project.createdAt,
    workflow: "video-workflow@1.0.0",
  });
  fs.writeFileSync(path.join(target, "story.js"), "window.VIDEO_WORKFLOW_STORY = {\"duration\":1,\"copy\":{},\"audio\":{},\"render\":{},\"scenes\":[]};\n");
  fs.writeFileSync(path.join(target, "PROJECT.md"), `# ${source.project.title}\n\nGenerated by Video Workflow. Narration and captions are locked. Edit structured visual fields through a content plan, then rebuild this isolated project.\n`);
  fs.writeFileSync(path.join(target, ".gitignore"), ".media/raw-cues/\n.media/balanced-cues/\n.media/scene-concats/\n.media/render-frames/\n.media/cache/\nrenders/\nrevisions/\nassets/voice-*.wav\nassets/narration-master.wav\nassets/audio-master.wav\nassets/voice-manifest.json\n");
  return { target, source };
}
