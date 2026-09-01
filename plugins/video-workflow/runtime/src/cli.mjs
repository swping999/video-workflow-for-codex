#!/usr/bin/env node
import path from "node:path";
import { createProject } from "./project.mjs";
import { exportJobs } from "./export-jobs.mjs";
import { synthesizeProject } from "./tts.mjs";
import { processAudio } from "./process-audio.mjs";
import { verifyProject } from "./verify.mjs";
import { renderProject } from "./render.mjs";
import { doctor } from "./doctor.mjs";
import { parseArgs, requireArg } from "./utils.mjs";

const help = `Video Workflow for Codex

Usage:
  video-workflow doctor
  video-workflow build --script <file> --output <directory> --slug <slug> [--brief <one-sentence request>] [--title <title>] [--type auto|explainer|listicle|workflow|comparison|promo|data-story] [--format landscape|portrait|social] [--theme whiteboard|editorial|tech|product] [--quality draft|medium|high]
  video-workflow create --script <file> --output <directory> --slug <slug> [--brief <one-sentence request>] [--title <title>] [--type auto|explainer|listicle|workflow|comparison|promo|data-story] [--format landscape|portrait|social] [--theme whiteboard|editorial|tech|product]
  video-workflow export --project <directory>
  video-workflow synthesize --project <directory> [--provider system|files] [--overwrite]
  video-workflow process-audio --project <directory>
  video-workflow verify --project <directory>
  video-workflow render --project <directory> [--quality draft|medium|high]

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
    console.log(`Created ${result.source.project.type} ${result.source.project.format} project with ${result.source.scenes.length} scenes at ${result.target}`);
    return;
  }
  if (command === "build") {
    doctor();
    const created = createProject(creationOptions(args));
    console.log(`[1/6] Created ${created.source.project.type} ${created.source.project.format} project with ${created.source.scenes.length} scenes`);
    const exported = exportJobs(created.target);
    console.log(`[2/6] Exported ${exported.audioRequest.items.length} locked narration cues`);
    const synthesized = await synthesizeProject(created.target, { provider: "system" });
    console.log(`[3/6] Generated ${synthesized.generated} cues with free system TTS`);
    const processed = processAudio(created.target);
    console.log(`[4/6] Built the ${processed.story.duration.toFixed(3)}s audio-led timeline`);
    const verified = verifyProject(created.target);
    console.log(`[5/6] Verified ${verified.scenes} scenes, fingerprint ${verified.fingerprint}`);
    const rendered = await renderProject(created.target, { quality: args.quality ? String(args.quality) : "high" });
    console.log(`[6/6] Rendered ${rendered.output}`);
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
  if (command === "synthesize") {
    const result = await synthesizeProject(project, { provider: args.provider ? String(args.provider) : null, overwrite: Boolean(args.overwrite) });
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
  if (command === "render") {
    const result = await renderProject(project, { quality: args.quality ? String(args.quality) : "high" });
    console.log(`Rendered ${result.output}`);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${help}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
