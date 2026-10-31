#!/usr/bin/env node
// The Ask answer renderer (src/lib/neuropal/reader/markdown.tsx) must stay
// linear: answers full of unmatched markers ("[[[[…", "*a *a …", "<<<<…")
// once froze the tab for seconds. Every case below must render, and turn into
// plain text, in well under a second, and the parser's own searches must scan
// a bounded number of characters. Ordinary Markdown must still come out the
// same, and only http(s) links may become links.
//   node scripts/qa/markdown-timing.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const platform = resolve(here, "../..");
const require = createRequire(join(platform, "package.json"));
const ts = require("typescript");
const url = (p) => JSON.stringify(pathToFileURL(p).href);

// Strip the types and JSX of the two source files into a temporary folder.
const dir = mkdtempSync(join(tmpdir(), "np-md-"));
const compile = (file) =>
  ts.transpileModule(readFileSync(resolve(platform, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
writeFileSync(join(dir, "math.mjs"), compile("src/lib/neuropal/reader/math.ts"));
writeFileSync(
  join(dir, "markdown.mjs"),
  compile("src/lib/neuropal/reader/markdown.tsx")
    .replace(/from "\.\/math"/, 'from "./math.mjs"')
    .replace(/from "react\/jsx-runtime"/, `from ${url(require.resolve("react/jsx-runtime"))}`),
);
const { Markdown, markdownToPlain } = await import(pathToFileURL(join(dir, "markdown.mjs")).href);
const { renderToStaticMarkup } = await import(pathToFileURL(require.resolve("react-dom/server")).href);
const { createElement } = await import(pathToFileURL(require.resolve("react")).href);
rmSync(dir, { recursive: true, force: true });

let failures = 0;
const ok = (good, msg) => {
  if (!good) failures += 1;
  console.log(`${good ? "✓" : "✗"} ${msg}`);
};

// ---- timing --------------------------------------------------------------------------
// Generous for a busy machine: the quadratic cases this guards against took 0.9–12 s,
// and the read-count bound below is the exact check.
const LIMIT_MS = 500;
const N = 60000; // the renderer's own cap
const fill = (unit) => unit.repeat(Math.floor(N / unit.length));
const CASES = {
  "60 000 “[”": fill("["),
  "“[” then one “]” at the end": fill("[").slice(1) + "]",
  "two-byte text, 60 000 “[”": `“${fill("[").slice(1)}`,
  "“[a](” with no “)”": fill("[a]("),
  "“*a ” (emphasis never closed)": fill("*a "),
  "“_a ” (emphasis never closed)": fill("_a "),
  "“\\**” (escaped bold)": fill("\\\\**"),
  "60 000 “<”": fill("<"),
  "“<” then one “>” at the end": fill("<").slice(1) + ">",
  "a backtick run in prose": `a${fill("`").slice(1)}`,
  "“`a” (code never closed)": fill("`a``"),
  "“$a ” (maths never closed)": fill("$a "),
  "“*_” mixed": fill("*_"),
  "a table rule line of spaces": `a|b\n${" ".repeat(N - 5)}x`,
  "a fence line of spaces": `\`\`\`${" ".repeat(N - 4)}!`,
  "a heading with a long gap": `# a${" ".repeat(N - 5)}b`,
  "60 000 line breaks": "\n".repeat(N),
  "a long ordinary answer": fill("Some **bold** text, a [link](https://example.com/a) and `code` [1].\n\n- one *item*\n- two\n\n"),
};

// Characters scanned by String.prototype.indexOf while `fn` runs (the
// parser's searches all go through it). Stops early past `limit`.
const TOO_MANY = new Error("too many characters read");
function scanned(fn, limit) {
  const original = String.prototype.indexOf;
  let total = 0;
  String.prototype.indexOf = function (search, from) {
    const start = Math.max(0, Math.floor(Number(from) || 0));
    const at = original.call(this, search, from);
    total += (at < 0 ? this.length : at) - Math.min(start, this.length);
    if (total > limit) throw TOO_MANY;
    return at;
  };
  try {
    fn();
  } catch (e) {
    if (e !== TOO_MANY) throw e;
  } finally {
    String.prototype.indexOf = original;
  }
  return total;
}

const time = (fn) => {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
};

for (const [name, text] of Object.entries(CASES)) {
  const props = { text, onCitation: () => undefined, citationCount: 3, citationLabel: (n) => `p. ${n}` };
  const render = () => Markdown(props);
  const plain = () => markdownToPlain(text);
  const bound = 40 * text.length + 1000;
  const reads = scanned(render, bound);
  ok(reads <= bound, `${name}: searches read ${reads > bound ? "more than" : ""}${Math.min(reads, bound).toLocaleString("en")} characters (≤ ${bound.toLocaleString("en")})`);
  if (reads > bound && !process.argv.includes("--time-all")) {
    ok(false, `${name}: not timed (the searches already read too much)`);
    continue;
  }
  render(); // warm up
  const ms = time(render);
  const plainMs = time(plain);
  ok(ms < LIMIT_MS, `${name}: rendered in ${ms.toFixed(1)} ms`);
  ok(plainMs < LIMIT_MS, `${name}: plain text in ${plainMs.toFixed(1)} ms`);
}

// ---- the same Markdown as before ---------------------------------------------------------
const html = (text, extra = {}) => renderToStaticMarkup(createElement(Markdown, { text, ...extra }));
const cite = { onCitation: () => undefined, citationCount: 2, citationLabel: (n) => `p. ${n}`, citeClassName: "cite" };
const SAME = [
  ["**bold** and __bold__", "<div><p><strong>bold</strong> and <strong>bold</strong></p></div>"],
  ["*it* and _it_, snake_case_name", "<div><p><em>it</em> and <em>it</em>, snake_case_name</p></div>"],
  ["***both***", "<div><p><strong>*both</strong>*</p></div>"],
  ["a `x*y` b", "<div><p>a <code>x*y</code> b</p></div>"],
  // An unmatched backtick run stays as typed (CommonMark), whole.
  ["``a`", "<div><p>``a`</p></div>"],
  ["``code with ` inside``", "<div><p><code>code with ` inside</code></p></div>"],
  [
    "see [the paper](https://example.com/p?q=1)",
    '<div><p>see <a href="https://example.com/p?q=1" target="_blank" rel="noopener noreferrer">the paper<span class="np-sr-only"> (opens in a new tab)</span></a></p></div>',
  ],
  ["[bad](javascript:alert(1)) and [rel](/x)", "<div><p><span>bad</span>) and <span>rel</span></p></div>"],
  ["<https://example.com/a>", '<div><p><a href="https://example.com/a" target="_blank" rel="noopener noreferrer">https://example.com/a<span class="np-sr-only"> (opens in a new tab)</span></a></p></div>'],
  ["a <b> and a < b > c", "<div><p>a &lt;b&gt; and a &lt; b &gt; c</p></div>"],
  ["one [ two [three] four", "<div><p>one [ two [three] four</p></div>"],
  ["\\[1\\] and \\*not\\*", "<div><p>[1] and *not*</p></div>"],
  ["$x^2$ costs $5 and $6", '<div><p><span title="x^2">x²</span> costs $5 and $6</p></div>'],
  ["- a\n- b\n  - c\n\n1. one\n2. two", "<div><ul><li>a</li><li>b<ul><li>c</li></ul></li></ul><ol><li>one</li><li>two</li></ol></div>"],
  ["# Title\n\n> quoted *text*\n\n---", "<div><h3>Title</h3><blockquote><p>quoted <em>text</em></p></blockquote><hr/></div>"],
  ["##   Spaced **title** ##  ", "<div><h3>Spaced <strong>title</strong></h3></div>"],
  ["```js\nlet a = `b`;\n```", "<div><pre><code>let a = `b`;</code></pre></div>"],
  ["| a | b |\n|---|:---:|\n| 1 | **2** |", '<div><div class="np-md-table" role="region" aria-label="Table" tabindex="0"><table><thead><tr><th scope="col">a</th><th scope="col">b</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table></div></div>'],
];
for (const [md, want] of SAME) {
  const got = html(md);
  ok(got === want, `renders ${JSON.stringify(md)}${got === want ? "" : `\n    got  ${got}\n    want ${want}`}`);
}
const cited = html("Grounded [1], also [2], not [3].", cite);
ok(
  cited === '<div><p>Grounded <button type="button" class="cite" aria-label="Source 1: p. 1">1</button>, also <button type="button" class="cite" aria-label="Source 2: p. 2">2</button>, not [3].</p></div>',
  `source markers become buttons, only for real sources: ${cited}`,
);
assert.equal(markdownToPlain("**a** [b](https://x.example/c) `d`\n# e"), "a b (https://x.example/c) d\ne");
ok(true, "plain text drops the formatting and keeps link addresses");

console.log(failures ? `\n✗ ${failures} check(s) failed` : "\n✓ the renderer stays fast and renders the same");
process.exit(failures ? 1 : 0);
