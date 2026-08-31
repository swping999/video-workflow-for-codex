<h1 align="center">Video Workflow for Codex</h1>

<p align="center"><strong>An open-source Codex community plugin for producing synchronized, verified videos from locked scripts.</strong></p>

<p align="center">
  <img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-EF5A38?style=flat-square">
  <img alt="Node 20+" src="https://img.shields.io/badge/node-20%2B-191919?style=flat-square">
  <img alt="Codex Plugin" src="https://img.shields.io/badge/Codex-Community%20Plugin-191919?style=flat-square">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-EF5A38?style=flat-square"></a>
</p>

<p align="center">English · <a href="README.zh-CN.md">中文</a></p>

Most AI video demos stop at a script or a generated clip. This plugin handles the production layer: locked copy, reusable content templates, provider-neutral narration, measured audio timing, verbatim captions, animation, loudness normalization, deterministic frame rendering, and verification before export.

```text
Locked script
  → content type, format, and theme
  → voice and image jobs
  → measured narration timeline
  → captions and animation from the same cues
  → Chromium frame renderer + FFmpeg
  → verification gates
  → final MP4
```

It does not depend on HyperFrames or Remotion.

## Video types

| Type | Designed for |
| --- | --- |
| `explainer` | Concepts, education, and terminology |
| `listicle` | Tools, skills, recommendations, and rankings |
| `workflow` | Tutorials, SOPs, and process breakdowns |
| `comparison` | A/B decisions, before/after, and trade-offs |
| `promo` | Product features, launches, and ads |
| `data-story` | Metrics, trends, activity, and reports |

Formats: `landscape` (1920×1080), `portrait` (1080×1920), and `social` (1080×1350). Themes: `whiteboard`, `editorial`, `tech`, and `product`.

## Why it is useful

- Narration and captions share one locked cue source.
- Scene timing comes from real audio duration instead of word-count estimates.
- Animation reveals are aligned to narration cues and stop when the spoken section ends.
- Audio is dynamically balanced and normalized to configurable LUFS and true-peak targets.
- Hash, duration, cue order, caption drift, scene gaps, required assets, dimensions, and final output are verified.
- Every episode is created in a new directory; existing work is never overwritten.
- No voice sample, presenter identity, model weight, API key, or generated episode is bundled.

## Narration providers

The zero-account default is the operating system's installed TTS voice. The adapter layer also supports supplied audio files, OpenAI, ElevenLabs, and user-configured OpenAI-compatible endpoints. Paid providers are used only when explicitly selected.

All provider output is converted to 48 kHz mono WAV before timing and normalization. Local engines such as Kokoro, CosyVoice, or Piper can be connected through files or a compatible endpoint without becoming repository dependencies.

## Requirements

- Node.js 20 or newer
- Chrome, Chromium, or Edge
- macOS, Windows, or Linux

FFmpeg, ffprobe, GSAP, and Puppeteer Core are installed as locked runtime packages.

## Install as a Codex plugin

```bash
codex plugin marketplace add swping999/video-workflow-for-codex --ref main
codex plugin add video-workflow@swping999-video
```

Start a new Codex task and ask:

```text
Use $video-workflow to turn this locked script into a verified vertical list video.
```

The Skill runs `doctor` first. If runtime packages are missing, Codex installs the checked-in lockfile inside the resolved plugin directory before continuing.

## Manual quick start

```bash
(cd plugins/video-workflow/runtime && npm ci)

PLUGIN=plugins/video-workflow
$PLUGIN/scripts/video-workflow doctor
$PLUGIN/scripts/video-workflow create \
  --script examples/demo-script.txt \
  --output /tmp/demo-video \
  --slug demo-video \
  --type listicle \
  --format portrait \
  --theme editorial
$PLUGIN/scripts/video-workflow export --project /tmp/demo-video
$PLUGIN/scripts/video-workflow synthesize --project /tmp/demo-video --provider system
$PLUGIN/scripts/video-workflow process-audio --project /tmp/demo-video
$PLUGIN/scripts/video-workflow verify --project /tmp/demo-video
$PLUGIN/scripts/video-workflow render --project /tmp/demo-video --quality high
```

The final output is `renders/final.mp4`; `renders/render-report.json` records the renderer, dimensions, frame count, duration, and verification fingerprint.

## Project contract

| Artifact | Purpose |
| --- | --- |
| `script.locked.txt` | Immutable user-approved copy |
| `story-source.json` | Single structured source for copy, layout, voice, format, and theme |
| `.media/audio-request.json` | Exact provider-neutral voice jobs |
| `.media/image-prompts.json` | Optional image jobs |
| `assets/voice-manifest.json` | Audio hashes, cue durations, LUFS, peak, and master track |
| `story.js` | Measured timeline consumed by the renderer |
| `renders/final.mp4` | Verified final output |

## Scope and naming

This is an independent community plugin built for Codex, not an official OpenAI plugin and not a text-to-video foundation model. It orchestrates existing system or user-selected media capabilities and provides its own deterministic browser-frame rendering pipeline.

See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT. Runtime dependencies retain their own licenses.
