import test from "node:test";
import assert from "node:assert/strict";
import { buildHtml } from "../src/render.mjs";
import { layout } from "../src/timeline.mjs";

const tl = layout([{ type: "cmd", text: "</script><script>alert(1)</script>" }, { type: "done" }]);

test("script text cannot break out of the page script", () => {
  const html = buildHtml(tl, {});
  assert.equal(html.match(/<\/script>/g).length, 1);
});

test("header text is escaped; sub keeps only formatting tags", () => {
  const html = buildHtml(tl, { name: "<img src=x>", sub: ["<b>bold</b> <img src=x onerror=1>"] });
  assert.ok(html.includes("&lt;img src=x&gt;</span>"));
  assert.ok(html.includes("<b>bold</b> &lt;img src=x onerror=1&gt;"));
});

test("colors and font cannot escape the stylesheet", () => {
  assert.throws(() => buildHtml(tl, { colors: { accent: "red}</style><script>" } }), /colors.accent/);
  assert.throws(() => buildHtml(tl, { font: "x;} body{display:none" }), /font/);
  assert.doesNotThrow(() => buildHtml(tl, { colors: { accent: "rgb(0, 255, 178)" }, font: '"Iosevka", monospace' }));
});

test("the header is omitted when there is nothing to show", () => {
  const html = buildHtml(tl, {});
  assert.ok(!html.includes('class="wordmark"'));
  assert.ok(!html.includes('class="sub"'));
});
