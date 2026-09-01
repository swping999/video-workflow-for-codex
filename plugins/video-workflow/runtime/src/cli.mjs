#!/usr/bin/env node
import path from "node:path";
import { createProject } from "./project.mjs";
import { exportJobs } from "./export-jobs.mjs";
import { synthesizeProject } from "./tts.mjs";
import { processAudio } from "./process-audio.mjs";
import { verifyProject } from "./verify.mjs";
import { renderProject } from "./render.mjs";
import { doctor } from "./doctor.mjs";
import { reviseProject } from "./revision.mjs";
import { parseArgs, requireArg } from "./utils.mjs";
import { applyStoryboardPatch } from "./storyboard-editor.mjs";
import { cacheStats, cleanCache } from "./cache.mjs";

const help = `Video Workflow for Codex

Usage:
  video-workflow doctor
  video-workflow build --script <file> --output <directory> --slug <slug> [--plan plan.json] [--data data.csv|json] [--brand brand.json] [--language auto|zh-CN|en-US|...] [--platform generic|douyin|reels|shorts|xiaohongshu] [--type auto|explainer|listicle|workflow|comparison|promo|data-story] [--format landscape|portrait|social] [--formats landscape,portrait,social] [--theme whiteboard|editorial|tech|product] [--sound-design off|subtle|full] [--provider system|adapter] [--adapter /absolute/executable] [--quality draft|medium|high]
  video-workflow create --script <file> --output <directory> --slug <slug> [same content, language, platform, voice, and visual options as build]
  video-workflow revise --project <directory> --script <file> [--plan plan.json] [--data data.csv|json] [--brand brand.json] [--type auto|...]
  video-workflow export --project <directory>
  video-workflow synthesize --project <directory> [--provider system|files|adapter] [--adapter /absolute/executable] [--overwrite]
  video-workflow process-audio --project <directory>
  video-workflow verify --project <directory>
  video-workflow preview --project <directory> [--formats portrait] [--scenes 1,3]
  video-workflow render --project <directory> [--quality draft|medium|high] [--formats landscape,portrait,social] [--scenes 1,3]
  video-workflow storyboard --project <directory>
  video-workflow apply-storyboard --project <directory> --patch <storyboard.patch.json>
  video-workflow cache-info --project <directory>
  video-workflow clean-cache --project <directory>

Projects are isolated and never overwritten. Narration and captions remain locked to story-source.json scenes[].cues[].
The build command is the account-free path: system TTS, built-in visuals, synchronized captions, verification, and final MP4.
`;

function creationOptions(args) {
  return {
    scriptPath: requireArg(args, "script"),
    outputDir: requireArg(args, "output"),
    slug: requireArg(args, "slug"),
    title: args.title ? String(args.title) : null,
    type: args.type ? String(args.type) : "auto",
    format: args.format ? String(args.format) : "landscape",
    theme: args.theme ? String(args.theme) : "editorial",
    brief: args.brief ? String(args.brief) : null,
    planPath: args.plan ? String(args.plan) : null,
    dataPath: args.data ? String(args.data) : null,
    brandPath: args.brand ? String(args.brand) : null,
    language: args.language ? String(args.language) : "auto",
    platform: args.platform ? String(args.platform) : "generic",
    voice: args.voice ? String(args.voice) : "auto",
    speed: args.speed ? Number(args.speed) : 1,
    musicPath: args.music ? String(args.music) : null,
    sfxManifestPath: args.sfx ? String(args.sfx) : null,
    pronunciationPath: args.pronunciation ? String(args.pronunciation) : null,
    soundDesign: args["sound-design"] ? String(args["sound-design"]) : "subtle",
    continuousNarration: args["continuous-narration"] === undefined ? true : String(args["continuous-narration"]) !== "false",
    cacheMaxMb: args["cache-max-mb"] ? Number(args["cache-max-mb"]) : 1024,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === "help" || args.help) {
    process.stdout.write(help);
    return;
  }
  if (command === "doctor") {
    const result = doctor();
    console.log(`Environment ready: Node ${result.node}; browser ${result.browser}; free system TTS available`);
    return;
  }
  if (command === "create") {
    const result = createProject(creationOptions(args));
    console.log(`Created ${result.source.project.type} (${Math.round(result.source.project.classificationConfidence * 100)}% classification confidence) ${result.source.project.format} project with ${result.source.scenes.length} scenes at ${result.target}`);
    return;
  }
  if (command === "build") {
    const narrationProvider = args.provider ? String(args.provider) : "system";
    if (!["system", "adapter"].includes(narrationProvider)) throw new Error("One-command build supports provider=system or provider=adapter; use the staged workflow for provider=files");
    doctor({ requireSystemTts: narrationProvider === "system" });
    const created = createProject(creationOptions(args));
    console.log(`[1/6] Created ${created.source.project.type} ${created.source.project.format} project with ${created.source.scenes.length} scenes`);
    const exported = exportJobs(created.target);
    console.log(`[2/6] Exported ${exported.audioRequest.items.length} locked narration cues`);
    const synthesized = await synthesizeProject(created.target, { provider: narrationProvider, adapter: args.adapter ? String(args.adapter) : null });
    console.log(`[3/6] Generated ${synthesized.generated} continuous scene narration files with ${narrationProvider}`);
    const processed = processAudio(created.target);
    console.log(`[4/6] Built the ${processed.story.duration.toFixed(3)}s audio-led timeline, final mix, captions, storyboard, and fact-check files`);
    const verified = verifyProject(created.target);
    console.log(`[5/6] Verified ${verified.scenes} scenes, fingerprint ${verified.fingerprint}`);
    const rendered = await renderProject(created.target, { quality: args.quality ? String(args.quality) : "high", formats: args.formats ? String(args.formats) : null, scenes: args.scenes ? String(args.scenes) : null });
    console.log(`[6/6] Rendered ${rendered.outputs.join(", ")}`);
    return;
  }

  const project = path.resolve(requireArg(args, "project"));
  if (command === "export") {
    const result = exportJobs(project);
    console.log(`Exported ${result.audioRequest.items.length} voice cues and ${result.imageRequest.items.length} image prompts`);
    console.log(result.audioPath);
    console.log(result.imagePath);
    return;
  }
  if (command === "revise") {
    const result = reviseProject(project, {
      scriptPath: requireArg(args, "script"),
      planPath: args.plan ? String(args.plan) : null,
      dataPath: args.data ? String(args.data) : null,
      brandPath: args.brand ? String(args.brand) : null,
      title: args.title ? String(args.title) : null,
      type: args.type ? String(args.type) : "auto",
      language: args.language ? String(args.language) : "auto",
    });
    console.log(`Created revision ${result.revision}; previous version archived at ${result.archive}`);
    return;
  }
  if (command === "synthesize") {
    const result = await synthesizeProject(project, { provider: args.provider ? String(args.provider) : null, adapter: args.adapter ? String(args.adapter) : null, overwrite: Boolean(args.overwrite) });
    console.log(`Narration provider ${result.provider}: generated ${result.generated}, skipped ${result.skipped}`);
    return;
  }
  if (command === "process-audio") {
    const result = processAudio(project);
    console.log(`Built a ${result.story.duration.toFixed(3)}s narration timeline across ${result.story.scenes.length} scenes`);
    return;
  }
  if (command === "verify") {
    const result = verifyProject(project);
    console.log(`Verified ${result.scenes} scenes, ${result.duration.toFixed(3)}s, fingerprint ${result.fingerprint}`);
    return;
  }
  if (command === "storyboard") {
    const editorPath = path.join(project, "deliverables", "storyboard-editor.html");
    console.log(editorPath);
    return;
  }
  if (command === "apply-storyboard") {
    const result = applyStoryboardPatch(project, requireArg(args, "patch"));
    console.log(`Applied visual patch to ${result.changed.join(", ")}; previous visual state archived at ${result.archive}`);
    return;
  }
  if (command === "cache-info") {
    const result = cacheStats(project);
    console.log(`Cache: ${result.files} files, ${result.megabytes} MB at ${result.root}`);
    return;
  }
  if (command === "clean-cache") {
    const result = cleanCache(project);
    console.log(`Removed ${result.removedFiles} cached files (${result.removedMegabytes} MB) from ${result.root}`);
    return;
  }
  if (command === "render" || command === "preview") {
    const result = await renderProject(project, {
      quality: command === "preview" ? "draft" : args.quality ? String(args.quality) : "high",
      formats: args.formats ? String(args.formats) : null,
      scenes: args.scenes ? String(args.scenes) : null,
    });
    console.log(`Rendered ${result.outputs.join(", ")}`);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${help}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
