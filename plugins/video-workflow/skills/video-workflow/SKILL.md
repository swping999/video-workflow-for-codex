---
name: video-workflow
description: Turn a one-sentence video request, locked script, structured content plan, or CSV/JSON dataset into sourced, synchronized, multi-format MP4s through a free local production path. Use for explainers, listicles, tutorials, comparisons, product promos, and data stories when Codex should direct semantic visuals, generate continuous narration, align verbatim captions and content-led animation, design and rank platform covers, and verify copy, facts, charts, audio, layout, aesthetics, and delivery files. Do not use for one-off generative clips or automatic social publishing.
---

# Video Workflow

Use the plugin's `scripts/video-workflow` runner. Resolve it to an absolute path before execution.

## Non-negotiable contract

- Keep the default path account-free: operating-system TTS, code-rendered visuals, Chromium, FFmpeg, and no paid media API.
- Never require HyperFrames, Remotion, cloud speech, or external image generation.
- Never invent chart values, testimonials, metrics, customer evidence, product capabilities, or sources.
- Treat a chart without data as an explicitly labeled trend illustration. Require a source for a real chart.
- Keep comparisons on the same named dimensions for both subjects.
- Lock one copy source. Narration, captions, SRT, and VTT must all use `story-source.json` `scenes[].cues`.
- Let processed narration determine timing. Complete each reveal before its spoken section ends.
- Prefer continuous scene narration so sentence joins sound natural; use cue files only as the compatibility fallback.
- Direct subjects, relations, focus, metaphor, motion, and camera intent before rendering. Animation should explain a process, not merely make cards enter.
- Never bundle personal media, voices, identities, secrets, or generated episodes. Never publish unless separately asked.

## Choose the input path

1. If the user supplies approved wording, use it unchanged.
2. If the user gives only a goal, treat that sentence as the locked brief, draft a complete script, and save one blank-line-separated paragraph per scene.
3. If the request contains comparison dimensions, workflow branches, list metadata, brand evidence, data, or local media, create a content-plan JSON. Read [references/content-plan.md](references/content-plan.md).
4. For current or niche facts, research primary sources first. Record sources and claims in the content plan.
5. Use `--data` for CSV/JSON chart data, `--brand` for a reusable brand file, and local files for images, SVGs, screenshots, video, music, and sound effects.

## Route the video

- Type: `explainer`, `listicle`, `workflow`, `comparison`, `promo`, or `data-story`. Allow the runtime to report a secondary type when confidence is low.
- Format: `portrait` for 抖音/Reels/Shorts/vertical; `social` for 小红书/4:5; `landscape` for horizontal/YouTube/presentations.
- Platform: `douyin`, `reels`, `shorts`, `xiaohongshu`, or `generic` so safe areas are applied.
- Theme: `whiteboard`, `editorial`, `tech`, or `product`. Each theme owns typography, icons, borders, texture, transitions, captions, and motion.
- Language: use `auto` unless the user specifies a locale. Add a pronunciation dictionary for acronyms, formulas, names, and unusual numbers.
- Sound: `subtle` adds restrained semantic cues, `full` adds a free procedural music bed plus cues and narration ducking, and `off` keeps narration only.

## Build

1. Run `doctor`. If runtime packages are absent, run `npm ci` in the plugin runtime directory.
2. Run one isolated build; never overwrite another project:

```bash
<plugin-root>/scripts/video-workflow build \
  --brief "<original request when applicable>" \
  --script /absolute/script.txt \
  --plan /absolute/content-plan.json \
  --data /absolute/data.csv \
  --output /absolute/new-project \
  --slug stable-lowercase-slug \
  --type auto \
  --format portrait \
  --formats landscape,portrait,social \
  --platform douyin \
  --theme editorial \
  --sound-design subtle \
  --language auto \
  --quality high
```

Omit optional flags when they are not needed. The one-command path creates narration, a measured timeline, SRT/VTT, word timestamps, storyboard, fact-check checklist, covers, and MP4s.

## Use authorized narration or media

For user-supplied narration, run `create → export`, preferably place one authorized continuous file per scene ID in `.media/raw-scenes/` (or one file per cue ID in `.media/raw-cues/`), then run `process-audio → verify → render`. Use `--provider files`; never send those files to a cloud service.

For an optional higher-quality local speech engine, use `--provider adapter --adapter /absolute/executable`. The executable receives text/output/language/voice/prosody arguments and must create the output locally. Never assume or call a cloud endpoint.

For local images, SVGs, screenshots, or video, reference them in the content plan. The runtime copies and hashes them into the isolated project. Remote media URLs are not fetched automatically.

## Revise and preview

- Use `revise --project ... --script ...` for wording changes. It archives the previous locked version inside `revisions/` before rebuilding provenance.
- Open `deliverables/storyboard-editor.html`, edit scene type/title/caption position/visual JSON, download the patch, then run `apply-storyboard`. This changes visual state only, archives the old state, and invalidates only affected scenes.
- Use `preview --project ... --formats portrait --scenes 2,4` for draft review.
- Use `render --scenes 2,4` after a local visual change. Scene-level frame caching preserves unaffected scenes.
- Use `render --formats landscape,portrait,social` to reflow one verified timeline into all supported formats.
- Use `cache-info` to inspect cache size and `clean-cache` for a safe project-local cleanup. Respect the per-project cache cap.

## Verify before delivery

Run `verify`, then render. Require all checks to pass: locked hashes; exact captions; chart source and narration/data agreement; comparison structure; claim provenance; audio duration, LUFS, and peak; word timing; media existence; safe areas; text overflow; contrast; focal/caption collisions; keyframe aesthetic diagnostics; black frames; and output duration.

Return paths for MP4s, all three cover candidates plus the selected cover, SRT, VTT, storyboard/editor, direction/sound/cover plans, aesthetic/fact-check reports, duration, dimensions, scene count, and verification fingerprint. Read [references/quality-and-delivery.md](references/quality-and-delivery.md) for failure recovery and the artifact contract.
