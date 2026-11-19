#!/usr/bin/env node
// QA for the reader's study tools: summary, quiz, cheat sheet, flashcards and
// explain (src/components/app/reader/study, src/lib/neuropal/study.ts).
//   1. a dev API (real backend, fake AI):  node scripts/qa/dev-api.cjs 4421
//   2. the dev server:  NP_DIST_DIR=.next-study npx next dev -p 4311
//   3. node scripts/qa/web-study.mjs [--web http://localhost:4311] [--api http://127.0.0.1:4421] [--out <dir>] [--vp 1440|390] [--skin signal|classic] [--only tools,once] [--stop-api <dev API pid>]
// --stop-api ends the run by stopping the dev API (SIGTERM: it cleans up) to see Study say so.
// At 1440×900 and 390×844 in both skins: the panel closed, then every tool
// loading / done / failed — each with axe (any violation fails) and a
// screenshot — and what matters: results kept per document when the panel
// closes and reopens and never shown on another document, quiz answers
// hidden until asked, flashcards Again / Got it with the deck kept on this
// device, Explain from a selection, Cancel, the read-aloud player still
// going, failures in words, sources that scroll the reader, and nothing
// sent but the five study calls. Then once: a keyboard-only flow, a
// document that isn't ready (the server's own 409), offline, a mouse
// selection, the EPUB reader, and the decks going when you sign out.
// Headless Chromium has no voices: a small fake speechSynthesis stands in.
import AxeBuilderModule from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { parseQuiz } from "../../src/components/app/reader/study/quizParse.ts";

const AxeBuilder = AxeBuilderModule.default ?? AxeBuilderModule;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
// Next's dev server only serves its dev resources to "localhost".
const WEB = arg("web", "http://localhost:4311").replace(/\/+$/, "");
const API = arg("api", "http://127.0.0.1:4421").replace(/\/+$/, "");
const OUT = arg("out", "shots/web-study");
const ONLY = (arg("only", "") || "").split(",").filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const EMAIL = "ryx@example.com";
const PASSWORD = "neuropal-dev-1";
const DECKS_KEY = "np.app.studydecks.v1";
mkdirSync(OUT, { recursive: true });

const VP_ONLY = arg("vp", "");
const SKIN_ONLY = arg("skin", "");
const VIEWPORTS = [
  { name: "1440", size: { width: 1440, height: 900 } },
  { name: "390", size: { width: 390, height: 844 } },
].filter((v) => !VP_ONLY || v.name === VP_ONLY);
const SKINS = [
  { name: "signal", look: { skin: "signal" } },
  { name: "classic", look: { skin: "classic", classic: { theme: "dark", accent: "ruby" } } },
].filter((s) => !SKIN_ONLY || s.name === SKIN_ONLY);

let failures = 0;
let axeRuns = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`  ✗ ${msg}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);
const check = (ok, msg, why) => (ok ? pass(msg) : fail(why ? `${msg} — ${why}` : msg));

// ---- the quiz parser (pure; loaded straight from the .ts file) ----------------------------
{
  console.log("— the quiz parser");
  const canonical = parseQuiz(
    "Here are three.\n\n1. **[easy]** What is A?\n   **Answer:** A thing.\n\n2. **[hard]** Derive B.\n   **Answer:** Two steps:\n   1. one\n   2. two\n\n3. **[medium]** Why C?\n   **Answer:** Because.",
  );
  assert.ok(canonical && canonical.items.length === 3, "three questions");
  assert.equal(canonical.items[1].answer.split("\n").length, 3, "a numbered list inside an answer stays in the answer");
  assert.equal(canonical.items[0].level, "easy");
  assert.equal(canonical.intro, "Here are three.");
  const variants = [
    "**1.** [easy] What?\n**Answer**: That.\n**2.** [hard] Why?\n*Answer:* Because.",
    "### Question 1 [easy]\nWhat?\n\n**Answer:** That.\n\n### Question 2 [medium]\nWhy?\n\n**Answer:** Because.",
    "1. What?\nAnswer: that.\n2. Why?\nAnswer: because.",
    "1. **[easy]** What? **Answer:** That.\n2. **[easy]** Why? **Answer:** Because.",
  ];
  for (const v of variants) {
    const q = parseQuiz(v);
    assert.ok(q && q.items.length === 2 && q.items.every((i) => i.question && i.answer), `variant parsed: ${v.slice(0, 30)}`);
  }
  assert.equal(parseQuiz("Just prose, no questions."), null, "prose is shown as it came");
  const long = parseQuiz("[".repeat(60000));
  assert.equal(long, null);
  pass("questions, levels, answers (with lists inside), variants, and prose left alone");
}

async function api(path, { token, method = "GET", json } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const r = await fetch(`${API}/api${path}`, { method, headers, body });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

// ---- a fake speech engine for headless Chromium (as in web-reader.mjs) ---------------------
const FAKE_SPEECH = () => {
  const voices = [{ voiceURI: "qa-voice-en", name: "QA Voice", lang: "en-US", localService: true, default: true }];
  class Utterance {
    constructor(text) {
      this.text = text;
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.voice = null;
      this.lang = "";
      this.onstart = this.onend = this.onerror = this.onboundary = null;
    }
  }
  const synth = {
    speaking: false,
    paused: false,
    pending: false,
    queue: [],
    current: null,
    timer: 0,
    getVoices: () => voices,
    addEventListener() {},
    removeEventListener() {},
    speak(u) {
      this.queue.push(u);
      if (!this.current) this.next();
    },
    next() {
      const u = this.queue.shift();
      if (!u) {
        this.current = null;
        this.speaking = false;
        return;
      }
      this.current = u;
      this.speaking = true;
      const words = [...u.text.matchAll(/\S+/g)];
      const per = 60000 / (180 * (u.rate || 1));
      this.timer = setTimeout(() => {
        if (this.current !== u) return;
        u.onstart?.({});
        let k = 0;
        const step = () => {
          if (this.current !== u) return;
          if (k < words.length) {
            u.onboundary?.({ name: "word", charIndex: words[k].index });
            k += 1;
            this.timer = setTimeout(step, per);
          } else {
            this.current = null;
            this.speaking = false;
            u.onend?.({});
            if (!this.current) this.next();
          }
        };
        step();
      }, 30);
    },
    cancel() {
      const u = this.current;
      this.queue = [];
      this.current = null;
      this.speaking = false;
      clearTimeout(this.timer);
      if (u) setTimeout(() => u.onerror?.({ error: "interrupted" }), 0);
    },
    pause() {},
    resume() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
};

// ---- page helpers --------------------------------------------------------------------------
const STUDY_RE = /\/api\/documents\/[^/?#]+\/(summarize|quiz|cheatsheet|flashcards|explain)$/;
const hostOf = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};
const ALLOWED_HOSTS = new Set([hostOf(WEB), hostOf(API)]);

async function newContext(browser, vp, skin, session, { record } = {}) {
  const context = await browser.newContext({ viewport: vp.size, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await context.addInitScript(
    ({ base, session: s, look }) => {
      try {
        localStorage.setItem("np.apiBase", base);
        if (!sessionStorage.getItem("np.qa.signedOut")) sessionStorage.setItem("np.session", JSON.stringify(s));
        localStorage.setItem("np.appearance.v1", JSON.stringify(look));
      } catch {
        /* storage blocked */
      }
    },
    { base: API, session, look: skin.look },
  );
  await context.addInitScript(FAKE_SPEECH);
  if (record) context.on("request", (r) => record.push({ url: r.url(), method: r.method(), body: r.postData() }));
  return context;
}

// Network failures we cause on purpose show up as console errors from the
// browser itself ("Failed to load resource …"): those are expected, nothing else is.
const EXPECTED_NET = /Failed to load resource: (the server responded with a status of (409|429|500|502|503)|net::ERR_(FAILED|INTERNET_DISCONNECTED|CONNECTION_REFUSED|ABORTED))/;

async function open(context, path, errors) {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${String(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !EXPECTED_NET.test(m.text())) errors.push(`console ${m.text()}`);
  });
  await page.goto(`${WEB}${path}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function axe(page, label, { inFrame = false } = {}) {
  axeRuns += 1;
  const builder = new AxeBuilder({ page });
  const r = await (inFrame ? builder.options({ preload: false }) : builder).analyze();
  if (r.violations.length) {
    fail(
      `axe ${label}: ${r.violations
        .map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)
        .join("; ")}`,
    );
  } else pass(`axe ${label}: 0 violations`);
}

async function shot(page, name) {
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

const activeWord = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('article [data-on="true"]');
    return el ? Number(el.getAttribute("data-w")) : -1;
  });

/** Hold study calls until released (the "working" state stays on screen). */
async function studyGate(page) {
  let holding = false;
  const held = [];
  await page.route(STUDY_RE, async (route) => {
    if (!holding) return route.fallback();
    await new Promise((resolve) => held.push(resolve));
    await route.fallback().catch(() => undefined);
  });
  return {
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      held.splice(0).forEach((r) => r());
    },
  };
}

/** The next study call for `tool` fails this way (once). */
async function failNext(page, tool, how) {
  const re = new RegExp(`/api/documents/[^/?#]+/${tool}$`);
  let used = false;
  const handler = async (route) => {
    if (used) return route.fallback();
    used = true;
    if (how.abort) return route.abort(how.abort);
    return route.fulfill({ status: how.status, contentType: "application/json", body: JSON.stringify({ error: how.error }) });
  };
  await page.route(re, handler);
  return () => page.unroute(re, handler);
}

/** Select `phrase` in a paragraph of the text that isn't the one being read (plain text runs). */
async function selectPhrase(page, phrase) {
  return page.evaluate((want) => {
    for (const run of document.querySelectorAll("article [data-run]")) {
      const node = run.firstChild;
      const at = node?.textContent?.indexOf(want) ?? -1;
      if (node && at >= 0) {
        run.scrollIntoView({ block: "center" });
        const r = document.createRange();
        r.setStart(node, at);
        r.setEnd(node, at + want.length);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        return true;
      }
    }
    return false;
  }, phrase);
}

/** Wait until a screen-reader announcement (the shell's live regions) matches. */
const announcedSoon = (page, re) =>
  page
    .waitForFunction((src) => new RegExp(src).test([...document.querySelectorAll("[aria-live]")].map((n) => n.textContent || "").join(" | ")), re.source, { timeout: 4000 })
    .then(
      () => true,
      () => false,
    );

async function noOverflow(page, label) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = await page.evaluate(() => window.innerWidth);
  check(w <= vw + 1, `${label}: no sideways scroll (${w} ≤ ${vw})`);
}

// ---------------------------------------------------------------------------------------------
const browser = await chromium.launch();
try {
  const login = await api("/auth/login", { method: "POST", json: { email: EMAIL, password: PASSWORD } });
  const session = { token: login.token, base: API, user: login.user ?? null };
  const token = login.token;
  const docs = await api("/documents", { token });
  const cpi = docs.find((d) => d.title.startsWith("Correlation plenoptic"));
  const notes = docs.find((d) => d.title.startsWith("PhD exam notes"));
  const epub = docs.find((d) => d.type === "epub");
  const processing = docs.find((d) => ["pending", "parsing", "chunking", "embedding"].includes(d.status));
  if (!cpi || !notes || !epub || !processing) throw new Error("the dev API's seeded documents are missing");
  await api(`/documents/${cpi._id}/progress`, { token, method: "PATCH", json: { lastWordIndex: 120, progress: 0.42 } });

  // ------------------------------------------------------------ every tool, every look --
  if (want("tools")) {
    for (const skin of SKINS) {
      for (const vp of VIEWPORTS) {
        const tag = `${vp.name}-${skin.name}`;
        const narrow = vp.name === "390";
        console.log(`\n— ${skin.name} @ ${vp.name}`);
        const errors = [];
        const requests = [];
        await api(`/documents/${cpi._id}/progress`, { token, method: "PATCH", json: { lastWordIndex: 120, progress: 0.42 } });
        const context = await newContext(browser, vp, skin, session, { record: requests });
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(`pageerror ${String(e)}`));
        page.on("console", (m) => {
          if (m.type() === "error" && !EXPECTED_NET.test(m.text())) errors.push(`console ${m.text()}`);
        });
        const gate = await studyGate(page);
        const panel = page.getByRole("region", { name: "Study" });
        const studyButton = page.getByRole("button", { name: /^Study/ });
        const openStudy = async () => {
          await studyButton.click();
          await panel.waitFor();
        };
        const closeStudy = async () => {
          await panel.getByRole("button", { name: "Close Study" }).click();
          await panel.waitFor({ state: "hidden" });
        };
        const tab = (name) => panel.getByRole("tab", { name: new RegExp(`^${name}`) });
        try {
          await page.goto(`${WEB}/app/read/?doc=${cpi._id}`, { waitUntil: "domcontentloaded" });
          await page.locator("article").waitFor({ timeout: 30000 });
          await page.waitForTimeout(500);
          check(await studyButton.isVisible(), "the reader's bar has a Study button");
          await shot(page, `closed-${tag}`);
          await axe(page, `panel closed ${tag}`);

          // Read-aloud keeps going while Study is open.
          await page.getByRole("button", { name: "Play", exact: true }).click();
          await page.waitForTimeout(500);
          const w0 = await activeWord(page);
          await openStudy();
          if (narrow) check(await page.getByRole("dialog", { name: "Study" }).isVisible(), "narrow: Study is a full-height sheet");
          else check(!(await page.getByRole("dialog").count()), "wide: Study is docked beside the text, not a dialog");
          await page.waitForTimeout(1300);
          const w1 = await activeWord(page);
          check(w1 > w0, `read-aloud keeps going with Study open (${w0} → ${w1})`);
          if (narrow) await closeStudy();
          await page.getByRole("button", { name: "Pause", exact: true }).click();
          if (narrow) await openStudy();
          await shot(page, `open-${tag}`);
          await axe(page, `panel open ${tag}`);

          // ---- summary ---------------------------------------------------------------
          await tab("Summary").click();
          await panel.getByRole("button", { name: "Comprehensive", exact: true }).click();
          await panel.getByRole("button", { name: "Intuitive", exact: true }).click();
          gate.hold();
          await panel.getByRole("button", { name: "Make a summary" }).click();
          await panel.getByText("Reading the document and writing your summary…").waitFor();
          check(await panel.getByRole("button", { name: "Cancel" }).isVisible(), "summary: working, with Cancel");
          check(await announcedSoon(page, /Making your summary/), "summary: “working” is announced");
          await shot(page, `summary-loading-${tag}`);
          await axe(page, `summary loading ${tag}`);
          gate.release();
          await panel.getByRole("button", { name: "Generate again" }).waitFor({ timeout: 15000 });
          check((await panel.locator("h3").filter({ hasText: "What it is about" }).count()) === 1, "summary: Markdown headings render");
          check((await panel.locator("li strong").count()) > 0 && (await panel.locator("ul li").count()) >= 3, "summary: bold and a list render");
          check((await panel.getByText(/^Intuitive summary · made /).count()) === 1, "summary: says what it is and when it was made");
          check(await announcedSoon(page, /Summary ready\. /), "summary: “ready” is announced, with its start");
          await shot(page, `summary-done-${tag}`);
          await axe(page, `summary done ${tag}`);
          // a source chip scrolls the reader to the passage (the sheet closes first)
          const chip = panel.getByRole("button", { name: /^Source 2\b.*Abstract/ });
          await chip.click();
          await page.waitForTimeout(700);
          const cited = await page.evaluate(() => {
            const el = document.activeElement;
            return !!el && el.hasAttribute("data-p") && /Abstract/.test(el.textContent || "");
          });
          check(cited, "summary: a source scrolls the reader to the passage and focuses it");
          if (narrow) check(!(await page.getByRole("dialog", { name: "Study" }).count()), "narrow: the sheet closed for the source");
          if (!(await panel.isVisible())) await openStudy();
          // a failed "Generate again" keeps the summary you have
          let undo = await failNext(page, "summarize", { status: 500, error: "Server error" });
          await panel.getByRole("button", { name: "Generate again" }).click();
          await panel.locator(".np-hazard").waitFor({ timeout: 10000 });
          const sumFail = await panel.locator(".np-hazard").innerText();
          check(/The model couldn’t make your summary this time\. Try again/.test(sumFail), `summary: the model failing is worded (“${sumFail.replace(/\s+/g, " ")}”)`);
          check((await panel.locator("h3").filter({ hasText: "What it is about" }).count()) === 1, "summary: the earlier summary stays after a failure");
          check((await panel.getByRole("button", { name: "Generate again" }).count()) === 1, "summary: Generate again is offered");
          await shot(page, `summary-failed-${tag}`);
          await axe(page, `summary failed ${tag}`);
          await undo();

          // ---- quiz ------------------------------------------------------------------
          await tab("Quiz").click();
          await panel.getByRole("button", { name: "5 questions", exact: true }).click();
          await panel.getByRole("button", { name: "Hard", exact: true }).click();
          gate.hold();
          await panel.getByRole("button", { name: "Make a quiz" }).click();
          await panel.getByText("Reading the document and writing your quiz…").waitFor();
          await shot(page, `quiz-loading-${tag}`);
          await axe(page, `quiz loading ${tag}`);
          gate.release();
          await panel.getByRole("button", { name: "Generate again" }).waitFor({ timeout: 15000 });
          const quizBody = requests.filter((r) => r.method === "POST" && /\/quiz$/.test(r.url)).pop()?.body;
          check(quizBody === JSON.stringify({ count: 5, difficulty: "hard" }), `quiz: asks for the count and difficulty picked (${quizBody})`);
          const items = panel.locator("ol > li").filter({ hasText: /^Question \d+ of \d+/ });
          check((await items.count()) === 5, `quiz: 5 questions (${await items.count()})`);
          const hiddenBefore = await panel.locator('[id$="-a0"]').evaluate((el) => el.hidden);
          check(hiddenBefore, "quiz: answers are hidden until asked");
          const show1 = panel.getByRole("button", { name: "Show answer to question 1", exact: true });
          check((await show1.getAttribute("aria-expanded")) === "false", "quiz: “Show answer” says it's collapsed");
          await show1.click();
          const hide1 = panel.getByRole("button", { name: "Hide answer to question 1", exact: true });
          check((await hide1.getAttribute("aria-expanded")) === "true" && !(await panel.locator('[id$="-a0"]').evaluate((el) => el.hidden)), "quiz: “Show answer” reveals it");
          check((await panel.locator('[id$="-a1"]').evaluate((el) => el.hidden)) === true, "quiz: the other answers stay hidden");
          check((await panel.locator("li .np-tag", { hasText: "Easy" }).count()) > 0, "quiz: each question's level is a word");
          await shot(page, `quiz-done-${tag}`);
          await axe(page, `quiz done ${tag}`);
          undo = await failNext(page, "quiz", { status: 429, error: "That's today's 150 AI answers for this account — they reset at midnight (UTC)." });
          await panel.getByRole("button", { name: "Generate again" }).click();
          await panel.locator(".np-hazard").waitFor({ timeout: 10000 });
          const quizFail = await panel.locator(".np-hazard").innerText();
          check(/today’s limit for AI answers\. It resets at midnight \(UTC\)/.test(quizFail), `quiz: today's AI limit is worded (“${quizFail.replace(/\s+/g, " ")}”)`);
          check((await items.count()) === 5, "quiz: the quiz stays after a failure");
          await shot(page, `quiz-failed-${tag}`);
          await axe(page, `quiz failed ${tag}`);
          await undo();

          // ---- cheat sheet -----------------------------------------------------------
          await tab("Cheat sheet").click();
          gate.hold();
          await panel.getByRole("button", { name: "Make a cheat sheet" }).click();
          await panel.getByText("Reading the document and writing your cheat sheet…").waitFor();
          await shot(page, `cheatsheet-loading-${tag}`);
          await axe(page, `cheat sheet loading ${tag}`);
          gate.release();
          await panel.getByRole("button", { name: "Generate again" }).waitFor({ timeout: 15000 });
          check((await panel.getByRole("region", { name: "Table" }).count()) === 1, "cheat sheet: the table renders");
          const maths = await panel.locator('p[title*="frac"]').innerText().catch(() => "");
          check(/⟨/.test(maths) && !/\\langle/.test(maths), `cheat sheet: maths shows as the reader shows it (“${maths.slice(0, 40)}”)`);
          await shot(page, `cheatsheet-done-${tag}`);
          await axe(page, `cheat sheet done ${tag}`);
          undo = await failNext(page, "cheatsheet", { status: 503, error: "The AI service has used up its quota for now — please try again later." });
          await panel.getByRole("button", { name: "Generate again" }).click();
          await panel.locator(".np-hazard").waitFor({ timeout: 10000 });
          const cheatFail = await panel.locator(".np-hazard").innerText();
          check(/busy or out of quota right now\. Try again in a little while/.test(cheatFail), `cheat sheet: the AI service out of quota is worded (“${cheatFail.replace(/\s+/g, " ")}”)`);
          await shot(page, `cheatsheet-failed-${tag}`);
          await axe(page, `cheat sheet failed ${tag}`);
          await undo();

          // ---- flashcards ------------------------------------------------------------
          await tab("Flashcards").click();
          gate.hold();
          await panel.getByRole("button", { name: "Make flashcards" }).click();
          await panel.getByText("Reading the document and writing your flashcards…").waitFor();
          await shot(page, `flashcards-loading-${tag}`);
          await axe(page, `flashcards loading ${tag}`);
          gate.release();
          const showAnswer = panel.getByRole("button", { name: "Show answer", exact: true });
          await showAnswer.waitFor({ timeout: 15000 });
          check((await panel.getByText("0 recalled · 15 to go").count()) === 1, "flashcards: progress starts at 0 recalled · 15 to go");
          const front1 = await panel.locator("p").filter({ hasText: /^Question$/ }).locator("..").innerText();
          await shot(page, `flashcards-front-${tag}`);
          await axe(page, `flashcards question ${tag}`);
          await showAnswer.click();
          const answerFocused = await page.evaluate(() => /^Answer/.test(document.activeElement?.textContent?.trim() || ""));
          check(answerFocused, "flashcards: “Show answer” shows the back and moves focus to it");
          await shot(page, `flashcards-back-${tag}`);
          await axe(page, `flashcards answer ${tag}`);
          await panel.getByRole("button", { name: /^Again/ }).click();
          const front2 = await panel.locator("p").filter({ hasText: /^Question$/ }).locator("..").innerText();
          check(front2 !== front1 && (await panel.getByText("0 recalled · 15 to go").count()) === 1, "flashcards: “Again” puts the card at the end of the deck");
          check(await page.evaluate(() => /^Question/.test(document.activeElement?.textContent?.trim() || "")), "flashcards: focus moves to the next question");
          await showAnswer.click();
          await panel.getByRole("button", { name: /^Got it/ }).click();
          check((await panel.getByText("1 recalled · 14 to go").count()) === 1, "flashcards: “Got it” puts the card away");
          const stored = await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key) || "{}")[id], { key: DECKS_KEY, id: cpi._id });
          check(stored?.cards?.length === 15 && stored.recalled === 1 && stored.queue.length === 14, "flashcards: the deck and progress are kept on this device, per document");
          undo = await failNext(page, "flashcards", { status: 502, error: "the model did not return usable flashcards — try again" });
          await panel.getByRole("button", { name: "Make a new deck" }).click();
          await panel.locator(".np-hazard").waitFor({ timeout: 10000 });
          const cardsFail = await panel.locator(".np-hazard").innerText();
          check(/couldn’t make your flashcards this time\. Try again/.test(cardsFail), `flashcards: the model failing is worded (“${cardsFail.replace(/\s+/g, " ")}”)`);
          check((await panel.getByText("1 recalled · 14 to go").count()) === 1, "flashcards: the deck stays after a failure");
          await shot(page, `flashcards-failed-${tag}`);
          await axe(page, `flashcards failed ${tag}`);
          await undo();

          // ---- explain: select a passage, "Explain this" ---------------------------------
          if (narrow) await closeStudy();
          const phrase = "spontaneous parametric down-conversion";
          check(await selectPhrase(page, phrase), "explain: a passage can be selected in the text");
          const explainThis = page.getByRole("button", { name: "Explain this" });
          await explainThis.waitFor({ timeout: 4000 });
          await shot(page, `explain-selection-${tag}`);
          await axe(page, `explain on a selection ${tag}`);
          gate.hold();
          await explainThis.click();
          await panel.getByText("Reading around the passage and writing an explanation…").waitFor({ timeout: 8000 });
          check((await tab("Explain").getAttribute("aria-selected")) === "true", "explain: “Explain this” opens Study on Explain");
          check((await panel.locator("blockquote").innerText()).includes(phrase), "explain: the passage is shown");
          await shot(page, `explain-loading-${tag}`);
          await axe(page, `explain loading ${tag}`);
          gate.release();
          await panel.getByRole("button", { name: "Generate again" }).waitFor({ timeout: 15000 });
          const explainBody = JSON.parse(requests.filter((r) => r.method === "POST" && /\/explain$/.test(r.url)).pop()?.body || "{}");
          check(explainBody.passage === phrase && explainBody.depth === "intuitive" && Object.keys(explainBody).length === 2, `explain: sends the passage and the depth only (${JSON.stringify(explainBody)})`);
          check((await panel.locator("h3").filter({ hasText: "In plain words" }).count()) === 1, "explain: the explanation renders");
          await shot(page, `explain-done-${tag}`);
          await axe(page, `explain done ${tag}`);
          undo = await failNext(page, "explain", { abort: "connectionrefused" });
          await panel.getByRole("button", { name: "Generate again" }).click();
          await panel.locator(".np-hazard").waitFor({ timeout: 10000 });
          const explainFail = await panel.locator(".np-hazard").innerText();
          check(/Can’t reach your NeuroPal server right now\. Check your connection, then try again/.test(explainFail), `explain: an unreachable server is worded (“${explainFail.replace(/\s+/g, " ")}”)`);
          await shot(page, `explain-failed-${tag}`);
          await axe(page, `explain failed ${tag}`);
          await undo();

          // ---- kept when the panel closes and reopens; Cancel keeps what you have ----------
          await closeStudy();
          await page.waitForTimeout(150);
          check(await studyButton.evaluate((el) => el === document.activeElement), "closing gives focus back to the Study button");
          await openStudy();
          await tab("Summary").click();
          check((await panel.locator("h3").filter({ hasText: "What it is about" }).count()) === 1, "the summary is still there after closing and reopening");
          await tab("Quiz").click();
          check(!(await panel.locator('[id$="-a0"]').evaluate((el) => el.hidden)), "…and the quiz remembers which answers you opened");
          await tab("Summary").click();
          gate.hold();
          await panel.getByRole("button", { name: "Generate again" }).click();
          await panel.getByRole("button", { name: "Cancel" }).click();
          await panel.getByRole("button", { name: "Cancel" }).waitFor({ state: "hidden" });
          check((await panel.locator("h3").filter({ hasText: "What it is about" }).count()) === 1, "Cancel stops it and keeps the summary you have");
          check(await announcedSoon(page, /Stopped\. Your summary wasn’t made/), "Cancel is announced");
          gate.release();

          // ---- another document never shows this one's results (in-app navigation) ----------
          if (narrow) await closeStudy();
          await page.getByRole("link", { name: "Back to the library" }).click();
          await page.getByRole("heading", { level: 1, name: "Library" }).waitFor();
          await page.locator(`a[href*="doc=${notes._id}"]`).first().click();
          await page.locator("article").waitFor();
          await openStudy();
          await tab("Summary").click();
          check((await panel.getByRole("button", { name: "Make a summary" }).count()) === 1 && !(await panel.locator("h3").count()), "another document: no summary from the first one");
          await tab("Flashcards").click();
          check((await panel.getByRole("button", { name: "Make flashcards" }).count()) === 1, "another document: no deck from the first one");
          if (narrow) await closeStudy();
          await page.getByRole("link", { name: "Back to the library" }).click();
          await page.getByRole("heading", { level: 1, name: "Library" }).waitFor();
          await page.locator(`a[href*="doc=${cpi._id}"]`).first().click();
          await page.locator("article").waitFor();
          await page.waitForTimeout(300);
          await openStudy();
          await tab("Summary").click();
          check((await panel.locator("h3").filter({ hasText: "What it is about" }).count()) === 1, "back on the first document: its summary is still there");

          // ---- a reload keeps the deck (on this device) and its progress ---------------------
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.locator("article").waitFor();
          await openStudy();
          await tab("Flashcards").click();
          check((await panel.getByText("1 recalled · 14 to go").count()) === 1, "after a reload the deck is still here, where you left it");
          await noOverflow(page, `study ${tag}`);

          // ---- only the five study calls, to this server only --------------------------------
          const foreign = requests.filter((r) => !/^(data|blob):/.test(r.url) && !ALLOWED_HOSTS.has(hostOf(r.url)));
          check(foreign.length === 0, "nothing is sent anywhere but this app and its NeuroPal server", foreign.slice(0, 3).map((r) => r.url).join(", "));
          const posts = requests.filter((r) => r.method === "POST" && hostOf(r.url) === hostOf(API) && new URL(r.url).pathname.startsWith("/api/documents/"));
          const odd = posts.filter((r) => !STUDY_RE.test(new URL(r.url).pathname));
          check(odd.length === 0, `the only document POSTs are the five study calls (${posts.length} sent)`, odd.map((r) => r.url).join(", "));
          const bodies = posts.map((r) => [new URL(r.url).pathname.split("/").pop(), Object.keys(JSON.parse(r.body || "{}")).sort().join(",")]);
          const shapes = { summarize: "depth", quiz: "count,difficulty", cheatsheet: "", flashcards: "count", explain: "depth,passage" };
          const badBody = bodies.filter(([k, keys]) => shapes[k] !== keys);
          check(badBody.length === 0, "each study call sends only its own fields", JSON.stringify(badBody));
        } catch (e) {
          fail(`study ${tag}: ${String(e).split("\n")[0]}`);
          await page.screenshot({ path: `${OUT}/FAILED-${tag}.png` }).catch(() => undefined);
        }
        const real = errors.filter((e) => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(e));
        if (real.length) fail(`console errors ${tag}: ${real.slice(0, 6).join(" | ")}`);
        else pass(`no console errors ${tag}`);
        await context.close();
      }
    }
  }

  // ------------------------------------------------------------------------------ once --
  if (want("once")) {
    const vp = { name: "1440", size: { width: 1440, height: 900 } };
    const skin = SKINS[0] ?? { name: "signal", look: { skin: "signal" } };
    const tag = `${vp.name}-${skin.name}`;
    const errors = [];
    const context = await newContext(browser, vp, skin, session);

    // ---- keyboard only: S, the tabs, a whole flashcards round, Escape --------------------
    console.log(`\n— keyboard only @ ${tag}`);
    let page = null;
    try {
      page = await open(context, `/app/read/?doc=${notes._id}`, errors);
      await page.locator("article").waitFor();
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
      await page.keyboard.press("s");
      const panel = page.getByRole("region", { name: "Study" });
      await panel.waitFor();
      check(await page.evaluate(() => document.activeElement?.getAttribute("role") === "tab" && /Summary/.test(document.activeElement.textContent || "")), "S opens Study and focus goes to its first tab");
      for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
      check(await page.evaluate(() => document.activeElement?.getAttribute("aria-selected") === "true" && /Flashcards/.test(document.activeElement.textContent || "")), "arrow keys move between the tools");
      const tabTo = async (name, max = 12) => {
        for (let i = 0; i < max; i++) {
          await page.keyboard.press("Tab");
          const t = await page.evaluate(() => (document.activeElement?.textContent || "").replace(/\s+/g, " ").trim());
          if (t.startsWith(name)) return true;
        }
        return false;
      };
      check(await tabTo("Make flashcards"), "Tab reaches “Make flashcards”");
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Show answer", exact: true }).waitFor({ timeout: 15000 });
      await page.waitForTimeout(200);
      check(await page.evaluate(() => /^Question/.test(document.activeElement?.textContent?.trim() || "")), "the new deck: focus goes to the first question");
      check(await tabTo("Show answer", 3), "Tab reaches “Show answer”");
      await page.keyboard.press("Enter");
      check(await page.evaluate(() => /^Answer/.test(document.activeElement?.textContent?.trim() || "")), "Enter shows the answer and focus moves to it");
      check(await tabTo("Again", 2), "Tab reaches “Again”");
      check(await tabTo("Got it", 2), "Tab reaches “Got it”");
      await page.keyboard.press("Enter");
      check((await panel.getByText(/^1 recalled · \d+ to go$/).count()) === 1, "Enter on “Got it” puts the card away");
      check(await page.evaluate(() => /^Question/.test(document.activeElement?.textContent?.trim() || "")), "focus moves to the next question");
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "hidden" });
      check(await page.getByRole("button", { name: /^Study/ }).evaluate((el) => el === document.activeElement), "Escape closes Study and focus goes back to its button");
      await page.keyboard.press("s");
      await panel.waitFor();
      await page.keyboard.press("s");
      await panel.waitFor({ state: "hidden" });
      pass("S closes Study again");
      // "Explain the sentence being read" (the keyboard way to explain)
      await page.keyboard.press("s");
      await panel.waitFor();
      await page.keyboard.press("End");
      check(await tabTo("Explain the sentence being read", 4), "Tab reaches “Explain the sentence being read”");
      await page.keyboard.press("Enter");
      await panel.getByRole("button", { name: "Generate again" }).waitFor({ timeout: 15000 });
      check((await panel.locator("blockquote").innerText()).length > 10, "the sentence being read is explained");
      await axe(page, `keyboard flow ${tag}`);
      await page.keyboard.press("Escape");
      // g then s is the app's "go to Settings", not Study
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
      await page.keyboard.press("g");
      await page.keyboard.press("s");
      await page.waitForURL(/\/app\/settings\//, { timeout: 8000 });
      pass("g then s still goes to Settings");
    } catch (e) {
      fail(`keyboard only: ${String(e).split("\n")[0]}`);
      await page?.screenshot({ path: `${OUT}/FAILED-keyboard.png` }).catch(() => undefined);
    }
    await page?.close();

    // ---- a document that isn't ready: the server's own 409 -------------------------------
    console.log(`\n— not ready, offline, a mouse selection @ ${tag}`);
    try {
      page = await open(context, "/app/library/", errors);
      // The reader only opens ready text, so the browser is told this one is ready;
      // the server still knows better and answers 409.
      const notReady = { id: processing._id, title: processing.title, text: "Hong–Ou–Mandel interference, revisited\n\nTwo photons meet at a beam splitter and leave together.", pageCount: 1, wordCount: 14, toc: [], pageMap: [], source: "chunks" };
      await page.route(`${API}/api/documents/${processing._id}`, async (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        const r = await route.fetch();
        return route.fulfill({ response: r, json: { ...(await r.json()), status: "ready", progress: 1 } });
      });
      await page.route(`${API}/api/documents/${processing._id}/text`, (route) => route.fulfill({ json: notReady }));
      await page.goto(`${WEB}/app/read/?doc=${processing._id}`, { waitUntil: "domcontentloaded" });
      await page.locator("article").waitFor();
      const panel = page.getByRole("region", { name: "Study" });
      await page.getByRole("button", { name: /^Study/ }).click();
      await panel.getByRole("button", { name: "Make a summary" }).click();
      await panel.locator(".np-hazard").waitFor({ timeout: 10000 });
      const t = await panel.locator(".np-hazard").innerText();
      check(/still being processed\. Study tools work once it’s ready — try again in a minute/.test(t), `not ready: worded, and says what to do (“${t.replace(/\s+/g, " ")}”)`);
      await shot(page, `not-ready-${tag}`);
      await axe(page, `not ready ${tag}`);

      // ---- offline ------------------------------------------------------------------------
      await page.goto(`${WEB}/app/read/?doc=${cpi._id}`, { waitUntil: "domcontentloaded" });
      await page.locator("article").waitFor();
      await page.getByRole("button", { name: /^Study/ }).click();
      await context.setOffline(true);
      await panel.getByRole("button", { name: "Make a summary" }).click();
      await panel.locator(".np-hazard").waitFor({ timeout: 10000 });
      const off = await panel.locator(".np-hazard").innerText();
      check(/You’re offline right now\. Connect again, then try again/.test(off), `offline: worded (“${off.replace(/\s+/g, " ")}”)`);
      check((await panel.getByRole("button", { name: "Try again" }).count()) === 1, "offline: “Try again” is offered");
      await shot(page, `offline-${tag}`);
      await axe(page, `offline ${tag}`);
      await context.setOffline(false);
      await panel.getByRole("button", { name: "Try again" }).click();
      await panel.getByRole("button", { name: "Generate again" }).waitFor({ timeout: 15000 });
      pass("back online: “Try again” makes it");

      // ---- a real mouse selection ----------------------------------------------------------------
      await panel.getByRole("button", { name: "Close Study" }).click();
      const box = await page.evaluate(() => {
        for (const run of document.querySelectorAll("article [data-run]")) {
          const node = run.firstChild;
          const at = node?.textContent?.indexOf("photon pairs") ?? -1;
          if (node && at >= 0) {
            run.scrollIntoView({ block: "center" });
            const r = document.createRange();
            r.setStart(node, at);
            r.setEnd(node, at + "photon pairs".length);
            const rects = r.getClientRects();
            const a = rects[0];
            const b = rects[rects.length - 1];
            return { x1: a.left + 1, y1: a.top + a.height / 2, x2: b.right - 1, y2: b.top + b.height / 2 };
          }
        }
        return null;
      });
      if (!box) throw new Error("no text to select");
      await page.mouse.move(box.x1, box.y1);
      await page.mouse.down();
      await page.mouse.move(box.x2, box.y2, { steps: 6 });
      check((await page.getByRole("button", { name: "Explain this" }).count()) === 0, "mouse: nothing pops up while you're still selecting");
      await page.mouse.up();
      await page.getByRole("button", { name: "Explain this" }).waitFor({ timeout: 4000 });
      check(await page.getByRole("button", { name: "Play", exact: true }).isVisible(), "mouse: selecting doesn't start reading aloud");
      await page.getByRole("button", { name: "Explain this" }).click();
      await panel.getByRole("button", { name: "Generate again" }).waitFor({ timeout: 15000 });
      check((await panel.locator("blockquote").innerText()) === "photon pairs", "mouse: the selected words are explained");

      // ---- server text is untrusted: rendered as text, never as HTML --------------------------------
      await page.route(STUDY_RE, (route) =>
        route.fulfill({
          json: {
            answer: '### Sneaky\n\n<img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script>\n\n[click](javascript:window.__pwned=3) and [fine](https://example.org) **still bold**',
            citations: [],
          },
        }),
      );
      await panel.getByRole("tab", { name: /^Summary/ }).click();
      await panel.getByRole("button", { name: "Generate again" }).click();
      await panel.locator("h3").filter({ hasText: "Sneaky" }).waitFor({ timeout: 10000 });
      const unsafe = await page.evaluate(() => {
        const p = document.querySelector('[role="tabpanel"]');
        return {
          tags: p.querySelectorAll("img, script, iframe").length,
          js: [...p.querySelectorAll("a")].filter((a) => !/^https?:/.test(a.getAttribute("href") || "")).length,
          safeLink: [...p.querySelectorAll("a")].some((a) => a.getAttribute("href") === "https://example.org/" && a.rel.includes("noopener")),
          shown: /<img src=x/.test(p.textContent || ""),
          pwned: window.__pwned ?? null,
        };
      });
      check(unsafe.tags === 0 && unsafe.js === 0 && unsafe.pwned === null && unsafe.shown && unsafe.safeLink, `untrusted text stays text (${JSON.stringify(unsafe)})`);
      await page.unroute(STUDY_RE);
    } catch (e) {
      fail(`not ready / offline / mouse: ${String(e).split("\n")[0]}`);
      await page?.screenshot({ path: `${OUT}/FAILED-once.png` }).catch(() => undefined);
    }
    await context.setOffline(false);
    await page?.close();

    // ---- the EPUB reader: Study works there too (the sentence being read) -------------------
    console.log(`\n— EPUB @ ${tag}`);
    try {
      page = await open(context, `/app/read/?doc=${epub._id}`, errors);
      await page.locator('iframe[title^="Chapter 1 of 2"]').waitFor({ timeout: 20000 });
      await page.frameLocator('iframe[title^="Chapter 1 of 2"]').locator("h1").waitFor();
      await page.waitForTimeout(600);
      const panel = page.getByRole("region", { name: "Study" });
      await page.getByRole("button", { name: /^Study/ }).click();
      await panel.getByRole("tab", { name: /^Explain/ }).click();
      check((await panel.getByText(/move the reading position to it with the player/).count()) === 1, "EPUB: Explain says how to pick the sentence (no selection inside a book's frame)");
      await panel.getByRole("button", { name: "Explain the sentence being read" }).click();
      await panel.getByRole("button", { name: "Generate again" }).waitFor({ timeout: 15000 });
      const epubPassage = await panel.locator("blockquote").innerText();
      check(/photon/.test(epubPassage) && epubPassage.split(/\s+/).length >= 6, `EPUB: the sentence at the reading position is explained, never just “1.” (“${epubPassage}”)`);
      await panel.getByRole("tab", { name: /^Summary/ }).click();
      await panel.getByRole("button", { name: "Make a summary" }).click();
      await panel.getByRole("button", { name: "Generate again" }).waitFor({ timeout: 15000 });
      pass("EPUB: a summary is made");
      await shot(page, `epub-${tag}`);
      await axe(page, `EPUB with Study ${tag}`, { inFrame: true });
    } catch (e) {
      fail(`EPUB: ${String(e).split("\n")[0]}`);
      await page?.screenshot({ path: `${OUT}/FAILED-epub.png` }).catch(() => undefined);
    }
    await page?.close();

    // ---- signing out takes the decks with it (they're the account's) -------------------------
    console.log(`\n— sign out @ ${tag}`);
    try {
      page = await open(context, `/app/read/?doc=${cpi._id}`, errors);
      await page.locator("article").waitFor();
      const before = await page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key) || "{}")).length, DECKS_KEY);
      check(before >= 1, `there is a deck on this device before signing out (${before})`);
      await page.evaluate(() => sessionStorage.setItem("np.qa.signedOut", "1"));
      await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Settings", exact: true }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.getByRole("heading", { level: 1, name: "Welcome back" }).waitFor({ timeout: 10000 });
      const after = await page.evaluate((key) => localStorage.getItem(key), DECKS_KEY);
      check(after === null, "signing out removes the flashcard decks from this device");
    } catch (e) {
      fail(`sign out: ${String(e).split("\n")[0]}`);
      await page?.screenshot({ path: `${OUT}/FAILED-signout.png` }).catch(() => undefined);
    }
    await page?.close();

    const real = errors.filter((e) => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(e));
    if (real.length) fail(`console errors (once): ${real.slice(0, 6).join(" | ")}`);
    else pass("no console errors (once)");
    await context.close();
  }

  // ---- last, and only when asked (--stop-api <pid>): the server really goes away ----------------
  const stopPid = Number(arg("stop-api", "0"));
  if (stopPid > 0) {
    const vp = VIEWPORTS[0] ?? { name: "1440", size: { width: 1440, height: 900 } };
    const skin = SKINS[0] ?? { name: "signal", look: { skin: "signal" } };
    console.log(`\n— the server stops (pid ${stopPid}) @ ${vp.name}-${skin.name}`);
    const errors = [];
    const context = await newContext(browser, vp, skin, session);
    let page = null;
    try {
      page = await open(context, `/app/read/?doc=${cpi._id}`, errors);
      await page.locator("article").waitFor();
      const panel = page.getByRole("region", { name: "Study" });
      await page.getByRole("button", { name: /^Study/ }).click();
      await panel.getByRole("tab", { name: /^Summary/ }).waitFor();
      process.kill(stopPid, "SIGTERM");
      for (let i = 0; i < 40; i++) {
        const up = await fetch(`${API}/healthz`).then(
          () => true,
          () => false,
        );
        if (!up) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      await panel.getByRole("button", { name: "Make a summary" }).click();
      await panel.locator(".np-hazard").waitFor({ timeout: 15000 });
      const t = await panel.locator(".np-hazard").innerText();
      check(/Can’t reach your NeuroPal server right now\. Check your connection, then try again/.test(t), `the server stopped: worded, and says what to do (“${t.replace(/\s+/g, " ")}”)`);
      await shot(page, `server-stopped-${vp.name}-${skin.name}`);
      await axe(page, `server stopped ${vp.name}-${skin.name}`);
    } catch (e) {
      fail(`the server stops: ${String(e).split("\n")[0]}`);
      await page?.screenshot({ path: `${OUT}/FAILED-server-stopped.png` }).catch(() => undefined);
    }
    const real = errors.filter((e) => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(e));
    if (real.length) fail(`console errors (server stopped): ${real.slice(0, 6).join(" | ")}`);
    else pass("no console errors (server stopped)");
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed (${axeRuns} axe runs). Screenshots: ${OUT}` : `\nAll checks passed (${axeRuns} axe runs, 0 violations). Screenshots: ${OUT}`);
process.exit(failures ? 1 : 0);
