#!/usr/bin/env node
// QA for the web app's shell, Home, calming steps, Pal and Settings.
//   1. a dev API (real backend, fake AI):  node <scratchpad>/tools/dev-api.cjs 4410
//   2. the dev server:  NP_DIST_DIR=.next-web-shell npx next dev -p 4310
//   3. node scripts/qa/web-shell.mjs [--web http://localhost:4310] [--api http://127.0.0.1:4410] [--out <dir>] [--only home,pal]
// Visits every screen and state at 1440×900 and 390×844 in both skins, saves
// screenshots, runs axe (any violation fails), fails on console errors, and
// checks the behaviour that matters: sign-in errors, the slider's keys, the
// shortcuts, the crisis check (a crisis-sounding message is never sent), the
// offline notice, the bottom bar's published height and 200% text.
import AxeBuilderModule from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const AxeBuilder = AxeBuilderModule.default ?? AxeBuilderModule;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
// Next's dev server only serves its dev resources to "localhost".
const WEB = arg("web", "http://localhost:4310").replace(/\/+$/, "");
const API = arg("api", "http://127.0.0.1:4410").replace(/\/+$/, "");
const OUT = arg("out", "/tmp/claude-0/-home-claude/aa7fe01a-faa2-5b24-9f30-0260a7a33b2d/scratchpad/web-shots/web-shell");
const ONLY = (arg("only", "") || "").split(",").filter(Boolean);
const EMAIL = "ryx@example.com";
const PASSWORD = "neuropal-dev-1";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "1440", size: { width: 1440, height: 900 } },
  { name: "390", size: { width: 390, height: 844 } },
];
const SKINS = [
  { name: "signal", look: { skin: "signal" } },
  { name: "classic", look: { skin: "classic", classic: { theme: "dark", accent: "ruby" } } },
];

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`  ✗ ${msg}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);
const check = (ok, good, bad) => (ok ? pass(good) : fail(bad));
// Waits for a locator to show (Playwright's isVisible() doesn't wait).
const shows = (locator, timeout = 8000) => locator.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);

// The server limits sign-ins per network (30 per 15 min): wait it out once.
async function token() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const r = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (r.ok) return r.json();
    const wait = Number(r.headers.get("Retry-After"));
    if (r.status !== 429 || !wait || wait > 900 || attempt) throw new Error(`login failed: ${r.status} (is the dev API running at ${API}?)`);
    console.log(`(the server limits sign-ins: waiting ${wait} s)`);
    await new Promise((res) => setTimeout(res, (wait + 1) * 1000));
  }
  throw new Error("login failed");
}

const pad2 = (n) => String(n).padStart(2, "0");
// A day with anchors around now, so the countdown and ruler have something to show.
function seededDay() {
  const now = new Date();
  const at = (mins) => {
    const d = new Date(now.getTime() + mins * 60000);
    return { hour: d.getHours(), minute: d.getMinutes() };
  };
  const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const later = at(35);
  const evening = at(200);
  // Anchors only make sense later today; near midnight keep them simple.
  const anchors =
    later.hour * 60 + later.minute > now.getHours() * 60 + now.getMinutes()
      ? [
          { id: "a-qa-1", title: "Lunch break", subtitle: "Away from the screen", time: later, flexMinutes: 30, category: "break", status: "upcoming" },
          { id: "a-qa-2", title: "Evening meds", subtitle: "With water", time: evening, flexMinutes: 15, category: "medication", status: "upcoming" },
        ]
      : [];
  return {
    v: 1,
    dayStamp: stamp,
    state: null,
    level: null,
    checkins: [],
    tasks: [
      { id: "mvd-1", title: "Stay hydrated", subtitle: "2 glasses left", done: true },
      { id: "mvd-2", title: "Take meds", subtitle: "Morning dosage", done: false },
      { id: "mvd-3", title: "Walk", subtitle: "10 minutes outside", done: false },
      { id: "mvd-4", title: "Read section 2 of the CPI paper", subtitle: "", done: false },
    ],
    anchors,
    dump: [],
  };
}

async function context(browser, vp, skin, { signedIn, session, day = seededDay(), extraLocal = {} }) {
  const ctx = await browser.newContext({ viewport: vp.size, reducedMotion: "no-preference" });
  await ctx.addInitScript(
    ({ api, look, s, d, extra }) => {
      if (sessionStorage.getItem("__qa")) return; // only the first load of the tab
      sessionStorage.setItem("__qa", "1");
      localStorage.clear();
      localStorage.setItem("np.apiBase", api);
      localStorage.setItem("np.appearance.v1", JSON.stringify(look));
      if (d) localStorage.setItem("np.app.day.v1", JSON.stringify(d));
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
      if (s) sessionStorage.setItem("np.session", JSON.stringify(s));
    },
    { api: API, look: skin.look, s: signedIn ? session : null, d: day, extra: extraLocal },
  );
  // The dev server's own badge isn't part of the app.
  await ctx.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
  });
  return ctx;
}

async function open(ctx, path) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${WEB}${path}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { page, errors };
}

async function axe(page, label) {
  const r = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  if (r.violations.length) {
    fail(`${label}: ${r.violations.length} axe violation(s)`);
    for (const v of r.violations) {
      console.log(`     - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
      for (const n of v.nodes.slice(0, 3)) console.log(`         ${n.target.join(" ")} :: ${(n.failureSummary || "").split("\n").slice(1, 3).join(" ")}`);
    }
  } else {
    pass(`${label}: axe 0 violations (${r.passes.length} rules passed)`);
  }
}

async function shot(page, name, { full = false } = {}) {
  await page.waitForTimeout(450); // let the entrance motion settle
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
}

function checkErrors(errors, label) {
  const real = errors.filter((e) => !/Download the React DevTools/.test(e));
  if (real.length) {
    fail(`${label}: console errors`);
    for (const e of real.slice(0, 5)) console.log(`     ${e.slice(0, 300)}`);
  }
}

// ---- the states -----------------------------------------------------------------------

const STATES = [
  {
    name: "signin",
    path: "/app/",
    signedIn: false,
    run: async (page) => {
      await page.getByRole("heading", { level: 1, name: "Welcome back" }).waitFor();
    },
    full: false,
  },
  {
    name: "home",
    path: "/app/",
    signedIn: true,
    run: async (page) => {
      await page.getByRole("slider").waitFor();
      await page.getByText(/Correlation plenoptic|Nothing open yet|Can’t load/).first().waitFor();
    },
    full: true,
  },
  {
    name: "home-checkin",
    path: "/app/",
    signedIn: true,
    run: async (page) => {
      const slider = page.getByRole("slider");
      await slider.waitFor();
      const box = await slider.boundingBox();
      // Drag the knob from the middle into Overwhelmed.
      await page.mouse.move(box.x + box.width / 2, box.y + 48);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + 48, { steps: 6 });
      await page.mouse.move(box.x + box.width * 0.82, box.y + 48, { steps: 6 });
      await page.mouse.up();
      await page.getByRole("link", { name: "Open the calming steps" }).waitFor();
    },
    full: true,
  },
  {
    name: "anchors",
    path: "/app/",
    signedIn: true,
    run: async (page) => {
      await page.getByRole("button", { name: /^All anchors|^Add anchor/ }).first().click();
      await page.getByRole("dialog", { name: "Anchors" }).waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "Add anchor" }).click();
      await page.getByLabel("Name").fill("Study block");
    },
  },
  { name: "calm", path: "/app/calm/", signedIn: false, run: async (page) => page.getByRole("heading", { level: 1, name: "Calming steps" }).waitFor(), full: true },
  { name: "pal-now", path: "/app/pal/?tool=now", signedIn: true, run: async (page) => page.getByRole("tabpanel", { name: "What now?" }).waitFor() },
  {
    name: "pal-breakdown",
    path: "/app/pal/?tool=breakdown",
    signedIn: true,
    run: async (page) => {
      await page.getByLabel("The task").fill("write the intro of my thesis");
      await page.getByRole("button", { name: "Break it down" }).last().click();
      await page.getByRole("heading", { name: /small steps/ }).waitFor({ timeout: 15000 });
    },
  },
  {
    name: "pal-dump",
    path: "/app/pal/?tool=dump",
    signedIn: true,
    run: async (page) => {
      const field = page.getByLabel("A thought, a worry, a to-do");
      await field.fill("Email the reading group about week 4");
      await field.press("Enter");
      await field.fill("Is the SPAD array driver updated?");
      await field.press("Enter");
      await page.getByText("Is the SPAD array driver updated?", { exact: true }).waitFor();
    },
  },
  {
    name: "pal-sit",
    path: "/app/pal/?tool=sit",
    signedIn: true,
    run: async (page) => {
      await page.getByLabel(/What are you working on/).fill("CPI notes");
      await page.getByRole("button", { name: /^25 min/ }).click();
      await page.getByText("Working on: CPI notes").waitFor();
    },
  },
  {
    name: "pal-talk",
    path: "/app/pal/?tool=talk",
    signedIn: true,
    run: async (page) => {
      const field = page.getByLabel("Message to Pal");
      await field.fill("Can you help me start my notes?");
      await field.press("Enter");
      await page.getByRole("list", { name: "Chat with Pal" }).getByText(/That sounds like a lot/).waitFor({ timeout: 15000 });
      await field.fill("I want to die");
      await field.press("Enter");
      await page.getByRole("link", { name: "Open the calming steps" }).waitFor();
    },
  },
  { name: "settings", path: "/app/settings/", signedIn: true, run: async (page) => page.getByRole("heading", { level: 1, name: "Settings" }).waitFor(), full: true },
];

// ---- behaviour checks (1440, Signal) -----------------------------------------------------

async function behaviour(browser, session) {
  console.log("\nbehaviour");
  const vp = VIEWPORTS[0];
  const skin = SKINS[0];

  // Sign-in through the UI: a wrong password stays on screen in plain words; then in.
  {
    const ctx = await context(browser, vp, skin, { signedIn: false, session });
    const { page, errors } = await open(ctx, "/app/");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const err = page.getByText("That email and password don’t match an account on this server.");
    check((await shows(err, 8000)), "wrong password: plain-words error", "wrong password error missing");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const home = await shows(page.getByRole("slider"), 10000);
    check(home, "sign-in through the UI shows Home", "sign-in through the UI failed");
    const tab = await page.evaluate(() => Boolean(sessionStorage.getItem("np.session")) && !localStorage.getItem("np.session.kept"));
    check(tab, "unticked: the session lives in this tab only", "session not tab-only");
    // Create-account mode shows the invite code (the server says signup: invite).
    await page.goto(`${WEB}/app/settings/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: "No account yet? Create one" }).click();
    check((await shows(page.getByLabel("Invite code"))), "create account asks for the invite code", "invite code field missing");
    await page.getByLabel("Email").fill("new@example.com");
    await page.getByLabel("Password", { exact: true }).fill("long-enough-pw");
    await page.getByLabel("Invite code").fill("wrong-code");
    await page.getByRole("button", { name: "Create account" }).click();
    check((await shows(page.getByText("That invite code isn’t right.", { exact: false }), 8000)), "wrong invite: plain-words error", "wrong invite error missing");
    checkErrors(errors.filter((e) => !/401|403|Failed to load resource/.test(e)), "sign-in flow");
    await ctx.close();
  }

  // Keep me signed in → localStorage.
  {
    const ctx = await context(browser, vp, skin, { signedIn: false, session });
    const { page } = await open(ctx, "/app/");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Keep me signed in on this device").check();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("slider").waitFor({ timeout: 10000 });
    const kept = await page.evaluate(() => Boolean(localStorage.getItem("np.session.kept")) && !sessionStorage.getItem("np.session"));
    check(kept, "ticked: the session is kept on this device", "kept session not in localStorage");
    await ctx.close();
  }

  // Slider keys: the knob moves at once, the check-in saves a second later.
  {
    const ctx = await context(browser, vp, skin, { signedIn: true, session });
    const { page } = await open(ctx, "/app/");
    const slider = page.getByRole("slider");
    await slider.focus();
    await page.keyboard.press("End");
    const vt = await slider.getAttribute("aria-valuetext");
    check(vt === "Overwhelmed, 100", `End → aria-valuetext "${vt}"`, `End → aria-valuetext "${vt}"`);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("np.app.day.v1") || "{}").state ?? null);
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1400);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("np.app.day.v1") || "{}"));
    check(
      before === null && after.state === "green" && Math.round(after.level * 100) === 10,
      "keys saved one check-in: Okay, 10",
      `keys saved ${JSON.stringify({ state: after.state, level: after.level })}`,
    );
    check((await page.getByRole("link", { name: "Open the calming steps" }).count()) === 0, "passing through Overwhelmed with keys opened nothing", "calming steps offered for a passing key press");

    // Shortcuts: ? opens the list, Escape closes it and focus comes back; g p, c.
    await page.locator("body").click({ position: { x: 700, y: 20 } });
    await page.keyboard.press("Shift+Slash");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    check((await shows(dialog, 3000)), "? opens the shortcuts list", "? didn't open the list");
    const readerKeys = (await dialog.getByRole("table", { name: "In the reader" }).innerText().catch(() => "")).replace(/\s+/g, " ");
    check(
      ["Play or pause reading aloud", "Previous or next sentence", "Previous or next paragraph"].every((t) => readerKeys.includes(t)),
      "the list includes the reader's keys",
      `reader keys missing from the list: ${readerKeys.slice(0, 120)}`,
    );
    await page.keyboard.press("Escape");
    check((await dialog.waitFor({ state: "hidden", timeout: 3000 }).then(() => true, () => false)), "Escape closes it", "Escape didn't close the list");
    // Opened from its button, focus comes back to that button.
    await page.getByRole("button", { name: /Keyboard shortcuts/ }).click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    check((await page.evaluate(() => document.activeElement?.textContent?.includes("Keyboard shortcuts"))), "focus returns to the button that opened the list", "focus didn't return to the shortcuts button");
    await page.keyboard.press("g");
    await page.keyboard.press("p");
    await page.waitForURL(/\/app\/pal\//, { timeout: 5000 }).then(
      () => pass("g p goes to Pal"),
      () => fail("g p didn't go to Pal"),
    );
    await page.keyboard.press("c");
    await page.waitForURL(/\/app\/calm\//, { timeout: 5000 }).then(
      () => pass("c opens the calming steps"),
      () => fail("c didn't open the calming steps"),
    );
    await page.getByRole("button", { name: "I’m OK for now" }).first().click();
    await page.waitForURL(/\/app\/pal\//, { timeout: 5000 }).then(
      () => pass("I’m OK for now goes back"),
      () => fail("I’m OK for now didn't go back"),
    );
    // Typing in a field never triggers a shortcut.
    await page.goto(`${WEB}/app/pal/?tool=dump`, { waitUntil: "networkidle" });
    await page.getByLabel("A thought, a worry, a to-do").fill("");
    await page.getByLabel("A thought, a worry, a to-do").type("gc?");
    check(page.url().includes("/app/pal/"), "typing g, c, ? in a field stays put", "a shortcut fired while typing");
    await ctx.close();
  }

  // The crisis check runs first: a crisis-sounding message never reaches the server.
  {
    const ctx = await context(browser, vp, skin, { signedIn: true, session });
    const { page } = await open(ctx, "/app/pal/?tool=talk");
    const sent = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/pal/chat") && r.method() === "POST") sent.push(r.postData());
    });
    const field = page.getByLabel("Message to Pal");
    await field.fill("honestly i might kms tonight");
    await field.press("Enter");
    await page.getByRole("link", { name: "Open the calming steps" }).waitFor();
    check((await page.getByRole("link", { name: /112/ }).count()) > 0, "crisis: help lines shown", "crisis: help lines missing");
    await page.waitForTimeout(800);
    check(sent.length === 0, "crisis: nothing was sent to /api/pal/chat", `crisis message was sent: ${sent.join(" | ")}`);
    await ctx.close();
  }

  // The gate says so in the tab title; a rate limit says how long; offline says offline.
  {
    const ctx = await context(browser, vp, skin, { signedIn: false, session });
    const { page } = await open(ctx, "/app/");
    await page.waitForTimeout(300);
    check((await page.title()) === "Sign in · NeuroPal", "signed out: the tab says “Sign in · NeuroPal”", `gate title is “${await page.title()}”`);
    await page.route(`${API}/api/auth/login`, (route) =>
      route.fulfill({ status: 429, contentType: "application/json", headers: { "Retry-After": "42", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Too many sign-in attempts", retryAfterSec: 42 }) }),
    );
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    check((await shows(page.getByText("Too many tries. Wait 42 seconds, then try again."))), "rate limited: says the seconds", "rate-limit message missing");
    check((await shows(page.getByText(/You can try again in \d+ s/))), "rate limited: a countdown", "no countdown");
    await ctx.close();
  }
  {
    const ctx = await context(browser, vp, skin, { signedIn: false, session });
    const { page } = await open(ctx, "/app/");
    await ctx.setOffline(true);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    check((await shows(page.getByText(/You’re offline\. Connect to the internet/))), "offline sign-in: plain words", "offline sign-in message missing");
    check((await shows(page.getByRole("status").filter({ hasText: "You’re offline." }))), "offline: the shell's notice shows", "offline notice missing");
    await ctx.close();
  }

  // The calming steps make no network calls, even signed in.
  {
    const ctx = await context(browser, vp, skin, { signedIn: true, session });
    const page = await ctx.newPage();
    const calls = [];
    page.on("request", (r) => {
      if (r.url().startsWith(API)) calls.push(r.url());
    });
    await page.goto(`${WEB}/app/calm/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Next step" }).click();
    await page.waitForTimeout(800);
    check(calls.length === 0, "calming steps: no network calls", `calming steps called ${calls.join(", ")}`);
    await ctx.close();
  }

  // Break it down without a working server: Pal's offline steps, and it says so.
  {
    const ctx = await context(browser, vp, skin, { signedIn: true, session });
    const { page } = await open(ctx, "/app/pal/?tool=breakdown");
    await page.route(`${API}/api/pal/breakdown`, (route) =>
      route.fulfill({ status: 502, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "the model failed" }) }),
    );
    await page.getByLabel("The task").fill("reply to the email from Milena");
    await page.getByRole("button", { name: "Break it down" }).last().click();
    check((await shows(page.getByText("The server didn’t answer well, so these are offline steps."))), "breakdown failure: offline steps, said so", "breakdown fallback note missing");
    check((await shows(page.getByText("Write one sentence saying what you need"))), "breakdown failure: the email template", "offline template steps missing");
    await page.getByRole("checkbox", { name: /Open the message/ }).check();
    check((await shows(page.getByText("1 of 5 done"))), "steps are a checklist", "ticking a step didn't count");
    await ctx.close();
  }

  // The server's own crisis flag is shown like the local one; Clear chat asks first.
  {
    const ctx = await context(browser, vp, skin, { signedIn: true, session });
    const { page } = await open(ctx, "/app/pal/?tool=talk");
    await page.route(`${API}/api/pal/chat`, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ reply: "I’m really glad you told me. (server)", crisis: true }) })
        : route.continue(),
    );
    const field = page.getByLabel("Message to Pal");
    await field.fill("everything is grey today");
    await field.press("Enter");
    check((await shows(page.getByRole("link", { name: "Open the calming steps" }))), "server crisis: calming steps offered", "server crisis not handled");
    check((await shows(page.getByRole("link", { name: /02 2327 2327/ }))), "server crisis: help lines", "server crisis: no help lines");
    await page.unroute(`${API}/api/pal/chat`);
    await page.getByRole("button", { name: /^Clear chat/ }).click();
    await page.getByRole("button", { name: "Yes, clear it" }).click();
    check((await shows(page.getByText(/Cleared (here and on your server|in this browser)/))), "clear chat: asked, then cleared", "clear chat failed");
    check((await page.getByRole("list", { name: "Chat with Pal" }).getByText("everything is grey today").count()) === 0, "clear chat: messages gone", "messages still shown");
    await ctx.close();
  }

  // A wrong current password says so, and never signs you out.
  {
    const ctx = await context(browser, vp, skin, { signedIn: true, session });
    const { page } = await open(ctx, "/app/settings/#account");
    await page.getByRole("button", { name: "Change password" }).click();
    await page.getByLabel("Current password").fill("definitely-wrong");
    await page.getByLabel("New password").fill("another-long-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    check((await shows(page.getByText("That current password isn’t right."))), "wrong current password: plain words", "wrong current password message missing");
    await page.waitForTimeout(800);
    check((await page.getByRole("heading", { level: 1, name: "Settings" }).count()) === 1, "…and still signed in", "a wrong current password signed the person out");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    const confirm = page.getByRole("dialog", { name: "Sign out everywhere?" });
    check((await shows(confirm)), "sign out everywhere asks first", "no confirmation for sign out everywhere");
    await page.keyboard.press("Escape");
    await ctx.close();
  }

  // Sit with me: the gentle halfway check-in, from any page.
  {
    const now = Date.now();
    const sit = { sit: { id: "s-qa", minutes: 10, label: "CPI notes", taskId: null, anchorId: null, startedAt: now - 6 * 60000, endsAt: now + 4 * 60000, checkIn: null, endedAt: null, endReason: null }, notes: [] };
    const ctx = await context(browser, vp, skin, { signedIn: true, session, extraLocal: { "np.app.palsit.v1": JSON.stringify(sit) } });
    const { page } = await open(ctx, "/app/pal/?tool=sit");
    check((await shows(page.getByText("Still with it? Either answer is fine."))), "sit: the halfway check-in", "no halfway check-in");
    await page.getByRole("button", { name: "Not really" }).click();
    check((await shows(page.getByText("That’s okay. Stop here, or keep going?"))), "sit: “Not really” is fine too", "no follow-up to “Not really”");
    await page.getByRole("button", { name: "Stop here" }).click();
    check((await shows(page.getByLabel(/What did you do/))), "sit: ends kindly with an optional note", "no end view");
    await ctx.close();
  }

  // Add an anchor in the dialog; it becomes the next anchor.
  {
    const ctx = await context(browser, vp, skin, { signedIn: true, session });
    const { page } = await open(ctx, "/app/");
    const soon = new Date(Date.now() + 12 * 60000);
    const hhmm = `${pad2(soon.getHours())}:${pad2(soon.getMinutes())}`;
    await page.getByRole("button", { name: /^All anchors|^Add anchor/ }).first().click();
    const dlg = page.getByRole("dialog", { name: "Anchors" });
    await dlg.getByRole("button", { name: "Add anchor" }).click();
    await dlg.getByLabel("Name").fill("Water break");
    await dlg.getByLabel("Time").fill(hhmm);
    await dlg.getByRole("button", { name: "Break", exact: true }).click();
    await dlg.getByRole("button", { name: "Save" }).click();
    check((await shows(dlg.getByText(/Saved “Water break”/))), "anchor saved", "anchor not saved");
    await page.keyboard.press("Escape");
    if (soon.getDate() === new Date().getDate())
      check(await shows(page.getByRole("region", { name: "Next anchor" }).getByText("Water break")), "the new anchor is next", "new anchor not shown as next");
    else pass("(near midnight: next-anchor check skipped)");
    await ctx.close();
  }

  // A single-user (LOCAL_MODE) server: nothing to sign in to, just Continue.
  {
    const ctx = await context(browser, vp, skin, { signedIn: false, session });
    const json = (body) => ({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
    await ctx.route(`${API}/api/auth/config`, (r) => r.fulfill(json({ localMode: true, signup: "closed" })));
    await ctx.route(`${API}/api/auth/me`, (r) => r.fulfill(json({ id: "local", email: "local@neuropal.app", name: "Ryx" })));
    await ctx.route(`${API}/api/documents**`, (r) => r.fulfill(json([])));
    const { page } = await open(ctx, "/app/");
    check((await shows(page.getByRole("heading", { level: 1, name: "Open your NeuroPal" }))), "single-user server: no password asked", "local mode not recognised");
    await page.getByRole("button", { name: "Continue" }).click();
    check((await shows(page.getByRole("slider"), 10000)), "single-user server: Continue opens Home", "local mode Continue failed");
    const local = await page.evaluate(() => JSON.parse(sessionStorage.getItem("np.session") || "{}").local === true);
    check(local, "single-user session marked local", "local session not marked");
    await ctx.close();
  }

  // Reduced motion: nothing animates; the breathing guide is words only.
  {
    const ctx = await browser.newContext({ viewport: vp.size, reducedMotion: "reduce" });
    await ctx.addInitScript(
      ({ api, s }) => {
        if (sessionStorage.getItem("__qa")) return;
        sessionStorage.setItem("__qa", "1");
        localStorage.setItem("np.apiBase", api);
        localStorage.setItem("np.appearance.v1", JSON.stringify({ skin: "signal" }));
        sessionStorage.setItem("np.session", JSON.stringify(s));
      },
      { api: API, s: session },
    );
    const page = await ctx.newPage();
    await page.goto(`${WEB}/app/calm/`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Calming steps" }).waitFor();
    check((await page.getByRole("button", { name: "Start breathing" }).count()) === 0 && (await shows(page.getByRole("list", { name: "Counted guide" }))), "reduced motion: a counted guide, no animation", "reduced motion: the breathing animation is offered");
    await page.goto(`${WEB}/app/`, { waitUntil: "networkidle" });
    await page.getByRole("slider").waitFor();
    const anim = await page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => getComputedStyle(el).animationName !== "none").length);
    check(anim === 0, "reduced motion: nothing animates on Home", `reduced motion: ${anim} animated element(s) on Home`);
    await ctx.close();
  }

  // The bottom bar's height is on <html> for docked players (0px with the
  // sidebar); at 200% text no label in the sidebar or Pal's tabs is cut off.
  {
    const phone = VIEWPORTS[1];
    const ctx = await context(browser, phone, skin, { signedIn: true, session });
    const { page, errors } = await open(ctx, "/app/");
    await page.getByRole("slider").waitFor();
    const bar = () =>
      page.evaluate(() => ({
        v: getComputedStyle(document.documentElement).getPropertyValue("--np-app-bottom-bar").trim(),
        nav: Math.ceil(document.querySelector('nav[aria-label="App"]').getBoundingClientRect().height),
      }));
    const narrow = await bar();
    check(narrow.v === `${narrow.nav}px` && narrow.nav >= 48, `bottom bar height published: --np-app-bottom-bar ${narrow.v}`, `--np-app-bottom-bar is "${narrow.v}", the bar is ${narrow.nav}px`);
    await page.setViewportSize(vp.size);
    await page.waitForTimeout(400);
    const wide = await bar();
    check(wide.v === "0px", "with the sidebar it is 0px", `with the sidebar --np-app-bottom-bar is "${wide.v}"`);
    // At the usual text size every page link shows its shortcut hint.
    const hintsShown = await page.evaluate(
      () => [...document.querySelectorAll('nav[aria-label="App"] a span')].filter((h) => h.querySelector("kbd") && getComputedStyle(h).display !== "none").length,
    );
    check(hintsShown === 5, "sidebar shows the 5 shortcut hints at the usual text size", `sidebar shows ${hintsShown} of 5 shortcut hints`);
    // Text at 200% (as a larger browser font size would make it).
    const cut = (selector) =>
      page.evaluate((sel) => {
        const out = [];
        for (const host of document.querySelectorAll(sel)) {
          for (const el of [host, ...host.querySelectorAll("span, kbd")]) {
            const cs = getComputedStyle(el);
            if (cs.display === "inline" || cs.display === "none" || cs.position === "absolute" || el.clientWidth <= 1) continue;
            if (el.scrollWidth > el.clientWidth + 1) out.push(`${(host.textContent || "").trim().slice(0, 24)} (${el.scrollWidth}>${el.clientWidth})`);
          }
        }
        return out;
      }, selector);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.waitForTimeout(500);
    const side = await cut('nav[aria-label="App"] a, nav[aria-label="App"] button');
    check(side.length === 0, "200% text: every sidebar label fits", `200% text: cut off in the sidebar: ${side.join("; ")}`);
    await shot(page, "home-text200-1440-signal");
    await page.goto(`${WEB}/app/pal/?tool=breakdown`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.getByRole("tab", { name: /Break it down/ }).waitFor();
    await page.waitForTimeout(500);
    const tabs = await cut('[role="tab"]');
    check(tabs.length === 0, "200% text: every Pal tab label fits", `200% text: cut off in Pal's tabs: ${tabs.join("; ")}`);
    await shot(page, "pal-text200-1440-signal");
    checkErrors(errors, "bottom bar / 200% text");
    await ctx.close();
  }

  // Server unreachable: a quiet notice (role=status) appears; offline tools stay.
  {
    const ctx = await context(browser, vp, skin, { signedIn: true, session });
    await ctx.route(`${API}/api/**`, (route) => route.abort("connectionrefused"));
    const page = await ctx.newPage();
    await page.goto(`${WEB}/app/`, { waitUntil: "networkidle" });
    const notice = page.getByRole("status").filter({ hasText: "Can’t reach your NeuroPal server" });
    check((await shows(notice, 8000)), "unreachable server: notice shown", "no unreachable notice");
    await shot(page, "home-offline-1440-signal");
    await ctx.close();
  }
}

// ---- run -------------------------------------------------------------------------------------

const browser = await chromium.launch({ args: ["--use-gl=swiftshader"] });
try {
  const login = await token();
  const session = { token: login.token, base: API, user: login.user ?? null };
  for (const vp of VIEWPORTS) {
    for (const skin of SKINS) {
      console.log(`\n${vp.name} · ${skin.name}`);
      for (const st of STATES) {
        if (ONLY.length && !ONLY.includes(st.name)) continue;
        const label = `${st.name} @${vp.name} ${skin.name}`;
        const ctx = await context(browser, vp, skin, { signedIn: st.signedIn, session });
        const { page, errors } = await open(ctx, st.path);
        try {
          await st.run(page);
          await page.waitForTimeout(300);
          await shot(page, `${st.name}-${vp.name}-${skin.name}`, { full: Boolean(st.full) });
          await axe(page, label);
        } catch (e) {
          fail(`${label}: ${String(e).split("\n")[0]}`);
          await page.screenshot({ path: `${OUT}/FAILED-${st.name}-${vp.name}-${skin.name}.png` }).catch(() => undefined);
        }
        checkErrors(errors, label);
        await ctx.close();
      }
    }
  }
  if (!ONLY.length || ONLY.includes("behaviour")) await behaviour(browser, session);
} finally {
  await browser.close();
}

console.log(failures ? `\n✗ ${failures} problem(s). Screenshots: ${OUT}` : `\n✓ all good. Screenshots: ${OUT}`);
process.exit(failures ? 1 : 0);
