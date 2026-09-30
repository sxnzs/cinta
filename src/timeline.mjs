/**
 * Cinta timeline: a terminal script as a pure function of time.
 *
 * `layout` fixes when every step starts; `snapshot` says what the terminal
 * shows at any millisecond. The renderer seeks to exact frame times instead of
 * sleeping, so captures are deterministic and identical frames can be merged.
 *
 * `snapshot` is also serialized into the page (see render.mjs), so it must
 * stay self-contained: no imports, no closures over module scope.
 */

export const DEFAULT_TIMING = { typeMs: 34, lineMs: 90, afterCmdMs: 260, endHoldMs: 1600 };

/** Assign start times to each step. Returns { steps, totalMs }. */
export function layout(script, timing = {}) {
  if (!Array.isArray(script) || script.length === 0) {
    throw new Error("script must be a non-empty array of steps");
  }
  const t = { ...DEFAULT_TIMING, ...timing };
  // Zero per-char/per-line delays would divide by zero in snapshot().
  t.typeMs = Math.max(1, t.typeMs);
  t.lineMs = Math.max(1, t.lineMs);
  const steps = [];
  let at = 0;
  script.forEach((step, i) => {
    switch (step?.type) {
      case "cmd": {
        const chars = Array.from(String(step.text ?? ""));
        steps.push({ type: "cmd", at, chars, typedMs: chars.length * t.typeMs, typeMs: t.typeMs, holdMs: t.afterCmdMs });
        at += chars.length * t.typeMs + t.afterCmdMs;
        break;
      }
      case "out":
        steps.push({ type: "out", at, text: String(step.text ?? ""), cls: step.cls === "ok" ? "ok" : "" });
        break;
      case "stream": {
        const lines = (step.lines ?? []).map(String);
        steps.push({ type: "stream", at, lines, lineMs: t.lineMs });
        at += lines.length * t.lineMs;
        break;
      }
      case "gap":
        steps.push({ type: "gap", at });
        break;
      case "pause":
        at += Math.max(0, Number(step.ms) || 0);
        break;
      case "done":
        steps.push({ type: "done", at });
        break;
      default:
        throw new Error(`step ${i}: unknown type ${JSON.stringify(step?.type)}`);
    }
  });
  return { steps, totalMs: at + t.endHoldMs };
}

/** What the terminal shows at `ms`: a list of plain, JSON-comparable rows. */
export function snapshot(timeline, ms) {
  const BLINK = 1100; // cursor blink period, ms
  const rows = [];
  for (const s of timeline.steps) {
    if (s.at > ms) break;
    const dt = ms - s.at;
    if (s.type === "cmd") {
      const typed = Math.min(s.chars.length, Math.floor(dt / s.typeMs) + 1);
      rows.push({ k: "cmd", text: s.chars.slice(0, typed).join(""), cursor: dt < s.typedMs + s.holdMs });
    } else if (s.type === "out") {
      rows.push({ k: "out", text: s.text, cls: s.cls });
    } else if (s.type === "stream") {
      rows.push({ k: "stream", lines: s.lines.slice(0, Math.floor(dt / s.lineMs) + 1) });
    } else if (s.type === "gap") {
      rows.push({ k: "gap" });
    } else if (s.type === "done") {
      rows.push({ k: "done", cursor: dt % BLINK < BLINK / 2 });
    }
  }
  return rows;
}

/**
 * Frame plan at `fps`: consecutive identical snapshots merge into one frame
 * with a longer duration. Returns [{ ms, durationMs }] — seek to `ms`,
 * screenshot, hold for `durationMs`.
 */
export function framePlan(timeline, fps) {
  const step = 1000 / fps;
  const count = Math.max(1, Math.ceil(timeline.totalMs / step));
  const plan = [];
  let prev = null;
  for (let i = 0; i < count; i++) {
    const ms = i * step;
    const key = JSON.stringify(snapshot(timeline, ms));
    if (key === prev) plan[plan.length - 1].durationMs += step;
    else plan.push({ ms, durationMs: step });
    prev = key;
  }
  return plan;
}
