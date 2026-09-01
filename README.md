<h1 align="center">Video Workflow for Codex</h1>

<p align="center"><strong>Tell Codex what video you want in one sentence. Get a synchronized, verified MP4 through a completely free local production path.</strong></p>

<p align="center">
  <img alt="Version 0.2.0" src="https://img.shields.io/badge/version-0.2.0-EF5A38?style=flat-square">
  <img alt="No paid media API" src="https://img.shields.io/badge/paid%20media%20APIs-none-2E8B57?style=flat-square">
  <img alt="Node 20+" src="https://img.shields.io/badge/node-20%2B-191919?style=flat-square">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-EF5A38?style=flat-square"></a>
</p>

<p align="center">English · <a href="README.zh-CN.md">中文</a></p>

Most AI video demos stop at a script or a few loose assets. This Codex community plugin goes all the way to a finished video. The default path needs no media API key, paid speech provider, image-generation account, HyperFrames, or Remotion.

```text
One-sentence request
  → Codex infers type, format, theme, scenes, and script
  → script and original brief are locked
  → free operating-system narration
  → built-in diagrams, cards, typography, and GSAP animation
  → measured audio timeline and verbatim captions
  → loudness normalization and verification gates
  → deterministic Chromium frames + FFmpeg
  → final MP4
```

## Say one sentence

After installing, start a new Codex task and say:

```text
Use $video-workflow to make a vertical whiteboard explainer about MCP.
```

Codex handles the production decisions that are missing from the brief:

- chooses one of six reusable content structures;
- routes to landscape, portrait, or 4:5 social format;
- writes a complete scene-by-scene script and locks it;
- creates narration, captions, visuals, and animation from the same source;
- renders the MP4 and returns a verification fingerprint.

Routine choices do not require a questionnaire. Codex asks only when ambiguity would materially change facts, identity, or the requested outcome.

## Completely free core

- **Narration:** macOS `say`, Windows `System.Speech`, or free `espeak-ng` on Linux.
- **Visuals:** code-rendered typography, diagrams, cards, arrows, shapes, and GSAP motion.
- **Video:** a user-installed Chrome/Chromium/Edge browser plus bundled FFmpeg tooling.
- **Accounts:** no speech account, image account, API key, or cloud media service is required.
- **Privacy:** the default build does not send the script or audio to a cloud media endpoint.

Users may supply their own authorized audio files, but the runtime contains no paid-provider adapter. Optional image prompts are exported for people who want to add their own assets; those images are never required for a complete video.

## Video types and formats

| Type | Designed for |
| --- | --- |
| `explainer` | Knowledge, concepts, education, and terminology |
| `listicle` | Skills, tools, recommendations, and rankings |
| `workflow` | Tutorials, SOPs, and process breakdowns |
| `comparison` | A/B decisions, before/after, and trade-offs |
| `promo` | Product features, launches, and ads |
| `data-story` | Metrics, trends, GitHub activity, and reports |

Formats are `landscape` (1920×1080), `portrait` (1080×1920), and `social` (1080×1350). Themes are `whiteboard`, `editorial`, `tech`, and `product`.

## Synchronization and quality contract

- Narration and captions share one locked cue source.
- Scene timing comes from actual processed audio, not word-count estimates.
- Animation reveals follow narration cues and stop when the spoken section ends.
- Every cue is dynamically balanced; scene audio targets about -16 LUFS and -1.5 dBTP.
- Hashes, durations, cue order, caption drift, scene gaps, dimensions, assets, and final output are verified.
- Every episode uses a new directory; existing work is never overwritten.
- No personal voice, presenter identity, model weight, secret, or generated episode is bundled.

## Requirements

- Node.js 20 or newer
- Chrome, Chromium, or Edge
- macOS, Windows, or Linux
- Linux only: `espeak-ng` for the one-command narration path

FFmpeg, ffprobe, GSAP, and Puppeteer Core are installed from the checked-in lockfile.

## Install as a Codex plugin

```bash
codex plugin marketplace add swping999/video-workflow-for-codex --ref main
codex plugin add video-workflow@swping999-video
```

Start a new Codex task after installation so the Skill is loaded.

## Manual one-command build

Codex writes the script before invoking the deterministic runtime. The CLI records both inputs:

```bash
(cd plugins/video-workflow/runtime && npm ci)

PLUGIN=plugins/video-workflow
$PLUGIN/scripts/video-workflow build \
  --brief "Make a vertical explainer about MCP" \
  --script examples/demo-script.txt \
  --output /tmp/mcp-video \
  --slug mcp-video \
  --type explainer \
  --format portrait \
  --theme whiteboard \
  --quality high
```

The final output is `renders/final.mp4`. `renders/render-report.json` records dimensions, frame count, duration, renderer, and verification fingerprint.

## Project contract

| Artifact | Purpose |
| --- | --- |
| `brief.locked.txt` | Original one-sentence request in brief mode |
| `script.locked.txt` | Exact Codex-generated or user-approved copy |
| `story-source.json` | Single structured source for copy, layout, voice, format, and theme |
| `.media/audio-request.json` | Exact narration cue jobs |
| `.media/image-prompts.json` | Optional image jobs; not required by the free core |
| `assets/voice-manifest.json` | Audio hashes, cue durations, LUFS, peak, and master track |
| `story.js` | Measured timeline consumed by the renderer |
| `renders/final.mp4` | Verified final output |

## Scope

This is an independent community plugin built for Codex, not an official OpenAI plugin and not a newly trained text-to-video model. It supplies its own production workflow and deterministic browser-frame renderer without depending on HyperFrames or Remotion.

See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT. Runtime dependencies retain their own licenses.
