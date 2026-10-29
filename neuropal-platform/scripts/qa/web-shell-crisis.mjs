#!/usr/bin/env node
// The web app's crisis check (src/lib/neuropal/crisis.ts) must match the
// backend's CRISIS (neuropal-backend/src/routes/pal.js) character for
// character, and pass the backend's own test phrases
// (neuropal-backend/test/pal.test.js).
//   node scripts/qa/web-shell-crisis.mjs
// Node ≥ 22.18 loads the .ts file directly (type stripping).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const platform = resolve(here, "../..");
const repo = resolve(platform, "..");
const read = (p) => readFileSync(p, "utf8");

// 1. Same pattern, same flags.
const literal = (src, file) => {
  const m = src.match(/const CRISIS\s*=\s*\/(.+)\/([dgimsuvy]*);/);
  assert.ok(m, `no CRISIS literal in ${file}`);
  return { source: m[1], flags: m[2] };
};
const backendFile = resolve(repo, "neuropal-backend/src/routes/pal.js");
const webFile = resolve(platform, "src/lib/neuropal/crisis.ts");
const backend = literal(read(backendFile), backendFile);
const web = literal(read(webFile), webFile);
assert.equal(web.source, backend.source, "crisis.ts CRISIS differs from the backend's");
assert.equal(web.flags, backend.flags, "crisis.ts CRISIS flags differ from the backend's");
console.log(`✓ pattern identical to the backend (${web.source.length} chars, flags "${web.flags}")`);

// 2. The backend's test phrases, read from its test file.
const testSrc = read(resolve(repo, "neuropal-backend/test/pal.test.js"));
const block = testSrc.slice(testSrc.indexOf("the crisis check covers common phrasings"));
const arrays = [...block.matchAll(/for \(const m of \[([\s\S]*?)\]\)/g)].slice(0, 2).map((m) =>
  [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map((x) => (x[1] ?? x[2]).replace(/\\(.)/g, "$1")),
);
assert.equal(arrays.length, 2, "couldn't find the two phrase lists in pal.test.js");
const [crisis, everyday] = arrays;
assert.ok(crisis.length >= 10 && everyday.length >= 5, "phrase lists look too short");
// Phrases from the other backend tests (route + caps), incl. a curly apostrophe.
for (const m of ["I don’t want to be alive anymore", "I want to kill myself", "I want to die"]) if (!crisis.includes(m)) crisis.push(m);
for (const m of ["this bug is killing me"]) if (!everyday.includes(m)) everyday.push(m);

const { looksLikeCrisis, CRISIS } = await import(webFile);
const backendRe = new RegExp(backend.source, backend.flags);
const backendCheck = (t) => backendRe.test(String(t || "").replace(/[’‘]/g, "'"));
assert.equal(CRISIS.source, backendRe.source);

let failures = 0;
for (const m of crisis) {
  const ok = looksLikeCrisis(m) === true && backendCheck(m) === true;
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} crisis   ${JSON.stringify(m)}`);
}
for (const m of everyday) {
  const ok = looksLikeCrisis(m) === false && backendCheck(m) === false;
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} everyday ${JSON.stringify(m)}`);
}
if (failures) {
  console.error(`✗ ${failures} phrase(s) disagree`);
  process.exit(1);
}
console.log(`✓ ${crisis.length} crisis and ${everyday.length} everyday phrases agree with the backend`);
