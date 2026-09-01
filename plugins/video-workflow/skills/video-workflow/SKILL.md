---
name: video-workflow
description: Turn either a one-sentence video request or a finished script into a synchronized, verified MP4 with a completely free local production path. Use for explainers, lists, workflows, comparisons, promos, and data stories when Codex should infer the format, draft and lock the script, build scenes, use system narration, align verbatim captions and animation, normalize audio, and render the final video; do not use for one-off generative clips or automatic social publishing.
---

# Video Workflow

Use the plugin's `scripts/video-workflow` runner. Resolve it to an absolute path before execution.

## Free-core contract

- Complete the default workflow without paid media APIs, API keys, cloud accounts, HyperFrames, Remotion, or external image generation.
- Use the operating system's free TTS and the built-in diagram, card, typography, and GSAP animation layouts.
- Accept user-supplied audio through `files` only when the user requests it. Never bundle voice samples, identities, secrets, model weights, or generated episodes.
- Never publish a video unless the user separately asks.

## One-sentence brief mode

When the user gives a goal but no approved script, treat that sentence as the locked brief and continue without asking routine production questions.

1. Infer the content type: `explainer`, `listicle`, `workflow`, `comparison`, `promo`, or `data-story`.
2. Infer the format. Use `portrait` for 抖音、Reels、Shorts、竖版 or ordinary short-form requests; `social` for 小红书 or 4:5; `landscape` for 横版、YouTube、PPT or presentation requests.
3. Choose a fitting theme from `whiteboard`, `editorial`, `tech`, or `product`.
4. Draft a complete natural-language script. Default to 5–8 scenes and roughly 45–90 seconds; use one blank-line-separated paragraph per scene. Do not put emoji numbering or visual-only labels into spoken copy.
5. Save the generated script to a temporary or adjacent text file. Pass both the original brief and generated script to `build` so the project records their provenance.
6. Use current or niche facts only after verifying them with appropriate primary sources. Ask a question only when ambiguity would materially change facts, identity, or the requested outcome.

Once the script is generated, it becomes locked. Narration and captions must both use `story-source.json` `scenes[].cues`; never create a second caption version.

## One-command production

1. Run `doctor`. If locked runtime packages are missing, run `npm ci` in the plugin runtime directory.
2. Run:

```bash
<plugin-root>/scripts/video-workflow build \
  --brief "<the user's one-sentence request>" \
  --script /absolute/generated-script.txt \
  --output /absolute/new-project \
  --slug stable-lowercase-slug \
  --type <inferred-type> \
  --format <inferred-format> \
  --theme <chosen-theme> \
  --quality high
```

3. Return the final MP4 path, duration, dimensions, scene count, and verification fingerprint.

## Finished-script mode

If the user already supplied or approved exact copy, omit `--brief` and pass that script directly to `build`. Treat it as immutable. For user-supplied narration, use the staged `create → export → files → process-audio → verify → render` path described in the reference.

Do not claim completion until verification passes. Read [references/workflow.md](references/workflow.md) for inference rules, command options, project fields, and failure recovery.
