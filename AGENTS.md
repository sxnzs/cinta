# cinta

Pi extension and CLI that render terminal scripts to animated GIFs. Public
home: `github.com/sxnzs/cinta`; npm name `@ssainzs/cinta`. The `sainzs`
GitHub account is invisible to visitors, so nothing here links to it.

- `src/timeline.mjs` is the source of truth for timing. `snapshot` is
  serialized into the capture page with `Function.prototype.toString`, so it
  must stay self-contained (no imports or module-scope references).
- `src/render.d.mts` hand-types `render.mjs`; update it with any option change,
  along with the tool schema in `src/index.ts` and the README options table.
- `assets/hero.gif` is regenerated from `assets/hero.json`; its output lines
  are real CLI output, not invented.
- Pushing to GitHub and publishing to npm are Santiago's calls.

`npm run verify` is done; it needs Chrome and ffmpeg for the render tests.
