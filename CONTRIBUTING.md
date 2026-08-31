# Contributing

Contributions are welcome when they preserve the workflow's core contract:

1. narration and captions come from the same locked cues;
2. generated episodes never overwrite an existing project;
3. visual-only labels are not silently inserted into speech;
4. rendering is blocked when required media or timing checks fail;
5. personal voice and identity references remain outside the repository.

Run `npm run check` before opening a pull request. New render adapters should be optional and documented. New examples must use project-owned, synthetic, or properly licensed assets.
