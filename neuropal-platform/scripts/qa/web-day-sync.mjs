#!/usr/bin/env node
// Day sync in the web app, end to end (docs/DAY-SYNC.md §8): two browser
// contexts are two devices on one account (a fresh qa-day-* account per run).
//   1. a dev API (real backend, fake AI):  node scripts/qa/dev-api.cjs 4422
//   2. the dev server:  NP_DIST_DIR=.next-day npx next dev -p 4312
//   3. node scripts/qa/web-day-sync.mjs [--web http://localhost:4312] [--api http://127.0.0.1:4422] [--out <dir>]
// Checks: a check-in, a new anchor, an edit, a tick, a deleted task (and its
// Undo) and a brain-dump line made on A show up on B; an edit made on B while
// offline syncs when it reconnects; with the switch off B stays local (and on
// again adds its day back); an anchor made through the API with `icon` and
// `location` survives an edit here; sign out → sign in brings the day back;
// two tabs don't answer each other's writes (sync requests counted); an
// erase elsewhere empties the day here. Settings with the new section: axe
// with zero violations in both skins at 1440×900 and 390×844, screenshots.
// Any console error fails.
import AxeBuilderModule from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const AxeBuilder = AxeBuilderModule.default ?? AxeBuilderModule;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
// Next's dev server only serves its dev resources to "localhost".
const WEB = arg("web", "http://localhost:4312").replace(/\/+$/, "");
const API = arg("api", "http://127.0.0.1:4422").replace(/\/+$/, "");
const OUT = arg("out", "shots/web-day-sync");
const SYNC = `${API}/api/me/day/sync`;
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
const check = (ok, good, bad) => (ok ? pass(good) : fail(bad ?? good));
const shows = (locator, timeout = 8000) => locator.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// ---- the account --------------------------------------------------------------------------

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let attempt = 0; ; attempt += 1) {
    const r = await fetch(`${API}/api${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    const wait = Number(r.headers.get("Retry-After"));
    if (r.status !== 429 || !wait || wait > 900 || attempt) return r;
    console.log(`(the server limits sign-ins: waiting ${wait} s)`);
    await sleep((wait + 1) * 1000);
  }
}

async function api(path, token, { method = "GET", json } = {}) {
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${API}/api${path}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) });
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

const who = { email: `qa-day-${Date.now().toString(36)}@example.com`, password: "qa-day-password", name: "Dee" };
const reg = await post("/auth/register", { ...who, inviteCode: "np-dev" });
if (reg.status !== 201) throw new Error(`register failed: ${reg.status} (is the dev API running at ${API}?)`);
const regBody = await reg.json();
const token = regBody.token;
const session = { token, base: API, user: { id: regBody.user?.id, email: regBody.user?.email, name: regBody.user?.name } };

// ---- browsers -----------------------------------------------------------------------------

const allErrors = [];
const counts = new Map(); // page label → POST /me/day/sync sent

async function device(browser, { vp = VIEWPORTS[0], skin = SKINS[0], signedIn = true } = {}) {
  const ctx = await browser.newContext({ viewport: vp.size, reducedMotion: "reduce" });
  await ctx.addInitScript(
    ({ api, look, s }) => {
      try {
        // Once per device (shared by its tabs), then the session once per tab.
        if (!localStorage.getItem("__qa_init")) {
          localStorage.clear();
          localStorage.setItem("__qa_init", "1");
          localStorage.setItem("np.apiBase", api);
          localStorage.setItem("np.appearance.v1", JSON.stringify(look));
        }
        if (!sessionStorage.getItem("__qa")) {
          sessionStorage.setItem("__qa", "1");
          if (s) sessionStorage.setItem("np.session", JSON.stringify(s));
        }
      } catch {
        /* a browser error page (offline) has no storage */
      }
    },
    { api: API, look: skin.look, s: signedIn ? session : null },
  );
  // The dev server's own overlay isn't part of the app.
  await ctx.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
  });
  return ctx;
}

async function tab(ctx, label, path, { quietErrors = [] } = {}) {
  const page = await ctx.newPage();
  counts.set(label, 0);
  page.on("request", (r) => {
    if (r.url() === SYNC && r.method() === "POST") counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  page.on("pageerror", (e) => allErrors.push(`${label}: ${String(e)}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (quietErrors.some((re) => re.test(text))) return;
    allErrors.push(`${label}: ${text}`);
  });
  const answered = nextSync(page, 15000);
  await page.goto(`${WEB}${path}`, { waitUntil: "networkidle" });
  await answered; // the start sync
  return page;
}

/** The next sync answer this page receives. Start waiting before the action. */
const nextSync = (page, timeout = 10000) =>
  page.waitForResponse((r) => r.url() === SYNC && r.request().method() === "POST", { timeout }).then(
    (r) => r,
    () => null,
  );

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("np.app.day.v1") || "null"));
const syncedAt = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("np.app.day.v1") || "{}").sync?.syncedAt ?? null);

/** After an answer arrived: until the page has taken it (it stamps syncedAt). */
const adopted = (page, prev) =>
  page
    .waitForFunction((p) => (JSON.parse(localStorage.getItem("np.app.day.v1") || "{}").sync?.syncedAt ?? null) !== p, prev, { timeout: 5000 })
    .then(() => true, () => false);

/** The tab becomes visible again: the app syncs (§8 "When to sync"), and takes the answer. */
async function syncNow(page) {
  const prev = await syncedAt(page);
  const answered = nextSync(page);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const r = await answered;
  if (r) await adopted(page, prev);
  return r;
}

/** Polls `fn` until it is truthy or `ms` pass. */
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await sleep(250);
  }
}

async function axe(page, label) {
  const r = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  if (r.violations.length) {
    fail(`${label}: ${r.violations.length} axe violation(s)`);
    for (const v of r.violations) {
      console.log(`     - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
      for (const n of v.nodes.slice(0, 3)) console.log(`         ${n.target.join(" ")}`);
    }
  } else pass(`${label}: axe 0 violations (${r.passes.length} rules passed)`);
}

const daySection = (page) => page.locator("section#day");
const statusLine = (page) => daySection(page).locator("p[data-tone]");

// ---- run ----------------------------------------------------------------------------------

const browser = await chromium.launch({ args: ["--use-gl=swiftshader"] });
try {
  console.log(`account ${who.email}`);
  const A = await device(browser);
  const B = await device(browser);

  console.log("\na change made on A shows up on B");
  const a = await tab(A, "A", "/app/");
  const b = await tab(B, "B", "/app/");
  {
    const s = await stored(a);
    check(s?.v === 2 && s.sync?.syncedAt && s.sync.gen === 1, "A synced at start (v2 save, gen 1)", `A's day after start: ${JSON.stringify(s?.sync)}`);
  }

  // A check-in.
  {
    const sent = nextSync(a);
    await a.getByRole("button", { name: /bit off/i }).first().click();
    check(await sent, "A's check-in went up a moment later", "A's check-in was never sent");
    await syncNow(b);
    const vt = await b.getByRole("slider").getAttribute("aria-valuetext");
    check(vt === "Bit off, 50", `B's Home follows A's check-in (slider: “${vt}”)`);
    check(await shows(b.getByText(/^Last check-in: Bit off at/)), "B shows “Last check-in: Bit off …”");
    await b.screenshot({ path: `${OUT}/b-home-after-checkin.png`, fullPage: true });
  }

  // A new anchor, an edit, a tick.
  {
    const in2h = new Date(Date.now() + 2 * 3600e3);
    const hhmm = `${pad2(in2h.getHours())}:${pad2(in2h.getMinutes())}`;
    await a.getByRole("button", { name: /^All anchors|^Add anchor/ }).first().click();
    const dlg = a.getByRole("dialog", { name: "Anchors" });
    await dlg.getByRole("button", { name: "Add anchor" }).click();
    await dlg.getByLabel("Name").fill("Water break");
    await dlg.getByLabel("Time").fill(hhmm);
    await dlg.getByRole("button", { name: "Save" }).click();
    await dlg.getByText(/Saved “Water break”/).waitFor();
    await dlg.getByRole("button", { name: "Edit Water break" }).click();
    await dlg.getByLabel("Name").fill("Water break, outside");
    await dlg.getByRole("button", { name: "Save" }).click();
    await dlg.getByText(/Saved “Water break, outside”/).waitFor();
    const sent = nextSync(a);
    await dlg.getByRole("button", { name: "Done today: Water break, outside" }).click();
    await a.keyboard.press("Escape");
    check(await sent, "A's anchor changes went up (one sync after the last change)");
    await syncNow(b);
    const anchor = (await stored(b)).anchors.find((x) => x.title === "Water break, outside");
    check(anchor && anchor.doneOn === today() && anchor.time.hour === in2h.getHours(), "B has A's new anchor, its new name and today's tick", `B's anchors: ${JSON.stringify((await stored(b)).anchors)}`);
    await b.getByRole("button", { name: /^All anchors|^Add anchor/ }).first().click();
    const bdlg = b.getByRole("dialog", { name: "Anchors" });
    check(await shows(bdlg.getByText("Water break, outside")), "…and shows it in the anchors list");
    check(await shows(bdlg.getByText(/done today/)), "…marked done today");
    await b.screenshot({ path: `${OUT}/b-anchors-after-sync.png` });
    await b.keyboard.press("Escape");
  }

  // A deleted task, then its Undo.
  {
    const mvd = a.locator("section").filter({ has: a.getByRole("heading", { name: "Minimum viable day" }) });
    await mvd.getByRole("button", { name: /^Edit tasks/ }).click();
    let sent = nextSync(a);
    await mvd.getByRole("button", { name: "Remove Walk" }).click();
    check(await sent, "A's deletion went up");
    await syncNow(b);
    const bTitles = async () => (await stored(b)).tasks.map((t) => t.title);
    check(!(await bTitles()).includes("Walk"), "the deleted task is gone on B", `B's tasks: ${(await bTitles()).join(", ")}`);
    const tomb = (await stored(b)).sync.gone.tasks.find((t) => t.id === "mvd-3");
    check(tomb && !("title" in tomb), "B keeps the deletion as a tombstone without content");
    sent = nextSync(a);
    await mvd.getByRole("button", { name: "Undo" }).click();
    check(await sent, "A's Undo went up");
    await syncNow(b);
    check((await bTitles()).includes("Walk"), "Undo brought the task back on B", `B's tasks: ${(await bTitles()).join(", ")}`);
    check(await shows(b.getByText("Walk", { exact: true })), "…and B's Home shows it");
  }

  // A brain-dump line.
  {
    await a.goto(`${WEB}/app/pal/?tool=dump`, { waitUntil: "networkidle" });
    const field = a.getByLabel("A thought, a worry, a to-do");
    const sent = nextSync(a);
    await field.fill("Ask Milena about the SPAD array");
    await field.press("Enter");
    check(await sent, "A's brain-dump line went up");
    await b.goto(`${WEB}/app/pal/?tool=dump`, { waitUntil: "networkidle" });
    check(await shows(b.getByText("Ask Milena about the SPAD array", { exact: true })), "B shows A's brain-dump line");
  }

  console.log("\nan edit made on B while offline syncs when it reconnects");
  {
    await B.setOffline(true);
    const field = b.getByLabel("A thought, a worry, a to-do");
    await field.fill("Written on the train");
    await field.press("Enter");
    await sleep(3500); // past the 2.5 s debounce
    const s = await stored(b);
    check(s.sync.last?.result === "offline", "offline: B keeps the change and notes it couldn't sync", `B's last result: ${JSON.stringify(s.sync.last)}`);
    check(s.dump.some((d) => d.text === "Written on the train"), "…the line is saved in B");
    await B.setOffline(false);
    const reconnected = nextSync(b, 15000);
    await b.goto(`${WEB}/app/settings/#day`, { waitUntil: "networkidle" });
    check(await reconnected, "back online: B syncs");
    check(await shows(statusLine(b).filter({ hasText: /^Synced at / })), "B's Settings line says it synced", `B's line: ${await statusLine(b).innerText().catch(() => "?")}`);
    await syncNow(a);
    check((await stored(a)).dump.some((d) => d.text === "Written on the train"), "A has the line B wrote offline");
  }

  console.log("\nthe server can't be reached: only the Settings line says so, and it retries");
  {
    const tries = [];
    await b.route(SYNC, (route) => {
      tries.push(Date.now());
      return route.abort("connectionrefused");
    });
    await b.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    check(await shows(statusLine(b).filter({ hasText: /^Can’t reach your server right now\. Your day is saved in this browser/ })), "the Settings line says it can't reach the server, and that the day is safe");
    await sleep(6500);
    const gap = tries.length >= 2 ? Math.round((tries[1] - tries[0]) / 100) / 10 : null;
    check(gap !== null && gap >= 4.5 && gap <= 7, `it tried again after about 5 s (${gap ?? "no"} s)`);
    check((await b.getByRole("status").filter({ hasText: "Can’t reach your NeuroPal server" }).count()) === 0, "no app-wide notice for a background sync");
    await daySection(b).scrollIntoViewIfNeeded();
    await daySection(b).screenshot({ path: `${OUT}/b-settings-unreachable.png` });
    await b.unroute(SYNC);
    await syncNow(b);
    check(await shows(statusLine(b).filter({ hasText: /^Synced at / })), "the server answers again: “Synced at …”");
  }

  console.log("\nwith the switch off, B stays local");
  {
    const sw = daySection(b).getByRole("switch", { name: "Keep my day in sync" });
    await sw.click();
    check((await sw.getAttribute("aria-checked")) === "false", "the switch turns off");
    check(await shows(statusLine(b).filter({ hasText: "Off. Your day stays in this browser." })), "the line says the day stays in this browser");
    await b.screenshot({ path: `${OUT}/b-settings-off.png` });
    const before = counts.get("B");
    await b.goto(`${WEB}/app/pal/?tool=dump`, { waitUntil: "networkidle" });
    const field = b.getByLabel("A thought, a worry, a to-do");
    await field.fill("Only in this browser");
    await field.press("Enter");
    await sleep(4000);
    check(counts.get("B") === before, "nothing was sent while off", `B sent ${counts.get("B") - before} sync(s) while off`);
    await syncNow(a);
    check(!(await stored(a)).dump.some((d) => d.text === "Only in this browser"), "A doesn't have B's local line");
    // On again: a first sync (no gen), and B's line is added.
    await b.goto(`${WEB}/app/settings/#day`, { waitUntil: "networkidle" });
    const firstSync = b.waitForRequest((r) => r.url() === SYNC && r.method() === "POST", { timeout: 10000 }).catch(() => null);
    await daySection(b).getByRole("switch", { name: "Keep my day in sync" }).click();
    const req = await firstSync;
    const body = req ? JSON.parse(req.postData() || "{}") : null;
    check(body && !("gen" in body) && !("todos" in body), "on again: a first sync, without gen (and the web app never sends todos)", `body keys: ${body ? Object.keys(body).join(",") : "none"}`);
    await sleep(800);
    await syncNow(a);
    check((await stored(a)).dump.some((d) => d.text === "Only in this browser"), "…and B's line reaches A");
  }

  console.log("\nan anchor from another app keeps its fields through an edit here");
  {
    const now = new Date().toISOString();
    const made = await api("/me/day/sync", token, {
      method: "POST",
      json: { v: 1, anchors: [{ id: "a-expo-qa", title: "Pharmacy", subtitle: "", time: { hour: 17, minute: 0 }, icon: "medication", location: { lat: 41.1, lng: 16.87, radius: 150 }, createdAt: now, updatedAt: now, deletedAt: null, doneOn: null, tickAt: null }] },
    });
    check(made.status === 200, "the anchor was made through the API (as the Expo app would)");
    await a.goto(`${WEB}/app/`, { waitUntil: "networkidle" });
    await syncNow(a);
    await a.getByRole("button", { name: /^All anchors|^Add anchor/ }).first().click();
    const dlg = a.getByRole("dialog", { name: "Anchors" });
    await dlg.getByRole("button", { name: "Edit Pharmacy" }).click();
    await dlg.getByLabel("Name").fill("Pharmacy before six");
    const sent = nextSync(a);
    await dlg.getByRole("button", { name: "Save" }).click();
    check(await sent, "the edit went up");
    await a.keyboard.press("Escape");
    const server = (await api("/me/day", token)).data.anchors.find((x) => x.id === "a-expo-qa");
    check(
      server && server.title === "Pharmacy before six" && server.icon === "medication" && server.location?.radius === 150 && !("flexMinutes" in server) && !("category" in server),
      "on the server: the new name, icon and location intact, nothing added",
      `server copy: ${JSON.stringify(server)}`,
    );
  }

  console.log("\nsign out → sign in brings the day back");
  {
    // A line written just before signing out (inside the 2.5 s wait) still goes, with that session.
    await a.goto(`${WEB}/app/pal/?tool=dump`, { waitUntil: "networkidle" });
    const sentAt = [];
    const onRequest = (r) => {
      if (r.url() === SYNC && r.method() === "POST" && (r.postData() || "").includes("Written just before signing out")) sentAt.push(Date.now());
    };
    a.on("request", onRequest);
    const field = a.getByLabel("A thought, a worry, a to-do");
    await field.fill("Written just before signing out");
    await field.press("Enter");
    const wrote = Date.now();
    await a.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Settings", exact: true }).click();
    const signOut = a.getByRole("button", { name: "Sign out", exact: true });
    await signOut.waitFor();
    const clicked = Date.now();
    await signOut.click();
    await a.getByRole("heading", { level: 1, name: "Welcome back" }).waitFor({ timeout: 10000 });
    const gone = await stored(a);
    check(gone === null, "signing out cleared the day from this browser", `still stored: ${JSON.stringify(gone)?.slice(0, 120)}`);
    await until(() => sentAt.length > 0, 3000);
    a.off("request", onRequest);
    if (clicked - wrote >= 2400) pass(`(the sign-out took ${clicked - wrote} ms, past the 2.5 s wait: the last-change check is inconclusive)`);
    else check(sentAt.length === 1 && sentAt[0] >= clicked, `a change made ${clicked - wrote} ms before signing out was sent as the session ended`, `the last change wasn't sent at sign-out (${sentAt.length} request(s))`);
    await a.getByLabel("Email").fill(who.email);
    await a.getByLabel("Password", { exact: true }).fill(who.password);
    const back = nextSync(a, 15000);
    await a.getByRole("button", { name: "Sign in", exact: true }).click();
    await a.getByRole("heading", { level: 1, name: "Settings" }).waitFor({ timeout: 10000 });
    check(await back, "signed in again: it synced");
    const s = await until(async () => {
      const d = await stored(a);
      return d?.dump?.some((x) => x.text === "Ask Milena about the SPAD array") ? d : null;
    });
    check(s && s.anchors.some((x) => x.title === "Water break, outside") && s.checkins.length > 0, "the day came back: check-ins, anchors, brain dump", `after sign-in: ${JSON.stringify(s)?.slice(0, 200)}`);
    check(s?.dump?.some((x) => x.text === "Written just before signing out"), "…including the line written just before signing out");
    await a.goto(`${WEB}/app/`, { waitUntil: "networkidle" });
    const vt = await a.getByRole("slider").getAttribute("aria-valuetext");
    check(vt === "Bit off, 50", `Home's check-in came back too (“${vt}”)`);
    await a.screenshot({ path: `${OUT}/a-home-after-signin.png`, fullPage: true });
  }

  console.log("\ntwo tabs of one browser don't answer each other's writes");
  {
    const one = await tab(B, "B1", "/app/pal/?tool=dump");
    const two = await tab(B, "B2", "/app/pal/?tool=dump");
    await sleep(1500);
    const start = { one: counts.get("B1"), two: counts.get("B2") };
    const field = two.getByLabel("A thought, a worry, a to-do");
    await field.fill("Written in the second tab");
    await field.press("Enter");
    check(await shows(one.getByText("Written in the second tab", { exact: true }), 3000), "the first tab shows the second tab's line at once (shared storage)");
    await sleep(14000); // past the debounce and the other tab's 10 s backstop
    const mid = { one: counts.get("B1") - start.one, two: counts.get("B2") - start.two };
    check(mid.two === 1 && mid.one === 0, `one change, one sync: the tab it was made in sent it (tab 1: ${mid.one}, tab 2: ${mid.two})`);
    // An answer adopted in one tab shows in the other, which doesn't sync for it.
    const now = new Date().toISOString();
    await api("/me/day/sync", token, { method: "POST", json: { v: 1, dump: [{ id: "d-qa-phone", text: "From the phone", at: now, deletedAt: null }] } });
    await syncNow(one);
    check(await shows(two.getByText("From the phone", { exact: true }), 3000), "a line adopted by the first tab shows in the second");
    await sleep(12000);
    const end = { one: counts.get("B1") - start.one, two: counts.get("B2") - start.two };
    check(end.one === 1 && end.two === 1, `…and nobody synced back: tab 1 sent ${end.one}, tab 2 sent ${end.two} in 26 s`);
    await one.close();
    await two.close();
  }

  console.log("\nSettings › Your day: both skins, 1440×900 and 390×844");
  for (const vp of VIEWPORTS) {
    for (const skin of SKINS) {
      const ctx = await device(browser, { vp, skin });
      const label = `settings-day-${vp.name}-${skin.name}`;
      const page = await tab(ctx, label, "/app/settings/#day");
      await page.getByRole("heading", { level: 2, name: "Your day" }).waitFor();
      check(await shows(statusLine(page).filter({ hasText: /^Synced at / })), `${label}: the line says when it synced`, `${label}: line “${await statusLine(page).innerText().catch(() => "?")}”`);
      const desc = await daySection(page).getByRole("switch").evaluate((el) => (el.getAttribute("aria-describedby") || "").split(" ").map((id) => document.getElementById(id)?.textContent?.trim()).join(" | "));
      check(/Sync never sends them to an AI/.test(desc) && /Synced at/.test(desc), `${label}: the switch is described by the help and the status line`);
      await daySection(page).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await daySection(page).screenshot({ path: `${OUT}/${label}.png` });
      await axe(page, label);
      await ctx.close();
    }
  }

  console.log("\nan erase on another device empties the day here");
  {
    const del = await api("/me/day", token, { method: "DELETE" });
    check(del.status === 200 && del.data?.gen === 2, `the day was erased on the server (gen ${del.data?.gen})`);
    const prev = await syncedAt(b);
    await b.goto(`${WEB}/app/`, { waitUntil: "networkidle" });
    await adopted(b, prev);
    const s = await stored(b);
    check(s.tasks.length === 0 && s.anchors.length === 0 && s.dump.length === 0 && s.checkins.length === 0 && s.state === null && s.sync.gen === 2, "B's day was replaced by the erased one (gen 2)", `B after the erase: ${JSON.stringify({ tasks: s.tasks.length, anchors: s.anchors.length, dump: s.dump.length, checkins: s.checkins.length, state: s.state, gen: s.sync.gen })}`);
    check((await b.getByRole("slider").getAttribute("aria-valuetext")) === "Not checked in yet", "…Home shows no check-in");
  }

  // The requests this script aborts on purpose (offline, unreachable) are logged by the browser itself.
  const real = allErrors.filter((e) => !/Download the React DevTools|net::ERR_INTERNET_DISCONNECTED|Failed to load resource: net::ERR_CONNECTION_REFUSED/.test(e));
  check(real.length === 0, "no console errors", `console errors:\n     ${real.slice(0, 8).join("\n     ")}`);
  await A.close();
  await B.close();
} catch (e) {
  fail(`stopped: ${String(e).split("\n")[0]}`);
} finally {
  await browser.close();
}

console.log(failures ? `\n✗ ${failures} problem(s). Screenshots: ${OUT}` : `\n✓ all good. Screenshots: ${OUT}`);
process.exit(failures ? 1 : 0);
