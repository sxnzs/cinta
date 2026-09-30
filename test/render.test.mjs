import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findChrome, renderGif } from "../src/render.mjs";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const skip = !findChrome() ? "Chrome not found" : !hasFfmpeg ? "ffmpeg not found" : false;

test("renders a looping GIF with the mint accent and merged frames", { skip, timeout: 60_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "cinta-smoke-"));
  const out = join(dir, "nested", "smoke.gif");
  try {
    const result = await renderGif(
      [{ type: "cmd", text: "echo ok" }, { type: "out", text: "ok", cls: "ok" }, { type: "done" }],
      { out, width: 360, height: 240, scale: 360, fps: 10, timing: { endHoldMs: 1200 } },
    );
    const gif = await readFile(out);
    assert.equal(result.gif, out);
    assert.equal(gif.subarray(0, 6).toString(), "GIF89a");
    assert.ok(gif.includes(Buffer.from("NETSCAPE2.0")), "GIF should loop");
    assert.ok(gif.includes(Buffer.from([0x00, 0xff, 0xb2])), "palette should contain the mint accent");
    assert.ok(result.frames < Math.ceil((result.durationMs / 1000) * 10), "identical frames should merge");
    const html = await readFile(result.html, "utf8");
    assert.ok(html.includes("__cinta"), "regenerable HTML is written next to the GIF");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an aborted signal stops the render", { skip, timeout: 60_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "cinta-abort-"));
  try {
    await assert.rejects(
      renderGif([{ type: "cmd", text: "sleep" }], { out: join(dir, "x.gif"), signal: AbortSignal.abort() }),
      { name: "AbortError" },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
