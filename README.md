<h1 align="center">Video Workflow for Codex</h1>

<p align="center"><strong>One request in. Sourced, synchronized, platform-ready video out — through a free local production path.</strong></p>

<p align="center">
  <img alt="Version 1.0.0" src="https://img.shields.io/badge/version-1.0.0-EF5A38?style=flat-square">
  <img alt="No paid media API" src="https://img.shields.io/badge/paid%20media%20APIs-none-2E8B57?style=flat-square">
  <img alt="72 visual combinations" src="https://img.shields.io/badge/visual%20matrix-72%20combinations-3159C9?style=flat-square">
  <img alt="Node 22.12+" src="https://img.shields.io/badge/node-22.12%2B-191919?style=flat-square">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-EF5A38?style=flat-square"></a>
</p>

<p align="center">English · <a href="README.zh-CN.md">中文</a></p>

Most AI video demos stop at a script or loose assets. This community plugin turns a one-sentence request, approved script, content plan, or dataset into complete MP4s, covers, captions, a storyboard, and a fact-check report. It does not require a paid media API, speech account, image account, HyperFrames, or Remotion.

```text
Request / locked script / CSV / JSON / local media
  → content classification with confidence and optional mixed type
  → six content-specific structured visual systems
  → free operating-system narration + pronunciation control
  → audio-led cue, word, caption, and animation timeline
  → optional music/SFX with automatic narration ducking
  → platform-aware landscape, portrait, and 4:5 layouts
  → factual, audio, timing, and visual quality gates
  → MP4 + cover + SRT/VTT + storyboard + fact-check files
```

## Use it in one sentence

After installation, start a new Codex task and say:

```text
Use $video-workflow to make a vertical whiteboard explainer about MCP.
```

Codex drafts and locks the script when needed, chooses the content structure, format, platform safe area, theme, and language, then runs the deterministic local production pipeline. It only asks when ambiguity would materially change facts, identity, or the requested outcome.

## What changed in 1.0

This is no longer a generic text-card generator.

| Type | Structured visuals and safeguards |
| --- | --- |
| `explainer` | Definitions, mechanisms, cause/effect, timelines, structures, analogies, misconceptions, and cycles |
| `listicle` | Global ranks, icons/assets, reasons, audiences, pros/cons, and scores |
| `workflow` | Input → operation → output → check, plus branches, prerequisites, estimates, cautions, demos, and acceptance lists |
| `comparison` | Shared-dimension tables, before/after, trade-offs, radar views, decisions, and a verdict |
| `promo` | Pain → solution → demo → sourced proof → CTA; no fabricated claims or testimonials |
| `data-story` | CSV/JSON data, axes, units, sources, ranges, scales, sorting, missing-value policy, annotations, and narration/data checks |

Auto classification now returns confidence and an optional secondary type. A four-paragraph explainer is no longer classified as a list just because it has four paragraphs, and data signals outrank generic product words.

## Free local core

- **Narration:** macOS `say`, Windows `System.Speech`, or free `espeak-ng` on Linux.
- **Visuals:** responsive HTML/CSS/SVG diagrams, typography, local images/SVG/video/screenshots, and GSAP animation.
- **Audio/video:** locked FFmpeg and ffprobe packages plus a user-installed Chrome/Chromium/Edge browser.
- **Accounts:** no media API key, cloud voice, image account, or external renderer.
- **Privacy:** the default path does not send scripts, voices, or local media to a cloud media endpoint.

The runtime can use authorized local narration and media. It never bundles voice samples, face references, user-specific styles, secrets, generated episodes, or model weights.

## Formats, platforms, themes, and languages

Formats:

- `landscape`: 1920×1080
- `portrait`: 1080×1920
- `social`: 1080×1350

Platform presets apply separate content and cover safe areas for `douyin`, `reels`, `shorts`, `xiaohongshu`, and `generic`. One verified timeline can render all three formats with real layout reflow, not just a squeezed canvas.

Themes — `whiteboard`, `editorial`, `tech`, and `product` — define distinct typography, icons, borders, texture, motion, transitions, captions, and music tendencies.

Language is auto-detected or selected with `--language`. The runtime includes multilingual font routing, operating-system voice selection, language-aware caption breaks, and pronunciation dictionaries for acronyms, formulas, names, and numbers.

## Quality contract

- Narration, on-screen captions, SRT, and VTT reconstruct one locked copy source exactly.
- Scene and cue timing comes from processed audio; reveals finish before their spoken section ends.
- Cue audio is dynamically balanced; the final mix targets roughly -16 LUFS and -1.5 dBTP.
- A real chart requires finite values plus a source. Otherwise it is labeled as an illustration.
- Numbers spoken in a chart scene must exist in its labels or values.
- Comparisons require two subjects and the same named dimensions.
- Promo metrics, testimonials, and capability claims require verification and a source ID.
- Preflight checks cover paths, missing media, overflow, platform safe areas, contrast, cue order, gaps, loudness, peaks, black frames, and final duration.
- A screenshot regression matrix covers 6 types × 3 formats × 4 themes = 72 combinations.

## Requirements

- Node.js 22.12 or newer
- Chrome, Chromium, or Edge
- macOS, Windows, or Linux
- Linux one-command narration: `espeak-ng`

FFmpeg, ffprobe, GSAP, and Puppeteer Core are installed from the checked-in lockfile.

## Install as a Codex plugin

```bash
codex plugin marketplace add swping999/video-workflow-for-codex --ref main
codex plugin add video-workflow@swping999-video
```

Start a new Codex task after installation so the Skill is loaded.

## One-command build

```bash
(cd plugins/video-workflow/runtime && npm ci)

PLUGIN=plugins/video-workflow
$PLUGIN/scripts/video-workflow build \
  --brief "Make a sourced vertical data explainer" \
  --script examples/demo-script.txt \
  --plan examples/content-plan.json \
  --output /tmp/video-workflow-demo \
  --slug video-workflow-demo \
  --type auto \
  --format portrait \
  --formats landscape,portrait,social \
  --platform douyin \
  --theme editorial \
  --language auto \
  --quality high
```

For data stories, pass `--data /absolute/data.csv` or a JSON chart. For brand reuse, pass `--brand /absolute/brand.json`. See the [content-plan reference](plugins/video-workflow/skills/video-workflow/references/content-plan.md).

## Staged, revised, and local rendering

```bash
# Authorized custom narration
video-workflow create ...
video-workflow export --project /absolute/project
# Add one file per exported cue ID to .media/raw-cues/
video-workflow synthesize --project /absolute/project --provider files
video-workflow process-audio --project /absolute/project
video-workflow verify --project /absolute/project

# Versioned copy change; old locked state is archived under revisions/
video-workflow revise --project /absolute/project --script /absolute/revised-script.txt

# Draft review or scene-local rerender; unaffected scene frames stay cached
video-workflow preview --project /absolute/project --scenes 2,4
video-workflow render --project /absolute/project --scenes 2,4 --formats landscape,portrait,social
```

## Delivered project

| Artifact | Purpose |
| --- | --- |
| `script.locked.txt` | Exact narration/caption source |
| `content-plan.locked.json` | Structured visuals, data, sources, claims, brand, and media |
| `story-source.json` | Hashed project source and settings |
| `assets/audio-master.wav` | Final normalized narration/music/SFX mix |
| `assets/voice-manifest.json` | Cue, master, and mix hashes, durations, LUFS, and peaks |
| `deliverables/captions.srt` / `.vtt` | Exact subtitles |
| `deliverables/word-timestamps.json` | Supplied or estimated word timing |
| `deliverables/storyboard.html` / `.json` | Review and machine-readable storyboard |
| `deliverables/fact-check.md` / `.json` | Sources, claims, and chart provenance |
| `renders/cover-<format>.png` | Platform-safe covers |
| `renders/final-<format>.mp4` | Format-specific videos |
| `renders/final.mp4` | Primary compatibility output |

## Verify the repository

```bash
npm run check          # unit, audio smoke, privacy
npm run check:full     # plus render smoke and all 72 visual combinations
```

This is an independent Codex community plugin, not an official OpenAI plugin or a newly trained text-to-video model. See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and the [quality/delivery reference](plugins/video-workflow/skills/video-workflow/references/quality-and-delivery.md).

## License

MIT. Runtime dependencies retain their own licenses.
