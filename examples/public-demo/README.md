# Public demo

This example is intentionally generic and uses free operating-system narration. It contains no personal voice, presenter, private media, API key, or cloud media dependency.

Rebuild it from the repository root:

```bash
(cd plugins/video-workflow/runtime && npm ci)

plugins/video-workflow/scripts/video-workflow build \
  --brief "Explain why captions drift out of sync" \
  --script examples/public-demo/script.txt \
  --plan examples/public-demo/content-plan.json \
  --output /tmp/video-workflow-public-demo-new \
  --slug caption-sync \
  --type explainer \
  --format portrait \
  --platform douyin \
  --theme editorial \
  --language zh-CN \
  --quality draft
```

The curated `output/` folder shows the resulting compatibility MP4, cover, exact subtitles, storyboard, and fact-check report. Audio intermediates are excluded to keep the repository small; rebuilding regenerates them locally.
