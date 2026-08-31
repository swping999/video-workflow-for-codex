---
name: video-workflow
description: Create, continue, verify, or render synchronized videos from a locked script. Use for explainers, lists, workflows, comparisons, product promos, or data stories that need narration, verbatim captions, animation timing, reusable formats, loudness control, and a final MP4; do not use for one-off generative clips or automatic social publishing.
---

# Video Workflow

Use the plugin's `scripts/video-workflow` runner. Resolve it to an absolute path before execution.

## Core contract

- Treat user-approved copy as locked. Narration and captions must both use `story-source.json` `scenes[].cues`.
- Never overwrite an existing project directory.
- Choose a content type from `explainer`, `listicle`, `workflow`, `comparison`, `promo`, or `data-story`; choose `auto` only when the user has not specified one.
- Support `landscape`, `portrait`, and `social` formats. Preserve safe caption margins for the selected format.
- Keep visual-only labels, item numbers, and emoji out of speech.
- Default to the operating system's installed TTS voice. Use paid or external providers only when the user explicitly configures one.
- Never bundle voice samples, identity references, API keys, model weights, or generated episodes.
- Do not claim completion until `verify` passes. Do not publish a video unless the user separately asks.

## Workflow

1. Run `doctor`. If locked runtime packages are missing, run `npm ci` in the plugin runtime directory.
2. Run `create` with the locked script, a new output directory, type, format, theme, and stable slug.
3. Edit only visual metadata in `story-source.json`; do not rewrite cues.
4. Run `export` to create provider-neutral voice and image jobs.
5. Run `synthesize` for system TTS, or place user/provider audio under `.media/raw-cues/` using the exported IDs.
6. Generate optional scene images at the exported paths. Diagram-only rendering remains valid.
7. Run `process-audio`, then `verify`.
8. Run `render` only after verification succeeds. Return the MP4 path and verification summary.

Read [references/workflow.md](references/workflow.md) for command options, content types, formats, voice providers, project fields, and failure recovery.
