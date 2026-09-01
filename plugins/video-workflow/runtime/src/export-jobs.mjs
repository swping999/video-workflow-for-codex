import fs from "node:fs";
import path from "node:path";
import { sha256Text, writeJson } from "./utils.mjs";
import { spokenText, validateLockedSource } from "./source.mjs";

function ttsText(text, replacements) {
  return replacements.reduce((value, item) => value.split(item.match).join(item.spoken), text);
}

function firstAsset(value) {
  if (!value || typeof value !== "object") return null;
  for (const key of ["asset", "image", "video", "screenshot"]) if (value[key]) return value[key];
  for (const child of Object.values(value)) {
    const result = Array.isArray(child) ? child.map(firstAsset).find(Boolean) : firstAsset(child);
    if (result) return result;
  }
  return null;
}

export function exportJobs(projectArg) {
  const project = validateLockedSource(projectArg);
  const { projectRoot, source } = project;
  const replacements = source.audio.pronunciationReplacements || [];
  const audioRequest = {
    schemaVersion: 3,
    provider: source.audio.provider,
    voice: source.audio.voice,
    language: source.copy.language,
    speed: source.audio.speed,
    prosody: source.audio.prosody || { rate: source.audio.speed },
    continuousNarration: Boolean(source.audio.continuousNarration),
    lockedCopySha256: sha256Text(source.scenes.map(spokenText).join("\n")),
    instructions: "Preferred: create one continuous file per scenes[] entry, keep the scene id as the filename, and place it in .media/raw-scenes/. Fallback: create one file per items[] cue and place it in .media/raw-cues/. Speak ttsText while preserving text as the exact locked caption. Optional cue word timestamps may be saved as <id>.words.json.",
    acceptedFormats: ["wav", "flac", "mp3", "m4a", "aac"],
    scenes: source.scenes.map((scene, sceneIndex) => ({
      id: scene.id,
      sceneIndex,
      text: scene.cues.join(""),
      ttsText: ttsText(scene.cues.join(""), replacements),
      cueTexts: scene.cues,
      language: source.copy.language,
      voice: source.audio.voice,
      prosody: {
        ...(source.audio.prosody || { rate: source.audio.speed }),
        emphasis: scene.visual?.direction?.beats?.[0]?.emphasis || source.audio.prosody?.emphasis || "moderate",
      },
    })),
    items: source.scenes.flatMap((scene, sceneIndex) =>
      scene.cues.map((text, cueIndex) => ({
        id: `${scene.id}-cue-${String(cueIndex + 1).padStart(2, "0")}`,
        sceneId: scene.id,
        sceneIndex,
        cueIndex,
        text,
        ttsText: ttsText(text, replacements),
        language: source.copy.language,
        voice: source.audio.voice,
        prosody: source.audio.prosody || { rate: source.audio.speed },
      })),
    ),
  };

  const presenter = source.visual.presenter || { mode: "none" };
  const imageRequest = {
    schemaVersion: 2,
    style: source.visual.style,
    palette: source.visual.palette,
    presenter,
    instructions: "Generate only optional visual assets for the structured scene. Keep labels and captions in HTML, not in raster images. Do not add watermarks or invented logos.",
    items: source.scenes.map((scene, index) => {
      const personRule = presenter.mode === "reference"
        ? `Use the user-provided character reference at ${presenter.reference}; preserve only the authorized identity and requested styling.`
        : presenter.mode === "generated-character"
          ? `Use one consistent fictional presenter described as: ${presenter.description || "a simple neutral illustrated host"}.`
          : "Do not include a presenter or identifiable person; use objects, diagrams, and editorial doodles.";
      return {
        sceneId: scene.id,
        output: scene.visual.optionalAssetOutput || scene.visual.asset,
        existingAsset: scene.visual.asset || firstAsset(scene.visual.model),
        layout: scene.layout,
        model: scene.visual.model,
        direction: scene.visual.direction,
        prompt: `${source.visual.style}. ${personRule} Scene ${index + 1}: ${scene.visual.action}. Direction: focus on ${scene.visual.direction?.focus || scene.title}; show ${JSON.stringify(scene.visual.direction?.relations || [])}; visual metaphor ${scene.visual.direction?.metaphor || "editorial focus"}; motion-ready layers for ${JSON.stringify(scene.visual.direction?.motion || [])}. Structured visual intent: ${JSON.stringify(scene.visual.model)}. Match a ${source.project.format} ${source.project.type} video for ${source.project.platform || "generic"}. Transparent or clean background. No readable text, invented claims, logos, or watermark.`,
      };
    }),
  };

  const audioPath = path.join(projectRoot, ".media", "audio-request.json");
  const imagePath = path.join(projectRoot, ".media", "image-prompts.json");
  writeJson(audioPath, audioRequest);
  writeJson(imagePath, imageRequest);
  fs.mkdirSync(path.join(projectRoot, ".media", "raw-cues"), { recursive: true });
  return { audioPath, imagePath, audioRequest, imageRequest };
}
