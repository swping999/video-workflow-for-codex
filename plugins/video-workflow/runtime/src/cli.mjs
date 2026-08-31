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
  video-workflow create --script <file> --output <directory> --slug <slug> [--title <title>] [--type auto|explainer|listicle|workflow|comparison|promo|data-story] [--format landscape|portrait|social] [--theme whiteboard|editorial|tech|product]
  video-workflow export --project <directory>
  video-workflow synthesize --project <directory> [--provider system|files|openai|elevenlabs|openai-compatible] [--overwrite]
  video-workflow process-audio --project <directory>
  video-workflow verify --project <directory>
  video-workflow render --project <directory> [--quality draft|medium|high]

Projects are isolated and never overwritten. Narration and captions remain locked to story-source.json scenes[].cues[].
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === "help" || args.help) {
    process.stdout.write(help);
    return;
  }
  if (command === "doctor") {
    const result = doctor();
    console.log(`Environment ready: Node ${result.node}; browser ${result.browser}`);
    return;
  }
  if (command === "create") {
    const result = createProject({
      scriptPath: requireArg(args, "script"),
      outputDir: requireArg(args, "output"),
      slug: requireArg(args, "slug"),
      title: args.title ? String(args.title) : null,
      type: args.type ? String(args.type) : "auto",
      format: args.format ? String(args.format) : "landscape",
      theme: args.theme ? String(args.theme) : "editorial",
    });
    console.log(`Created ${result.source.project.type} ${result.source.project.format} project with ${result.source.scenes.length} scenes at ${result.target}`);
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
