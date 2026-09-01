# Quality and delivery reference

## Staged commands

```bash
<plugin-root>/scripts/video-workflow doctor
<plugin-root>/scripts/video-workflow create --script /absolute/script.txt --output /absolute/project --slug episode --type auto --format portrait --platform douyin --theme editorial --language auto --sound-design subtle
<plugin-root>/scripts/video-workflow export --project /absolute/project
<plugin-root>/scripts/video-workflow synthesize --project /absolute/project --provider system
<plugin-root>/scripts/video-workflow process-audio --project /absolute/project
<plugin-root>/scripts/video-workflow verify --project /absolute/project
<plugin-root>/scripts/video-workflow preview --project /absolute/project --scenes 2,4
<plugin-root>/scripts/video-workflow render --project /absolute/project --quality high --formats landscape,portrait,social
<plugin-root>/scripts/video-workflow storyboard --project /absolute/project
<plugin-root>/scripts/video-workflow apply-storyboard --project /absolute/project --patch /absolute/storyboard.patch.json
<plugin-root>/scripts/video-workflow cache-info --project /absolute/project
<plugin-root>/scripts/video-workflow clean-cache --project /absolute/project
```

Linux uses `espeak-ng`; macOS uses `say`; Windows uses `System.Speech`. Continuous scene files are the default because they avoid audible sentence splices. `--provider files` accepts authorized scene files from `.media/raw-scenes/` and falls back to exported cue IDs in `.media/raw-cues/`. `--provider adapter --adapter /absolute/executable` supports a user-selected local speech engine without adding a cloud dependency to the plugin.

Sound modes: `off` keeps narration only; `subtle` generates sparse semantic sound cues; `full` also creates a local procedural background bed. User-supplied music always wins. Music is ducked under narration before final loudness normalization.

## Artifact contract

| Artifact | Purpose |
| --- | --- |
| `brief.locked.txt` | Original one-sentence request, when present |
| `script.locked.txt` | Exact approved narration and caption copy |
| `content-plan.locked.json` | Structured visual/data/source plan |
| `direction-plan.locked.json` | Scene focus, subjects, relations, metaphor, semantic motion, camera, and composition |
| `sound-plan.locked.json` | Narration priority, sound mode, ducking, and semantic cues |
| `cover-plan.locked.json` | Three independent cover compositions |
| `story-source.json` | Hashed project source and settings |
| `.media/audio-request.json` | Exact speech jobs plus pronunciation text |
| `.media/image-prompts.json` | Optional, structured scene-asset prompts |
| `assets/voice-manifest.json` | Cue/master/mix hashes, duration, LUFS, and peak |
| `assets/audio-master.wav` | Narration plus optional ducked music/SFX |
| `deliverables/captions.srt` | Exact subtitles |
| `deliverables/captions.vtt` | Exact web subtitles |
| `deliverables/word-timestamps.json` | Supplied or estimated word timing |
| `deliverables/storyboard.html` | Human-readable low-cost review |
| `deliverables/storyboard-editor.html` | Local visual editor that downloads a scene patch |
| `deliverables/storyboard.json` | Structured storyboard |
| `deliverables/aesthetic-report.json` | Keyframe occupancy, focus, repetition, motion, and collision diagnostics |
| `deliverables/cover-report.json` | Cover candidates, selected cover, and scores |
| `deliverables/fact-check.*` | Sources, claims, and chart provenance |
| `renders/cover-<format>-1..3.png` | Independent platform-safe cover candidates |
| `renders/cover-<format>.png` | Highest-scoring selected cover |
| `renders/final-<format>.mp4` | Format-specific video |
| `renders/final.mp4` | Primary compatibility output |
| `renders/render-report.json` | QA, dimensions, timing, cache, and outputs |

## Quality gates

- Copy: source hashes, exact cue reconstruction, no visual emoji in narration.
- Data: real values, source, missing-value policy, scale, and narration/chart numeric agreement.
- Comparison: exactly two subjects and one or more shared dimensions.
- Promo: verified/source-linked metrics, testimonials, and capability claims.
- Audio: continuous scene narration when available, per-scene dynamic balance, semantic SFX, optional ducked music, final mix near -16 LUFS, peak near/below -1.5 dBTP, no overlap or excessive gap.
- Timing: cue order, word ranges, master duration, render duration, and animation completion before speech ends.
- Visual direction: a focus, subjects/relations, metaphor, semantic motion beats, camera intent, and an occupancy target for every scene.
- Visual: local asset existence, responsive text fitting, platform safe area, cover safe area, contrast, missing media, focal/caption collision, duplicate information, composition occupancy, cover overlap, and black-frame checks.
- Matrix: 6 types × 3 formats × 4 themes = 72 screenshot combinations.

## Failure recovery

- Missing runtime package: run `npm ci` inside the plugin runtime.
- Missing system voice: install `espeak-ng` on Linux or use `files` narration.
- Locked hash mismatch: do not patch provenance. Use `revise` with the corrected script.
- Missing chart source: provide a source or mark it as illustrative.
- Narrated number absent from chart: correct the chart or the locked script, then revise.
- Missing cue: regenerate only that exported cue ID.
- Visual QA failure: adjust the affected scene plan or media, then render only that scene; the cache keeps unaffected frames.
- Storyboard visual change: apply the downloaded patch; wording remains locked and only changed scene caches are invalidated.
- Oversized cache: inspect with `cache-info`; the renderer evicts oldest scene caches at the configured limit, and `clean-cache` removes only the current project's cache.
- Loudness failure: rerun `process-audio` from the raw cues.
