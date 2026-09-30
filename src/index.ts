/**
 * cinta — animated terminal-capture GIFs for documentation.
 *
 * Registers:
 *   - a `cinta` tool the agent calls with a terminal script
 *   - a `/cinta <text>` command for quick, human-driven GIFs
 *
 * The same renderer ships as a standalone `cinta` CLI (src/cli.mjs).
 * Requires Chrome (found automatically, or CINTA_CHROME_PATH) and ffmpeg.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { isAbsolute, join, resolve } from "node:path";
import { renderGif, DEFAULTS } from "./render.mjs";

const StepSchema = Type.Union([
  Type.Object({ type: Type.Literal("cmd"), text: Type.String({ description: "Command typed after the $" }) }),
  Type.Object({
    type: Type.Literal("out"),
    text: Type.String(),
    cls: Type.Optional(Type.String({ description: '"ok" renders in the accent color' })),
  }),
  Type.Object({ type: Type.Literal("stream"), lines: Type.Array(Type.String()) }),
  Type.Object({ type: Type.Literal("gap") }),
  Type.Object({ type: Type.Literal("pause"), ms: Type.Integer({ minimum: 0, description: "Hold the current frame, ms" }) }),
  Type.Object({ type: Type.Literal("done") }),
]);

const Color = Type.Optional(Type.String({ description: "CSS color, e.g. #00ffb2" }));

const Params = Type.Object({
  script: Type.Array(StepSchema, {
    description:
      "Terminal script, in order. cmd = typed command; out = output block; stream = lines appearing one at a time; gap = spacing; pause = hold; done = final blinking cursor.",
  }),
  out: Type.Optional(Type.String({ description: "Output .gif path, relative to the working directory. Default: cinta.gif" })),
  name: Type.Optional(Type.String({ description: "Wordmark text above the terminal window" })),
  tag: Type.Optional(Type.String({ description: "Accent-colored tag next to the wordmark" })),
  title: Type.Optional(Type.String({ description: "Terminal window title" })),
  sub: Type.Optional(Type.Array(Type.String(), { description: "Subtitle lines under the wordmark" })),
  fps: Type.Optional(Type.Integer({ minimum: 4, maximum: 30 })),
  scale: Type.Optional(Type.Integer({ minimum: 160, maximum: 2400, description: "Output GIF width in px (default 880)" })),
  width: Type.Optional(Type.Integer({ minimum: 320, maximum: 2400, description: "Capture viewport width in px (default 1008)" })),
  height: Type.Optional(Type.Integer({ minimum: 200, maximum: 2400, description: "Capture viewport height in px (default 640); longer output scrolls" })),
  font: Type.Optional(Type.String({ description: "CSS font-family stack" })),
  colors: Type.Optional(
    Type.Object({ bg: Color, panel: Color, ink: Color, dim: Color, faint: Color, accent: Color, border: Color, bar: Color }),
  ),
  timing: Type.Optional(
    Type.Object({
      typeMs: Type.Optional(Type.Integer({ minimum: 1, description: "Per typed character (default 34)" })),
      lineMs: Type.Optional(Type.Integer({ minimum: 1, description: "Per streamed line (default 90)" })),
      afterCmdMs: Type.Optional(Type.Integer({ minimum: 0, description: "After each command (default 260)" })),
      endHoldMs: Type.Optional(Type.Integer({ minimum: 0, description: "Final hold before looping (default 1600)" })),
    }),
  ),
});

type RenderParams = Omit<Static<typeof Params>, "script">;

const DOC_HINT = [
  "Compose the script from the tool's real, verified output — run the command first if unsure.",
  "Keep it short: 2–4 commands, ≤8 streamed lines total. A 6–10s GIF reads best.",
  "Pass an absolute or repo-relative `out` path under assets/ when documenting a repo.",
].join(" ");

export default function cinta(pi: ExtensionAPI) {
  function run(script: Static<typeof Params>["script"], params: RenderParams, cwd: string, signal?: AbortSignal) {
    const out = params.out ? (isAbsolute(params.out) ? params.out : resolve(cwd, params.out)) : join(cwd, "cinta.gif");
    return renderGif(script, { ...params, out, signal });
  }

  pi.registerTool({
    name: "cinta",
    label: "Cinta",
    description:
      "Render an animated terminal-capture GIF (self-typing commands, streamed output, blinking cursor) for documentation. " +
      "The script is replayed in a styled HTML terminal — Berkeley Mono on pure black with a mint accent — recorded via headless Chrome, assembled with ffmpeg. " +
      DOC_HINT,
    promptSnippet: "Render an animated terminal-capture GIF for documentation",
    promptGuidelines: [
      "Use cinta when the user asks for a demo GIF, an animated README hero, or an asciicast-style screencast.",
      "Build cinta scripts from the tool's real output; run the command first if you haven't seen its output.",
      "Keep cinta GIFs under ~10 seconds: 2–4 commands, few streamed lines.",
    ],
    parameters: Params,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "Recording terminal session…" }], details: {} });
      const { script, ...rest } = params;
      const result = await run(script, rest, ctx.cwd, signal);
      const kb = Math.round(result.bytes / 1024);
      const secs = (result.durationMs / 1000).toFixed(1);
      return {
        content: [
          {
            type: "text",
            text: `GIF written: ${result.gif}\n${secs}s · ${result.frames} frames · ${result.width}×${result.height} · ${kb}KB · infinite loop\nRegenerable HTML source (opens as a live animation): ${result.html}`,
          },
        ],
        details: { ...result },
      };
    },
  });

  pi.registerCommand("cinta", {
    description: "Quick animated terminal GIF: /cinta <what to show>",
    handler: async (args, ctx) => {
      const text = args.trim();
      if (!text) {
        ctx.ui.notify("Usage: /cinta <what the GIF should show>", "warning");
        return;
      }
      pi.sendUserMessage(
        `Use the cinta tool to create an animated terminal GIF showing: ${text}. ` +
          "Compose the script from the command's real output, save it under assets/ if this is a repo, and show me the result path.",
      );
    },
  });
}

export { renderGif, DEFAULTS };
