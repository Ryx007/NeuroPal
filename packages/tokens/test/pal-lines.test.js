import assert from "node:assert/strict";
import { test } from "node:test";

import { PAL_LINES, PAL_OPTIONS, palSay } from "../src/index.js";

// Pal's assistant lines (the buddy sheet): every talk style covers every
// line, lines stay short, and the red-state greeting never changes with the
// style (no jokes for someone who is overwhelmed).

const KEYS = Object.keys(PAL_LINES.Gentle);

test("every talk style defines every assistant line", () => {
  assert.deepEqual(Object.keys(PAL_LINES).sort(), Object.keys(PAL_OPTIONS.talk).sort());
  for (const [style, lines] of Object.entries(PAL_LINES)) {
    assert.deepEqual(Object.keys(lines).sort(), [...KEYS].sort(), style);
    for (const [key, line] of Object.entries(lines)) {
      assert.equal(typeof line, "string", `${style}.${key}`);
      assert.ok(line.trim().length > 0, `${style}.${key} is empty`);
      assert.ok(line.length <= 90, `${style}.${key} is ${line.length} chars`);
    }
  }
});

test("the overwhelmed greeting is the same in every style", () => {
  const lines = new Set(Object.values(PAL_LINES).map((l) => l.helloOver));
  assert.equal(lines.size, 1);
});

test("the halfway check-in keeps the agreed words in every style", () => {
  for (const lines of Object.values(PAL_LINES)) assert.match(lines.sitCheck, /Still with it\? Either answer is fine\./);
});

test("palSay follows the talk style and falls back safely", () => {
  assert.equal(palSay({ talk: "Direct" }, "helloOkay"), PAL_LINES.Direct.helloOkay);
  assert.equal(palSay({ talk: "Nerdy" }, "sitEnd"), PAL_LINES.Nerdy.sitEnd);
  // unknown style → Gentle (normalizePal), unknown key → ""
  assert.equal(palSay({ talk: "Shouty" }, "helloOkay"), PAL_LINES.Gentle.helloOkay);
  assert.equal(palSay({}, "nope"), "");
  // prototype names never resolve to Object members
  assert.equal(palSay({ talk: "constructor" }, "toString"), "");
  assert.equal(palSay(null, "__proto__"), "");
});

test("palSay fills placeholders and leaves unknown ones alone", () => {
  const prev = PAL_LINES.Gentle.ack;
  PAL_LINES.Gentle.ack = "Hi {name}, {missing}.";
  try {
    assert.equal(palSay({}, "ack", { name: "Quark" }), "Hi Quark, {missing}.");
    assert.equal(palSay({}, "ack", { name: "x", constructor: "y" }), "Hi x, {missing}.");
  } finally {
    PAL_LINES.Gentle.ack = prev;
  }
});
