# Content-plan reference

Use `schemaVersion: 1`. The number of `scenes` must equal the number of blank-line-separated script paragraphs. A scene may omit visual details and use the type default; if it supplies `narration`, that text must exactly equal the locked paragraph.

Every scene may also set `captionPosition` (`bottom`, `top`, `left`, or `right`) and optional director intent. The runtime fills missing direction fields from the visual semantics:

```json
{
  "captionPosition": "top",
  "direction": {
    "focus": "water molecule",
    "metaphor": "molecular-assembly",
    "symbol": "H₂O",
    "motion": ["assemble", "transform", "pulse"],
    "camera": {"shot": "diagram-medium", "movement": "follow-path"},
    "composition": {"anchor": "center", "occupancyTarget": 0.68}
  }
}
```

Use direction only to clarify the visual explanation. Do not repeat narration as decorative labels.

## Shared fields

```json
{
  "schemaVersion": 1,
  "title": "Episode title",
  "type": "data-story",
  "sources": [
    {"id": "report", "title": "Annual report", "url": "https://example.com/report"}
  ],
  "claims": [
    {"text": "Usage grew 31%", "kind": "metric", "sourceId": "report", "verified": true}
  ],
  "brand": {
    "name": "Product",
    "logo": "/absolute/logo.svg",
    "colors": ["#2563EB", "#111827"],
    "fonts": ["Inter"],
    "cta": "Learn more"
  },
  "pronunciation": [{"match": "MCP", "spoken": "M C P"}],
  "media": {
    "music": {"file": "/absolute/music.wav", "volume": 0.15, "ducking": 0.28},
    "sfx": [{"file": "/absolute/click.wav", "sceneId": "scene-02", "offset": 0.2, "volume": 0.5}]
  },
  "scenes": []
}
```

Metric, testimonial, and capability claims require both `verified: true` and a valid `sourceId`. The renderer never fabricates missing proof.

## Explainer

Visual kinds: `definition`, `mechanism`, `cause-effect`, `timeline`, `structure`, `analogy`, `misconception`, `cycle`.

```json
{"visual":{"kind":"cause-effect","nodes":[{"id":"a","label":"Cause"},{"id":"b","label":"Effect"}],"relation":"causes"}}
```

## Listicle

Use global ranks across scenes. Include an icon or local asset when available.

```json
{"visual":{"kind":"list-item","item":{"rank":1,"name":"Item","icon":"★","reason":"Why it matters","audience":"Who it suits","pros":["Fast"],"cons":["Limited"],"score":4.7,"asset":"/absolute/item.svg"}}}
```

For an overview, use `{"kind":"list-overview","items":[...]}` with the same item fields.

## Workflow

Visual kinds: `process`, `decision`, `checkpoint`, `demo`, `acceptance`.

```json
{"visual":{"kind":"decision","current":2,"steps":[{"label":"Import","input":"CSV","operation":"Parse","output":"Rows","check":"No missing values","branch":"Retry on error","estimate":"2 min","caution":"Keep headers","asset":"/absolute/screenshot.png"}]}}
```

## Comparison

Always use two subjects and shared dimensions. Modes: `comparison-table`, `before-after`, `tradeoff`, `radar`, `decision-tree`.

```json
{"comparison":{"subjects":["A","B"],"dimensions":[{"name":"Price","a":"Free","b":"Paid"},{"name":"Difficulty","a":"Low","b":"Medium"}],"verdict":"Choose A to start"}}
```

Radar dimensions should use numeric `a`, `b`, and optional `max`.

## Promo

Structure scenes as `pain → solution → feature-demo → proof → cta`. Put product screenshots or clips in `asset`. Keep proof in sourced claims; do not synthesize testimonials, customers, prices, or performance numbers.

## Data story

CSV uses the first column as labels and a numeric `value`/`数值`/`百分比` column. JSON may supply the chart directly:

```json
{
  "type": "bar",
  "labels": ["2024", "2025", "2026"],
  "values": [18, 31, 46],
  "unit": "%",
  "sourceId": "report",
  "range": "2024–2026",
  "sort": "asc",
  "scale": "linear",
  "domain": [0, 50],
  "missing": "error",
  "annotations": [{"label":"Launch","index":1}]
}
```

Chart types: `bar`, `line`, `area`, `ranking`. Missing-value policies: `error`, `skip`, `zero`, `interpolate`. Set `illustrative: true` only for an explicitly labeled non-data trend illustration.
