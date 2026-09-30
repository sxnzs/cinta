import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const cli = new URL("../src/cli.mjs", import.meta.url).pathname;
const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { input, encoding: "utf8" });

test("no arguments prints usage and exits 2", () => {
  const r = run([]);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /usage: cinta/);
});

test("--version prints the package version", () => {
  const r = run(["--version"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^\d+\.\d+\.\d+/);
});

test("bad scripts fail with a readable message", () => {
  const r = run(["-"], JSON.stringify([{ type: "nope" }]));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cinta: step 0: unknown type "nope"/);
});
