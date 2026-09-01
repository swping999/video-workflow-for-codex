import fs from "node:fs";
import path from "node:path";
import { sha256Text, writeJson } from "./utils.mjs";
import { spokenText, validateLockedSource } from "./source.mjs";

function ttsText(text, replacements) {
  return replacements.reduce((value, item) => value.split(item.match).join(item.spoken), text);
}

export function exportJobs(projectArg) {
  const project = validateLockedSource(projectArg);
  const { projectRoot, source } = project;
  const replacements = source.audio.pronunciationReplacements || [];
  const audioRequest = {
    schemaVersion: 1,
    provider: source.audio.provider,
    voice: source.audio.voice,
    language: source.copy.language,
    speed: source.audio.speed,
    lockedCopySha256: sha256Text(source.scenes.map(spokenText).join("\n")),
    instructions: "Create one audio file per item. Preserve the exact text, keep the id as the filename, and place files in .media/raw-cues/.",
    acceptedFormats: ["wav", "flac", "mp3", "m4a", "aac"],
    items: source.scenes.flatMap((scene, sceneIndex) =>
      scene.cues.map((text, cueIndex) => ({
        id: `${scene.id}-cue-${String(cueIndex + 1).padStart(2, "0")}`,
        sceneId: scene.id,
        sceneIndex,
        cueIndex,
        text,
        ttsText: ttsText(text, replacements),
      })),
    ),
  };

  const presenter = source.visual.presenter || { mode: "none" };
  const imageRequest = {
    schemaVersion: 1,
    style: source.visual.style,
    palette: source.visual.palette,
    presenter,
    instructions: "Generate one clean scene illustration per item. Do not render readable words, captions, logos, or watermarks inside the image.",
    items: source.scenes.map((scene, index) => {
      const personRule = presenter.mode === "reference"
        ? `Use the user-provided character reference at ${presenter.reference}; preserve only the authorized identity and requested styling.`
        : presenter.mode === "generated-character"
          ? `Use one consistent fictional presenter described as: ${presenter.description || "a simple neutral illustrated host"}.`
          : "Do not include a presenter or identifiable person; use objects, diagrams, and editorial doodles.";
      return {
        sceneId: scene.id,
        output: scene.visual.asset,
        layout: scene.layout,
        prompt: `${source.visual.style}. ${personRule} Scene ${index + 1}, ${scene.layout} layout: ${scene.visual.action}. Visual ideas: ${scene.visual.cards.join("; ")}. Match a ${source.project.format} ${source.project.type} video. Transparent or clean background. No readable text, logos, or watermark.`,
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
