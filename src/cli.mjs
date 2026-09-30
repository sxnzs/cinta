#!/usr/bin/env node
/**
 * cinta CLI — the same renderer without pi.
 *
 *   cinta demo.json -o assets/demo.gif
 *   echo '[{"type":"cmd","text":"ls"},{"type":"done"}]' | cinta - -o ls.gif
 *
 * The JSON is either a bare script array or { "script": [...], ...options }
 * with the tool's options (name, tag, title, sub, colors, font, timing, ...).
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { renderGif } from "./render.mjs";

const USAGE = `usage: cinta <script.json | -> [-o out.gif] [--fps n] [--scale px]

  script.json   a script array, or { "script": [...], ...options }; - reads stdin
  -o, --out     output GIF path (default: the JSON's "out", else cinta.gif)
  --fps         frames per second, 4–30 (default 12)
  --scale       output width in px (default 880)

Steps: cmd {text} · out {text, cls:"ok"} · stream {lines} · gap · pause {ms} · done
Needs Chrome (or CINTA_CHROME_PATH) and ffmpeg.`;

async function readStdin() {
  let s = "";
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      fps: { type: "string" },
      scale: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.version) {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    console.log(pkg.version);
    return;
  }
  if (values.help || positionals.length !== 1) {
    console.log(USAGE);
    process.exitCode = values.help ? 0 : 2;
    return;
  }
  const [src] = positionals;
  const doc = JSON.parse(src === "-" ? await readStdin() : await readFile(src, "utf8"));
  const { script, ...options } = Array.isArray(doc) ? { script: doc } : doc;
  const int = (name, v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer`);
    return n;
  };
  if (values.out) options.out = values.out;
  if (values.fps) options.fps = int("fps", values.fps);
  if (values.scale) options.scale = int("scale", values.scale);

  const r = await renderGif(script, options);
  const secs = (r.durationMs / 1000).toFixed(1);
  console.log(`${r.gif}  ${secs}s · ${r.frames} frames · ${r.width}×${r.height} · ${Math.round(r.bytes / 1024)}KB`);
  console.log(`${r.html}  (regenerable source; open it to watch the animation live)`);
}

main().catch((e) => {
  console.error(`cinta: ${e.message}`);
  process.exitCode = 1;
});
