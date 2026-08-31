import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalParagraph, paragraphs, sha256Text, shortTitle, splitCues, writeJson } from "./utils.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = path.join(runtimeRoot, "templates", "episode");

export const contentTypes = ["auto", "explainer", "listicle", "workflow", "comparison", "promo", "data-story"];
export const formats = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  social: { width: 1080, height: 1350 },
};
export const themes = ["whiteboard", "editorial", "tech", "product"];

const typeLayouts = {
  explainer: ["hero", "concept", "cards", "concept", "summary"],
  listicle: ["hero", "cards", "cards", "cards", "summary"],
  workflow: ["hero", "steps", "steps", "steps", "summary"],
  comparison: ["hero", "split", "split", "split", "summary"],
  promo: ["hero", "showcase", "cards", "showcase", "summary"],
  "data-story": ["hero", "chart", "chart", "cards", "summary"],
};

const themeStyles = {
  whiteboard: "warm hand-drawn editorial illustration on textured paper",
  editorial: "clean editorial infographic with bold type and restrained geometric accents",
  tech: "high-contrast technology editorial graphic with luminous blue accents",
  product: "polished product launch graphic with strong hierarchy and generous whitespace",
};

const heroLabels = {
  explainer: ["核心问题", "概念拆解", "一句话讲懂"],
  listicle: ["清单速览", "逐条展示", "重点总结"],
  workflow: ["步骤拆解", "顺序执行", "结果检查"],
  comparison: ["两侧对比", "差异判断", "适用场景"],
  promo: ["用户痛点", "功能亮点", "效果展示"],
  "data-story": ["数据变化", "趋势解读", "结论提炼"],
};

function assertChoice(name, value, choices) {
  if (!choices.includes(value)) throw new Error(`${name} must be one of: ${choices.join(", ")}`);
  return value;
}

export function inferContentType(text, paragraphCount) {
  if (/(对比|区别|区别是|\bvs\.?\b|before\s*\/\s*after)/iu.test(text)) return "comparison";
  if (/(步骤|流程|工作流|第[一二三四五六七八九十]步|先.+再.+最后|how[ -]?to|教程)/iu.test(text)) return "workflow";
  if (/(功能|产品|发布|广告|转化|购买|用户|品牌)/iu.test(text)) return "promo";
  if (/(数据|增长|下降|趋势|排名|星标|百分比|\d+(?:\.\d+)?%)/u.test(text)) return "data-story";
  if (paragraphCount >= 4 || /(第[一二三四五六七八九十]个|\b\d+[.)、])/u.test(text)) return "listicle";
  return "explainer";
}

function layoutFor(type, index, total) {
  if (index === 0) return "hero";
  if (index === total - 1) return "summary";
  const plan = typeLayouts[type];
  return plan[1 + ((index - 1) % Math.max(1, plan.length - 2))];
}

function visualCards(cues) {
  if (cues.length > 1) return cues.slice(1, 5).map((cue) => shortTitle(cue, 16));
  const pieces = String(cues[0] || "").replace(/[。！？?!；;：:]$/u, "").split(/[，、,]/u).map((item) => item.trim()).filter(Boolean);
  return (pieces.length > 1 ? pieces : ["重点", "方法", "结果"]).slice(0, 4).map((item) => shortTitle(item, 16));
}

export function createProject({ scriptPath, outputDir, slug, title, type = "auto", format = "landscape", theme = "editorial" }) {
  const resolvedScript = path.resolve(scriptPath);
  if (!fs.existsSync(resolvedScript)) throw new Error(`Script not found: ${resolvedScript}`);
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/u.test(slug)) throw new Error("Slug must contain 2-63 lowercase letters, digits, or hyphens");

  assertChoice("type", type, contentTypes);
  assertChoice("format", format, Object.keys(formats));
  assertChoice("theme", theme, themes);

  const target = path.resolve(outputDir);
  if (fs.existsSync(target)) throw new Error(`Refusing to overwrite existing project: ${target}`);
  const lockedText = fs.readFileSync(resolvedScript, "utf8").replace(/\r\n?/g, "\n").trim();
  const lockedParagraphs = paragraphs(lockedText);
  if (!lockedParagraphs.length) throw new Error("The script is empty");
  const resolvedType = type === "auto" ? inferContentType(lockedText, lockedParagraphs.length) : type;

  fs.cpSync(templateRoot, target, { recursive: true });
  for (const relative of ["assets", "renders", ".media/raw-cues", ".media/generated-images"]) {
    fs.mkdirSync(path.join(target, relative), { recursive: true });
  }

  const source = {
    schemaVersion: 2,
    project: {
      slug,
      title: title || shortTitle(splitCues(lockedParagraphs[0])[0] || slug, 32),
      type: resolvedType,
      format,
      theme,
      createdAt: new Date().toISOString(),
    },
    copy: {
      source: "user-provided",
      status: "locked",
      language: "zh-CN",
      subtitlePolicy: "verbatim",
      lockedFile: "script.locked.txt",
      lockedSha256: sha256Text(lockedParagraphs.map(canonicalParagraph).join("\n")),
      visualNumbersAreNeverSpoken: true,
    },
    audio: {
      provider: "system",
      voice: "auto",
      speed: 1,
      sentenceGap: 0.14,
      sceneLead: 0.12,
      sceneTail: 0.12,
      finalTail: 0.35,
      targetLufs: -16,
      targetTruePeak: -1.5,
      providerOptions: {},
      pronunciationReplacements: [{ match: "AI", spoken: "A I" }],
    },
    visual: {
      style: themeStyles[theme],
      palette: theme === "tech" ? ["#081426", "#EAF2FF", "#4C8DFF", "#FF9D45"] : ["#F7F2E8", "#27251F", "#E8A34A", "#2F66D0"],
      presenter: { mode: "none", reference: null, description: null },
      requireSceneAssets: false,
    },
    render: {
      ...formats[format],
      fps: 30,
      publish: false,
      renderer: "chromium-frames",
    },
    scenes: lockedParagraphs.map((paragraph, index) => {
      const cues = splitCues(paragraph);
      const layout = layoutFor(resolvedType, index, lockedParagraphs.length);
      return {
        id: `scene-${String(index + 1).padStart(2, "0")}`,
        paragraph: index + 1,
        kind: index === 0 ? "intro" : index === lockedParagraphs.length - 1 ? "summary" : "content",
        layout,
        eyebrow: `${resolvedType.toUpperCase()} / ${String(index + 1).padStart(2, "0")}`,
        chapter: index === 0 ? "START" : index === lockedParagraphs.length - 1 ? "SUMMARY" : `SCENE ${String(index + 1).padStart(2, "0")}`,
        title: shortTitle(cues[0] || paragraph, format === "portrait" ? 24 : format === "social" ? 30 : 42),
        cues,
        visual: {
          action: `compose a ${layout} scene for ${resolvedType} content`,
          cards: layout === "hero" ? heroLabels[resolvedType] : visualCards(cues),
          asset: `assets/scene-visual-${String(index + 1).padStart(2, "0")}.png`,
        },
      };
    }),
  };

  fs.writeFileSync(path.join(target, "script.locked.txt"), `${lockedText}\n`);
  writeJson(path.join(target, "story-source.json"), source);
  writeJson(path.join(target, "meta.json"), {
    id: slug,
    title: source.project.title,
    type: resolvedType,
    format,
    theme,
    createdAt: source.project.createdAt,
    workflow: "video-workflow@0.1.0",
  });
  fs.writeFileSync(path.join(target, "story.js"), "window.VIDEO_WORKFLOW_STORY = {\"duration\":1,\"copy\":{},\"audio\":{},\"render\":{},\"scenes\":[]};\n");
  fs.writeFileSync(path.join(target, "PROJECT.md"), `# ${source.project.title}\n\nGenerated by Video Workflow. Edit visual fields in \`story-source.json\`; do not rewrite \`scenes[].cues\`.\n`);
  fs.writeFileSync(path.join(target, ".gitignore"), ".media/raw-cues/\n.media/balanced-cues/\n.media/scene-concats/\n.media/render-frames/\nrenders/\nassets/voice-*.wav\nassets/narration-master.wav\nassets/voice-manifest.json\n");
  return { target, source };
}
