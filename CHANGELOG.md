# Changelog

## [Unreleased]

## [0.2.0] — Unpublished

- Deterministic capture: frames are rendered by seeking a timeline to exact
  times instead of sleeping between screenshots. Pacing no longer depends on
  screenshot speed, and the "animation did not complete" failure is gone.
- Identical frames merge into one longer GIF frame; renders are faster and
  holds are nearly free in file size.
- `cinta` CLI: render from a JSON script without pi (`cinta demo.json -o demo.gif`).
- The pi tool now exposes `width`, `height`, `font`, `colors`, and `timing`.
- New `pause` step. Long output scrolls inside the window.
- The header block is omitted when `name`, `tag`, and `sub` are empty.
- The `.html` written next to each GIF plays the animation live in a browser.
- Tool calls honor pi's abort signal; Chrome and ffmpeg errors say what to install.
- Colors and font are validated so they cannot break out of the stylesheet.
- Home moved to github.com/sxnzs/cinta. Requires Node 20+ and ffmpeg 5.1+.

## [0.1.2] — Unpublished

- Version 0.1.2 was declared in the package manifest but never published to
  npm; the latest npm release remains 0.1.0.
