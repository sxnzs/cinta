import test from "node:test";
import assert from "node:assert/strict";
import { framePlan, layout, snapshot } from "../src/timeline.mjs";

const timing = { typeMs: 10, lineMs: 20, afterCmdMs: 50, endHoldMs: 100 };

test("layout places steps back to back and adds the end hold", () => {
  const tl = layout(
    [{ type: "cmd", text: "ls" }, { type: "stream", lines: ["a", "b"] }, { type: "pause", ms: 30 }, { type: "done" }],
    timing,
  );
  assert.deepEqual(tl.steps.map((s) => [s.type, s.at]), [["cmd", 0], ["stream", 70], ["done", 140]]);
  assert.equal(tl.totalMs, 240);
});

test("layout rejects empty scripts and unknown steps", () => {
  assert.throws(() => layout([]), /non-empty/);
  assert.throws(() => layout([{ type: "cmd", text: "x" }, { type: "typo" }]), /step 1: unknown type "typo"/);
});

test("snapshot types a command, then drops its cursor after the hold", () => {
  const tl = layout([{ type: "cmd", text: "héllo" }], timing);
  assert.deepEqual(snapshot(tl, 0), [{ k: "cmd", text: "h", cursor: true }]);
  assert.deepEqual(snapshot(tl, 25), [{ k: "cmd", text: "hél", cursor: true }]);
  assert.deepEqual(snapshot(tl, 99), [{ k: "cmd", text: "héllo", cursor: true }]);
  assert.deepEqual(snapshot(tl, 100), [{ k: "cmd", text: "héllo", cursor: false }]);
});

test("snapshot streams lines and blinks the final cursor", () => {
  const tl = layout([{ type: "stream", lines: ["a", "b", "c"] }, { type: "done" }], timing);
  assert.deepEqual(snapshot(tl, 25)[0].lines, ["a", "b"]);
  assert.equal(snapshot(tl, 60).at(-1).cursor, true);
  assert.equal(snapshot(tl, 60 + 600).at(-1).cursor, false);
  assert.equal(snapshot(tl, 60 + 1100).at(-1).cursor, true);
});

test("zero delays do not divide by zero", () => {
  const tl = layout([{ type: "cmd", text: "ab" }, { type: "stream", lines: ["x"] }], { typeMs: 0, lineMs: 0 });
  assert.deepEqual(snapshot(tl, tl.totalMs).at(-1), { k: "stream", lines: ["x"] });
});

test("framePlan merges identical frames without losing time", () => {
  const tl = layout([{ type: "cmd", text: "ls" }, { type: "out", text: "ok" }], { ...timing, endHoldMs: 2000 });
  const plan = framePlan(tl, 10);
  const total = plan.reduce((s, f) => s + f.durationMs, 0);
  assert.ok(Math.abs(total - Math.ceil(tl.totalMs / 100) * 100) < 1e-6);
  assert.ok(plan.length < tl.totalMs / 100 / 2, `expected merged frames, got ${plan.length}`);
  for (let i = 1; i < plan.length; i++) {
    assert.notDeepEqual(snapshot(tl, plan[i].ms), snapshot(tl, plan[i - 1].ms));
  }
});
