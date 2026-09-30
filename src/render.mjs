/**
 * Cinta core: turn a terminal script into an animated GIF.
 *
 * Harness-agnostic — the pi extension and the CLI both wrap this. Requires
 * Chrome (found automatically or via chromePath) and ffmpeg on PATH.
 *
 * Frames are captured by seeking a deterministic timeline (timeline.mjs), not
 * by sleeping between screenshots: pacing is exact, runs are reproducible, and
 * identical frames collapse into one longer GIF frame.
 */
import { spawn } from "node:child_process";
import { accessSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { DEFAULT_TIMING, framePlan, layout, snapshot } from "./timeline.mjs";

export const DEFAULTS = {
  fps: 12,
  scale: 880,
  width: 1008,
  height: 640,
  font: '"Berkeley Mono Variable", "Berkeley Mono", ui-monospace, Menlo, monospace',
  colors: {
    bg: "#000000",
    panel: "#070707",
    ink: "#eeeeee",
    dim: "#8a8a93",
    faint: "#55555e",
    accent: "#00ffb2",
    border: "#16181a",
    bar: "#101013",
  },
  timing: DEFAULT_TIMING,
};

export function findChrome() {
  const candidates = [
    process.env.CINTA_CHROME_PATH,
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      accessSync(c);
      return c;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

// Colors and the font land inside <style>. Accept only plain color and
// font-family grammar: nothing that closes the rule or loads a url().
const COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\))$/i;
const FONT = /^[\w\s"',.-]+$/;
function cssValue(name, value, grammar) {
  const s = String(value).trim();
  if (!grammar.test(s)) throw new Error(`${name}: invalid CSS value ${JSON.stringify(s)}`);
  return s;
}

function intIn(name, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}, got ${JSON.stringify(value)}`);
  }
  return value;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// `sub` may carry intended <b>/<i> formatting: escape everything, then re-allow a few tags.
const escSub = (s) => esc(s).replace(/&lt;(\/?)(b|i|em|strong|code)&gt;/g, "<$1$2>");

/**
 * The capture page, also written next to every GIF as its regenerable source.
 * Opened directly in a browser it loops the animation on its own; the recorder
 * loads it with ?capture and drives `__cinta.seek(ms)` frame by frame.
 */
export function buildHtml(timeline, opts = {}) {
  const c = Object.fromEntries(
    Object.entries({ ...DEFAULTS.colors, ...(opts.colors ?? {}) }).map(([k, v]) => [k, cssValue(`colors.${k}`, v, COLOR)]),
  );
  const font = cssValue("font", opts.font ?? DEFAULTS.font, FONT);
  const title = opts.title ?? opts.name ?? "";
  const header = opts.name || opts.tag
    ? `<div class="wordmark"><span class="name">${esc(opts.name ?? "")}</span><span class="tag">${esc(opts.tag ?? "")}</span></div>`
    : "";
  const sub = opts.sub?.length ? `<div class="sub">${opts.sub.map(escSub).join("<br />")}</div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || "cinta")}</title><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;height:100%;background:${c.bg}}
body{display:flex;flex-direction:column;font-family:${font};color:${c.ink};padding:48px 56px;-webkit-font-smoothing:antialiased;overflow:hidden}
.wordmark{display:flex;align-items:baseline;gap:14px;margin-bottom:8px}
.wordmark .name{font-size:28px;font-weight:700;letter-spacing:-.5px}
.wordmark .tag{color:${c.accent};font-size:13px;font-weight:600}
.sub{color:${c.dim};font-size:14px;line-height:1.5}
.sub b{color:${c.ink};font-weight:600}
.term{flex:1;min-height:0;display:flex;flex-direction:column;margin-top:28px;background:${c.panel};border:1px solid ${c.border};border-radius:12px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.wordmark+.term{margin-top:20px}body>.term:first-child{margin-top:0}
.term-bar{display:flex;align-items:center;gap:8px;padding:12px 16px;background:${c.bar};border-bottom:1px solid ${c.border}}
.dot{width:11px;height:11px;border-radius:50%}.dot.r{background:#ff5f57}.dot.y{background:#febc2e}.dot.g{background:#28c840}
.term-title{margin-left:10px;color:${c.faint};font-size:12px}
.term-body{flex:1;min-height:0;overflow:hidden;padding:20px 22px 24px;font-size:13.5px;line-height:1.55}
.p{color:${c.accent};font-weight:700}.cmd{color:${c.ink}}.out{color:${c.dim};white-space:pre-wrap}.ok{color:${c.accent}}
.line{display:block}.cursor{display:inline-block;width:8px;height:16px;background:${c.accent};vertical-align:-2px}
.cursor.off{visibility:hidden}.gap{height:14px}
</style></head><body>
${header}${sub}
<div class="term"><div class="term-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="term-title">${esc(title)}</span></div>
<div class="term-body" id="body"></div></div>
<script>
const TIMELINE=${JSON.stringify(timeline).replace(/</g, "\\u003c")};
const snapshot=${snapshot.toString()};
const body=document.getElementById("body");
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function cursor(on){return el("span","cursor"+(on?"":" off"));}
function paint(rows){
  body.replaceChildren(...rows.map((r)=>{
    if(r.k==="cmd"){const d=el("div");d.append(el("span","p","$")," ",el("span","cmd",r.text));if(r.cursor)d.append(cursor(true));return d;}
    if(r.k==="out"){const d=el("div");d.append(el("span","out "+r.cls,r.text));return d;}
    if(r.k==="stream"){const d=el("div","out");for(const l of r.lines)d.append(el("span","line",l));return d;}
    if(r.k==="gap")return el("div","gap");
    const d=el("div");d.append(el("span","p","▊"),cursor(r.cursor));return d;
  }));
  body.scrollTop=body.scrollHeight;
}
window.__cinta={seek:(ms)=>paint(snapshot(TIMELINE,ms)),totalMs:TIMELINE.totalMs};
if(new URLSearchParams(location.search).has("capture"))__cinta.seek(0);
else{const t0=performance.now();const loop=(now)=>{__cinta.seek((now-t0)%TIMELINE.totalMs);requestAnimationFrame(loop);};requestAnimationFrame(loop);}
</script></body></html>`;
}

function run(cmd, args, signal) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], signal });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) =>
      rejectPromise(e.code === "ENOENT" ? new Error(`${cmd} not found on PATH — install it (brew install ${cmd})`) : e),
    );
    child.on("close", (code) =>
      code === 0 ? resolvePromise() : rejectPromise(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`)),
    );
  });
}

/**
 * Render a terminal script to an animated GIF.
 * Returns { gif, html, frames, durationMs, width, height, bytes }.
 */
export async function renderGif(script, options = {}) {
  const fps = intIn("fps", options.fps ?? DEFAULTS.fps, 4, 30);
  const scale = intIn("scale", options.scale ?? DEFAULTS.scale, 160, 2400);
  const width = intIn("width", options.width ?? DEFAULTS.width, 320, 2400);
  const height = intIn("height", options.height ?? DEFAULTS.height, 200, 2400);
  const out = options.out ?? "cinta.gif";
  const signal = options.signal;
  signal?.throwIfAborted();

  const timeline = layout(script, options.timing);
  const html = buildHtml(timeline, options);
  const plan = framePlan(timeline, fps);

  const chromePath = options.chromePath ?? findChrome();
  if (!chromePath) throw new Error("Chrome not found — install Chrome or set CINTA_CHROME_PATH");

  const dir = await mkdtemp(join(tmpdir(), "cinta-"));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const htmlPath = join(dir, "page.html");
    await writeFile(htmlPath, html);
    await page.goto(`${pathToFileURL(htmlPath).href}?capture`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    // GIF delays are whole centiseconds; place each frame on the centisecond
    // grid by its absolute start so rounding never accumulates into drift.
    const cs = (ms) => Math.round(ms / 10);
    const list = ["ffconcat version 1.0"];
    for (let i = 0; i < plan.length; i++) {
      signal?.throwIfAborted();
      await page.evaluate((ms) => window.__cinta.seek(ms), plan[i].ms);
      const file = `f${String(i).padStart(4, "0")}.png`;
      await writeFile(join(dir, file), await page.screenshot({ type: "png" }));
      const end = i + 1 < plan.length ? plan[i + 1].ms : timeline.totalMs;
      // framerate 100 gives each still a 1/100s timebase; the image default (25fps) would snap delays to 40ms.
      list.push(`file '${file}'`, "option framerate 100", `duration ${(Math.max(1, cs(end) - cs(plan[i].ms)) / 100).toFixed(2)}`);
    }
    // The concat demuxer ignores the last entry's duration unless it is repeated.
    list.push(list.at(-3), list.at(-2));
    const listPath = join(dir, "frames.ffconcat");
    await writeFile(listPath, list.join("\n") + "\n");

    const vf =
      `scale=${scale}:-1:flags=lanczos,split[a][b];` +
      `[a]palettegen=max_colors=128:stats_mode=diff[p];` +
      `[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
    await mkdir(dirname(out), { recursive: true });
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-filter_complex", vf, "-fps_mode", "vfr", "-loop", "0", out], signal);

    const htmlOut = join(dirname(out), `${basename(out).replace(/\.gif$/i, "")}.html`);
    await writeFile(htmlOut, html);
    const s = await stat(out);
    return {
      gif: out,
      html: htmlOut,
      frames: plan.length,
      durationMs: Math.round(timeline.totalMs),
      width: scale,
      height: Math.round((scale * height) / width),
      bytes: s.size,
    };
  } finally {
    await browser?.close().catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

