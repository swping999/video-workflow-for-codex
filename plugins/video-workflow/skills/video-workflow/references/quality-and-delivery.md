# Quality and delivery reference

## Staged commands

```bash
<plugin-root>/scripts/video-workflow doctor
<plugin-root>/scripts/video-workflow create --script /absolute/script.txt --output /absolute/project --slug episode --type auto --format portrait --platform douyin --theme editorial --language auto
<plugin-root>/scripts/video-workflow export --project /absolute/project
<plugin-root>/scripts/video-workflow synthesize --project /absolute/project --provider system
<plugin-root>/scripts/video-workflow process-audio --project /absolute/project
<plugin-root>/scripts/video-workflow verify --project /absolute/project
<plugin-root>/scripts/video-workflow preview --project /absolute/project --scenes 2,4
<plugin-root>/scripts/video-workflow render --project /absolute/project --quality high --formats landscape,portrait,social
```

Linux uses `espeak-ng`; macOS uses `say`; Windows uses `System.Speech`. `--provider files` preserves exported cue IDs for authorized external narration.

## Artifact contract

| Artifact | Purpose |
| --- | --- |
| `brief.locked.txt` | Original one-sentence request, when present |
| `script.locked.txt` | Exact approved narration and caption copy |
| `content-plan.locked.json` | Structured visual/data/source plan |
| `story-source.json` | Hashed project source and settings |
| `.media/audio-request.json` | Exact speech jobs plus pronunciation text |
| `.media/image-prompts.json` | Optional, structured scene-asset prompts |
| `assets/voice-manifest.json` | Cue/master/mix hashes, duration, LUFS, and peak |
| `assets/audio-master.wav` | Narration plus optional ducked music/SFX |
| `deliverables/captions.srt` | Exact subtitles |
| `deliverables/captions.vtt` | Exact web subtitles |
| `deliverables/word-timestamps.json` | Supplied or estimated word timing |
| `deliverables/storyboard.html` | Human-readable low-cost review |
| `deliverables/storyboard.json` | Structured storyboard |
| `deliverables/fact-check.*` | Sources, claims, and chart provenance |
| `renders/cover-<format>.png` | Platform-safe cover |
| `renders/final-<format>.mp4` | Format-specific video |
| `renders/final.mp4` | Primary compatibility output |
| `renders/render-report.json` | QA, dimensions, timing, cache, and outputs |

## Quality gates

- Copy: source hashes, exact cue reconstruction, no visual emoji in narration.
- Data: real values, source, missing-value policy, scale, and narration/chart numeric agreement.
- Comparison: exactly two subjects and one or more shared dimensions.
- Promo: verified/source-linked metrics, testimonials, and capability claims.
- Audio: per-scene balance, final mix near -16 LUFS, peak near/below -1.5 dBTP, no overlap or excessive gap.
- Timing: cue order, word ranges, master duration, render duration, and animation completion before speech ends.
- Visual: local asset existence, responsive text fitting, platform safe area, cover safe area, contrast, missing media, and black-frame checks.
- Matrix: 6 types × 3 formats × 4 themes = 72 screenshot combinations.

## Failure recovery

- Missing runtime package: run `npm ci` inside the plugin runtime.
- Missing system voice: install `espeak-ng` on Linux or use `files` narration.
- Locked hash mismatch: do not patch provenance. Use `revise` with the corrected script.
- Missing chart source: provide a source or mark it as illustrative.
- Narrated number absent from chart: correct the chart or the locked script, then revise.
- Missing cue: regenerate only that exported cue ID.
- Visual QA failure: adjust the affected scene plan or media, then render only that scene; the cache keeps unaffected frames.
- Loudness failure: rerun `process-audio` from the raw cues.
