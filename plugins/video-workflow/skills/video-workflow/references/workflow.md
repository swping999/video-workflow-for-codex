# Workflow reference

## Commands

```bash
<plugin-root>/scripts/video-workflow doctor
<plugin-root>/scripts/video-workflow create --script /absolute/script.txt --output /absolute/new-project --slug episode-name --type auto --format portrait --theme editorial
<plugin-root>/scripts/video-workflow export --project /absolute/new-project
<plugin-root>/scripts/video-workflow synthesize --project /absolute/new-project --provider system
<plugin-root>/scripts/video-workflow process-audio --project /absolute/new-project
<plugin-root>/scripts/video-workflow verify --project /absolute/new-project
<plugin-root>/scripts/video-workflow render --project /absolute/new-project --quality high
```

If `doctor` reports missing packages, change into `<plugin-root>/runtime` and run `npm ci` there.

## Content types

- `explainer`: concept, definition, and educational content.
- `listicle`: ranked items, tools, skills, and recommendations.
- `workflow`: steps, SOPs, tutorials, and process breakdowns.
- `comparison`: A/B decisions, before/after, and trade-offs.
- `promo`: product features, launches, and advertising narratives.
- `data-story`: metrics, GitHub activity, rankings, and trend explanations.
- `auto`: infer one of the above from the locked copy.

Themes are `whiteboard`, `editorial`, `tech`, and `product`. Formats are `landscape` (1920×1080), `portrait` (1080×1920), and `social` (1080×1350).

## Locked copy

`script.locked.txt` is immutable user input. Blank-line-separated paragraphs become scenes. Complete punctuation becomes caption and speech cues. `story-source.json` is the only structured copy source used for narration jobs and rendered captions.

Safe edits include titles, eyebrow labels, layout choices, visual cards, theme, image assets, and render format. For revised wording, create a new project instead of mutating provenance.

## Narration providers

- `system` is the zero-account default and uses installed macOS, Windows, or Linux speech synthesis.
- `files` only exports exact cue jobs and waits for supplied audio.
- `openai` uses the OpenAI speech endpoint and requires `OPENAI_API_KEY` plus explicit selection.
- `elevenlabs` requires `ELEVENLABS_API_KEY`, a configured voice ID, and explicit selection.
- `openai-compatible` calls a user-configured compatible HTTP endpoint for local or hosted engines.

No provider may silently fall back to another paid service. Voice cloning requires authorization and is never part of the default path. All resulting audio is normalized to 48 kHz mono WAV before timing.

## Visual assets

The default contains no identifiable presenter. Optional image jobs request clean scene art without captions, logos, or watermarks. Set `visual.requireSceneAssets` only when every image is mandatory.

## Failure recovery

- Missing cue: synthesize or provide only that cue again.
- Locked-copy mismatch: stop and create a new project from corrected copy.
- Loudness or peak failure: rerun `process-audio` from raw cues.
- Missing required visual: generate the exported path or explicitly allow the diagram fallback.
- Render failure: preserve the verified project and retry rendering without rewriting copy or speech.
