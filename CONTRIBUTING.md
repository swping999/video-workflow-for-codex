# Contributing

Contributions are welcome when they preserve the workflow's core contract:

1. narration and captions come from the same locked cues;
2. generated episodes never overwrite an existing project;
3. visual-only labels are not silently inserted into speech;
4. rendering is blocked when required media or timing checks fail;
5. personal voice and identity references remain outside the repository.
6. the default build remains account-free and does not call cloud speech or image APIs.
7. real charts use structured values and source provenance; illustrative trends are labeled;
8. comparisons use the same named dimensions for both subjects;
9. metrics, testimonials, and capability claims are never fabricated;
10. platform safe areas, responsive fitting, and format-specific layout remain testable.

Run `npm run check` before opening a pull request. Run `npm run check:full` for changes to layouts, themes, animation, charting, assets, audio mixing, or rendering. The full suite captures all 72 type/format/theme combinations. New render adapters should be optional and documented. New examples must use project-owned, synthetic, or properly licensed assets.
