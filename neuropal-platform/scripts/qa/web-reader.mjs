#!/usr/bin/env node
// QA for the Library, the Reader (text, original pages, EPUB) and Ask.
//   1. a dev API (real backend, fake AI):  node scripts/qa/dev-api.cjs 4420
//   2. the dev server:  NP_DIST_DIR=.next-web-reader npx next dev -p 4320
//   3. node scripts/qa/web-reader.mjs [--web http://localhost:4320] [--api http://127.0.0.1:4420] [--out <dir>] [--only library,reader,ask,epub,pages,states,accounts,tickets]
// Visits every screen and state at 1440×900 and 390×844 in both skins, saves
// screenshots, runs axe (any violation fails, the EPUB frame included), fails
// on console errors, and checks what matters: resume, karaoke from a clicked
// word, the timing fallback when a voice sends no word events, keyboard
// shortcuts, progress saving, uploads with progress, citations that scroll
// and flash, and the EPUB frame's sandbox.
// Headless Chromium has no voices, so a small fake speechSynthesis stands in
// (it speaks nothing; it fires start / word boundaries / end on a timer).
import AxeBuilderModule from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const AxeBuilder = AxeBuilderModule.default ?? AxeBuilderModule;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
// Next's dev server only serves its dev resources to "localhost".
const WEB = arg("web", "http://localhost:4320").replace(/\/+$/, "");
const API = arg("api", "http://127.0.0.1:4420").replace(/\/+$/, "");
const OUT = arg("out", "shots/web-reader");
const ONLY = (arg("only", "") || "").split(",").filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const EMAIL = "ryx@example.com";
const PASSWORD = "neuropal-dev-1";
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
const fail = (msg) => {
  failures += 1;
  console.log(`  ✗ ${msg}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));

async function api(path, { token, method = "GET", json, form } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) body = form;
  const r = await fetch(`${API}/api${path}`, { method, headers, body });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 160)}`);
  return data;
}

// ---- a small valid PDF (3 pages of text), so "Original pages" has real pages --------
function samplePdf() {
  const objs = [];
  const pageIds = [3, 5, 7];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count 3 >>`;
  pageIds.forEach((id, k) => {
    const lines = [`BT /F1 22 Tf 72 760 Td (Section ${k + 1}: counting photons) Tj ET`];
    for (let l = 0; l < 24; l++) lines.push(`BT /F1 12 Tf 72 ${720 - l * 22} Td (Page ${k + 1}, line ${l + 1}: a detector clicks when a photon arrives.) Tj ET`);
    const stream = lines.join("\n");
    objs[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objs[id + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objs[9] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// ---- a small EPUB (a stored ZIP: two chapters and a stylesheet) ------------------------
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [entry, text] of files) {
    const name = Buffer.from(entry);
    const data = Buffer.from(text);
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26);
    parts.push(head, name, data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += head.length + name.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

function sampleEpub() {
  const page = (title, text) =>
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title><link rel="stylesheet" href="style.css"/></head><body><h1>${title}</h1><p>${text}</p></body></html>`;
  return storedZip([
    ["mimetype", "application/epub+zip"],
    ["META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ["OEBPS/content.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'],
    ["OEBPS/nav.xhtml", '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">1. Tickets</a></li><li><a href="ch2.xhtml">2. Fresh ones</a></li></ol></nav></body></html>'],
    ["OEBPS/ch1.xhtml", page("1. Tickets", "A reading pass for one document, valid for a while.")],
    ["OEBPS/ch2.xhtml", page("2. Fresh ones", "A new password means new passes.")],
    ["OEBPS/style.css", "body{line-height:1.5}"],
  ]);
}

// ---- a fake speech engine for headless Chromium ---------------------------------------
const FAKE_SPEECH = () => {
  const voices = [
    { voiceURI: "qa-voice-en", name: "QA Voice", lang: "en-US", localService: true, default: true },
    { voiceURI: "qa-voice-it", name: "QA Voce", lang: "it-IT", localService: true, default: false },
  ];
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
    spoken: [],
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
      this.spoken.push(u.text);
      const words = [...u.text.matchAll(/\S+/g)];
      const per = 60000 / (180 * (u.rate || 1)) / (window.__qaSpeed || 1);
      this.timer = setTimeout(() => {
        if (this.current !== u) return;
        u.onstart?.({});
        let k = 0;
        const step = () => {
          if (this.current !== u) return;
          if (k < words.length) {
            if (window.__qaBoundaries !== false) u.onboundary?.({ name: "word", charIndex: words[k].index });
            k += 1;
            this.timer = setTimeout(step, per);
          } else {
            this.current = null;
            this.speaking = false;
            u.onend?.({});
            // onend may already have queued (and started) the next one
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

async function newContext(browser, vp, skin, session) {
  const context = await browser.newContext({ viewport: vp.size, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await context.addInitScript(
    ({ base, session: s, look }) => {
      try {
        localStorage.setItem("np.apiBase", base);
        sessionStorage.setItem("np.session", JSON.stringify(s));
        localStorage.setItem("np.appearance.v1", JSON.stringify(look));
      } catch {
        /* storage blocked */
      }
    },
    { base: API, session, look: skin.look },
  );
  await context.addInitScript(FAKE_SPEECH);
  return context;
}

async function open(context, path, errors) {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${String(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console ${m.text()}`);
  });
  await page.goto(`${WEB}${path}`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function axe(page, label, { inFrame = false } = {}) {
  // In the EPUB frame axe can't fetch stylesheets (the chapter's policy
  // refuses every connection, as it should), so it skips that step there.
  const builder = new AxeBuilder({ page });
  const r = await (inFrame ? builder.options({ preload: false }) : builder).analyze();
  if (r.violations.length) {
    fail(
      `axe ${label}: ${r.violations
        .map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)
        .join("; ")}`,
    );
  } else pass(`axe ${label}: 0 violations (${r.passes.length} rules passed)`);
}

async function shot(page, name, full = false) {
  await page.waitForTimeout(250);
  if (full) {
    // The backdrop is fixed (one viewport tall): stretch it for a full-page capture.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.addStyleTag({ content: `.np-backdrop{position:absolute!important;bottom:auto!important;height:${height}px!important}` });
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
}

async function noOverflow(page, label) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  const vw = await page.evaluate(() => window.innerWidth);
  check(w <= vw + 1, `${label}: no sideways scroll (${w} ≤ ${vw})`);
}

const activeWord = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-on="true"]');
    return el ? Number(el.getAttribute("data-w")) : -1;
  });

// ---------------------------------------------------------------------------------------
const browser = await chromium.launch();
try {
  const login = await api("/auth/login", { method: "POST", json: { email: EMAIL, password: PASSWORD } });
  const session = { token: login.token, base: API, user: login.user ?? null };
  const token = login.token;
  const docs = await api("/documents", { token });
  const byTitle = (t) => docs.find((d) => d.title.startsWith(t));
  const cpi = byTitle("Correlation plenoptic");
  const notes = byTitle("PhD exam notes");
  const epub = docs.find((d) => d.type === "epub");
  const failed = docs.find((d) => d.status === "failed");
  const processing = docs.find((d) => ["pending", "parsing", "chunking", "embedding"].includes(d.status));
  if (!cpi || !epub) throw new Error("the dev API's seeded documents are missing");
  const resetPositions = async () => {
    await api(`/documents/${cpi._id}/progress`, { token, method: "PATCH", json: { lastWordIndex: 120, progress: 0.42 } });
    await api(`/documents/${epub._id}/progress`, { token, method: "PATCH", json: { lastWordIndex: 0, lastPage: 0, progress: 0 } });
  };

  // A real PDF for the page images; its text and status are filled in below
  // (the dev API has no embedder, so its own ingest stops before "ready").
  const form = new FormData();
  form.append("file", new Blob([samplePdf()], { type: "application/pdf" }), "counting-photons.pdf");
  form.append("title", "Counting photons (sample PDF)");
  const pdf = await api("/documents/upload", { token, method: "POST", form });
  const pdfId = pdf._id;
  const pdfText = {
    id: pdfId,
    title: "Counting photons (sample PDF)",
    text: [1, 2, 3]
      .map((k) => [`Section ${k}: counting photons`, ...Array.from({ length: 3 }, (_, l) => `Page ${k}, part ${l + 1}. A detector clicks when a photon arrives, and the clicks are counted.`)].join("\n\n"))
      .join("\n\n"),
    pageCount: 3,
    wordCount: 200,
    toc: [
      { title: "Section 1: counting photons", startParagraph: 0, startPage: 1 },
      { title: "Section 2: counting photons", startParagraph: 4, startPage: 2 },
      { title: "Section 3: counting photons", startParagraph: 8, startPage: 3 },
    ],
    pageMap: [
      { page: 1, startParagraph: 0 },
      { page: 2, startParagraph: 4 },
      { page: 3, startParagraph: 8 },
    ],
    source: "chunks",
  };
  const readyPdf = (d) => ({ ...d, status: "ready", progress: 1, pageCount: 3, wordCount: 200, ingestError: undefined });
  const mockPdf = async (context) => {
    await context.route(`${API}/api/documents/${pdfId}`, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const r = await route.fetch();
      return route.fulfill({ response: r, json: readyPdf(await r.json()) });
    });
    await context.route(`${API}/api/documents/${pdfId}/text`, (route) => route.fulfill({ json: pdfText }));
    await context.route(new RegExp(`^${API.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/documents(\\?.*)?$`), async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const r = await route.fetch();
      const list = await r.json();
      return route.fulfill({ response: r, json: Array.isArray(list) ? list.map((d) => (d._id === pdfId ? readyPdf(d) : d)) : list });
    });
  };

  let uploadedOnce = false;
  const created = new Set([pdfId]);
  const known = new Set(docs.map((d) => d._id));

  for (const skin of SKINS) {
    for (const vp of VIEWPORTS) {
      const tag = `${vp.name}-${skin.name}`;
      console.log(`\n— ${skin.name} @ ${vp.name}`);
      const errors = [];
      await resetPositions();
      const context = await newContext(browser, vp, skin, session);
      await mockPdf(context);

      // ---------------------------------------------------------------- library --
      if (want("library")) {
        const page = await open(context, "/app/library/", errors);
        await page.getByRole("heading", { level: 1, name: "Library" }).waitFor();
        await page.locator('a[href*="/app/read/?doc="]').first().waitFor();
        await shot(page, `library-${tag}`, true);
        await axe(page, `library ${tag}`);
        await noOverflow(page, `library ${tag}`);
        check((await page.getByText(/No readable text was found in this file/).count()) > 0, "failed document says why in plain words");
        check((await page.getByText(/Preparing it for questions/).count()) > 0, "processing document shows its stage");

        // search on the server
        await page.getByLabel("Search your library").fill("plenoptic");
        await page.getByText(/1 match for “plenoptic”/).waitFor({ timeout: 6000 });
        pass("search asks the server and says how many match");
        await page.getByLabel("Search your library").fill("");
        await page.getByText(/documents$/).first().waitFor({ timeout: 6000 });

        // sort by title
        await page.getByLabel("Sort").selectOption("title");
        const titles = await page.locator("h2 a[href*='/app/read/']").allInnerTexts();
        const sorted = [...titles].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
        check(JSON.stringify(titles) === JSON.stringify(sorted), "sort by title");
        await page.getByLabel("Sort").selectOption("recent");

        // rename + delete dialogs (open, Escape closes, focus returns)
        const more = page.getByRole("button", { name: /^More for “Correlation plenoptic/ });
        await more.click();
        await page.getByRole("button", { name: "Rename" }).click();
        await page.getByRole("dialog", { name: "Rename" }).waitFor();
        if (vp.name === "1440" && skin.name === "signal") await shot(page, `library-rename-${tag}`);
        await axe(page, `rename dialog ${tag}`);
        await page.keyboard.press("Escape");
        await page.getByRole("dialog", { name: "Rename" }).waitFor({ state: "hidden" });
        check(await more.evaluate((el) => el === document.activeElement), "Escape closes the dialog and focus goes back");
        await more.click();
        await page.getByRole("button", { name: "Delete" }).click();
        await page.getByRole("dialog", { name: /^Delete/ }).waitFor();
        await axe(page, `delete dialog ${tag}`);
        await page.getByRole("button", { name: "Keep it" }).click();

        // uploads: a file NeuroPal can't read, then a real one with progress (slow network)
        if (!uploadedOnce || vp.name === "390") {
          await page.locator('input[type="file"]').setInputFiles({ name: "photo.heic", mimeType: "image/heic", buffer: Buffer.from("x") });
          await page.getByText(/can’t read \.heic files yet/).waitFor();
          pass("an unreadable file type is refused with a reason");
          const cdp = await context.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 4e6, uploadThroughput: 220 * 1024 });
          const big = Buffer.from("A paragraph about photon counting.\n\n".repeat(60000));
          await page.locator('input[type="file"]').setInputFiles({ name: "long-notes.txt", mimeType: "text/plain", buffer: big });
          await page.getByText(/Uploading · \d+% of/).waitFor({ timeout: 10000 });
          await page.waitForTimeout(1500);
          await shot(page, `library-uploading-${tag}`);
          await axe(page, `library mid-upload ${tag}`);
          const pct = await page.locator("progress").first().getAttribute("value");
          check(Number(pct) > 0 && Number(pct) < 100, `upload shows progress (${pct}%)`);
          await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
          await page.getByText("Added. Processing has started.").waitFor({ timeout: 30000 });
          pass("upload finishes and the document joins the list");
          await page.getByRole("button", { name: "Clear finished" }).click();
          uploadedOnce = true;
        }
        await page.close();
      }

      // ----------------------------------------------------------------- reader --
      if (want("reader")) {
        const page = await open(context, `/app/read/?doc=${cpi._id}`, errors);
        await page.locator("article").waitFor();
        await page.waitForTimeout(600);
        const resumed = await activeWord(page);
        check(resumed === 120, `opens at the saved word (word ${resumed})`);
        await shot(page, `reader-idle-${tag}`);
        await axe(page, `reader idle ${tag}`);
        await noOverflow(page, `reader ${tag}`);

        // click a word → reading starts there and the highlight moves
        const target = page.locator('p[data-p="6"] [data-run]').first();
        await target.waitFor();
        await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
        // the first line of the run (a wrapped span's box spans every line)
        const first = await target.evaluate((el) => {
          const r = el.getClientRects()[0];
          return { x: r.left, y: r.top, h: r.height };
        });
        await page.mouse.click(first.x + 4, first.y + first.h / 2);
        await page.waitForTimeout(250);
        const started = await activeWord(page);
        const p6 = await page.evaluate(() => {
          const el = document.querySelector('[data-p="6"] [data-w]');
          return el ? Number(el.getAttribute("data-w")) : -1;
        });
        check(started >= p6 && started < p6 + 3, `clicking a word starts reading there (word ${started}, paragraph starts at ${p6})`);
        await page.waitForTimeout(1300);
        const moved = await activeWord(page);
        check(moved > started, `the highlight follows the voice (${started} → ${moved})`);
        check(await page.getByRole("button", { name: "Pause", exact: true }).isVisible(), "the player shows Pause while reading");
        await shot(page, `reader-reading-${tag}`);
        await axe(page, `reader reading aloud ${tag}`);

        // keyboard: Space pauses, → next sentence, Shift+↓ next paragraph
        await page.locator("body").click({ position: { x: 2, y: 2 } }).catch(() => undefined);
        await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
        await page.keyboard.press(" ");
        await page.getByRole("button", { name: "Play", exact: true }).waitFor();
        pass("Space pauses");
        const beforeNext = await activeWord(page);
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        const afterNext = await activeWord(page);
        check(afterNext > beforeNext, `→ goes to the next sentence (${beforeNext} → ${afterNext})`);
        await page.keyboard.press("Shift+ArrowDown");
        await page.waitForTimeout(200);
        const afterPara = await activeWord(page);
        check(afterPara > afterNext, `Shift+↓ goes to the next paragraph (${afterNext} → ${afterPara})`);

        // a voice with no word events: the timing estimate still moves the highlight
        await page.evaluate(() => {
          window.__qaBoundaries = false;
        });
        await page.keyboard.press(" ");
        await page.waitForTimeout(1600);
        const est = await activeWord(page);
        check(est > afterPara, `no word events: the estimate moves the highlight (${afterPara} → ${est})`);
        await page.keyboard.press(" ");
        await page.evaluate(() => {
          window.__qaBoundaries = true;
        });

        // the resume point is saved
        await page.waitForTimeout(3200);
        const prog = await api(`/documents/${cpi._id}/progress`, { token });
        const now = await activeWord(page);
        check(Math.abs((prog.lastWordIndex ?? -1) - now) <= 1, `progress saved (server ${prog.lastWordIndex}, reader ${now})`);

        // chapters
        if (vp.name === "390") {
          await page.getByRole("button", { name: "Chapters" }).click();
          await page.getByRole("dialog", { name: "Chapters" }).waitFor();
          await shot(page, `reader-chapters-${tag}`);
          await axe(page, `chapters sheet ${tag}`);
          await page.getByRole("button", { name: /^4 Limits/ }).click();
          await page.getByRole("dialog", { name: "Chapters" }).waitFor({ state: "hidden" });
        } else {
          const nav = page.getByRole("navigation", { name: "Chapters" });
          if (!(await nav.isVisible())) await page.getByRole("button", { name: "Chapters" }).click();
          await nav.waitFor();
          await shot(page, `reader-chapters-${tag}`);
          await nav.getByRole("button", { name: /^4 Limits/ }).click();
        }
        await page.waitForTimeout(400);
        const limitsStart = await page.evaluate(() => {
          const el = [...document.querySelectorAll("[data-p]")].find((p) => p.textContent?.trim() === "4 Limits");
          return el ? Number(el.querySelector("[data-w]")?.getAttribute("data-w") ?? el.querySelector("[data-run]")?.getAttribute("data-run") ?? -1) : -1;
        });
        const atLimits = await activeWord(page);
        check(limitsStart >= 0 && atLimits === limitsStart, `a chapter jumps the reading position (${atLimits} = ${limitsStart})`);
        await page.close();
      }

      // -------------------------------------------------------------------- ask --
      if (want("ask")) {
        const page = await open(context, `/app/read/?doc=${cpi._id}&ask=1`, errors);
        await page.locator("article").waitFor();
        const input = page.getByLabel("Your question");
        await input.waitFor();
        await page.waitForTimeout(400); // earlier questions load first
        const answers = page.locator("li").filter({ has: page.getByText("Copy answer") });
        const before = await answers.count();
        await input.fill("What limits correlation plenoptic imaging?");
        await input.press("Enter");
        await page.waitForFunction(
          ({ n }) => [...document.querySelectorAll("li")].filter((li) => /Copy answer|Copied/.test(li.textContent || "")).length > n,
          { n: before },
          { timeout: 15000 },
        );
        pass("the new answer arrives");
        const chip = page.locator('button[class*="chip"]').filter({ hasText: /p\. 1/ }).last();
        await chip.waitFor({ timeout: 15000 });
        check((await page.locator("li strong").filter({ hasText: "Dev server answer" }).count()) > 0, "the answer's Markdown is rendered (bold)");
        await shot(page, `ask-answer-${tag}`);
        await axe(page, `ask with an answer ${tag}`);
        const chipName = await chip.evaluate((el) => el.textContent.replace(/\s+/g, " ").trim());
        check(/^Source 1: p\. 1 · /.test(chipName), `the chip's name says what it is (“${chipName}”)`);
        const chipText = (await chip.innerText()).replace(/\s+/g, " ").trim();
        check(/p\. 1 · /.test(chipText), `citation chip names page and chapter (“${chipText}”)`);
        await chip.click();
        await page.waitForTimeout(500);
        const flashed = await page.evaluate(() => {
          const el = document.activeElement;
          return !!el && el.hasAttribute("data-p") && /flash/.test(el.className);
        });
        check(flashed, "the citation scrolls to the passage, focuses it and flashes it");
        // Enter sends, Shift+Enter is a new line
        if (vp.name === "390") {
          await page.getByRole("button", { name: "Ask" }).first().click().catch(() => undefined);
          await input.waitFor().catch(() => undefined);
        }
        if (await input.isVisible()) {
          await input.fill("line one");
          await input.press("Shift+Enter");
          await input.type("line two");
          check((await input.inputValue()).includes("\n"), "Shift+Enter adds a new line");
          await input.fill("");
        }
        await page.close();
      }

      // ------------------------------------------------------------------- epub --
      if (want("epub")) {
        const page = await open(context, `/app/read/?doc=${epub._id}`, errors);
        const frameEl = page.locator('iframe[title^="Chapter 1 of 2"]');
        await frameEl.waitFor();
        const sandbox = await frameEl.getAttribute("sandbox");
        check(sandbox === "allow-scripts", `the chapter frame is sandboxed without same-origin (${sandbox})`);
        const frame = page.frameLocator('iframe[title^="Chapter 1 of 2"]');
        await frame.locator("h1").waitFor();
        await page.waitForTimeout(500);
        await shot(page, `epub-chapter-${tag}`);
        const cf = page.frames().find((f) => f.url() === "about:srcdoc");
        const isolated = cf ? await cf.evaluate(() => {
          try {
            return window.parent.document && false;
          } catch {
            return true;
          }
        }) : false;
        check(isolated, "the book's page can't reach the app's page");
        const policy = cf ? await cf.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") || "") : "";
        check(/script-src 'nonce-[0-9a-f]{32}'(;|$)/.test(policy) && !/unsafe-eval/.test(policy), "the chapter's policy allows only our nonce'd script (no eval)");
        await axe(page, `epub chapter ${tag}`, { inFrame: true });
        // read aloud in the book
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await page.waitForTimeout(1200);
        const lit = cf ? await cf.evaluate(() => (CSS.highlights && CSS.highlights.has("np-karaoke")) || !!document.querySelector(".np-word-active")) : false;
        check(lit, "EPUB read-aloud highlights the spoken word inside the book");
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        // next chapter
        await page.getByRole("button", { name: "Next chapter" }).click();
        await page.locator('iframe[title^="Chapter 2 of 2"]').waitFor();
        pass("next chapter loads");
        await page.close();
      }

      // ------------------------------------------------------------------ pages --
      if (want("pages")) {
        const page = await open(context, `/app/read/?doc=${pdfId}`, errors);
        await page.locator("article").waitFor();
        if (vp.name === "390") {
          await page.getByRole("button", { name: "Display" }).click();
          await page.getByRole("button", { name: "Original pages" }).click();
          await page.keyboard.press("Escape");
        } else {
          await page.getByRole("button", { name: "Pages" }).click();
        }
        await page.locator('img[alt="Page 1 of 3"]').waitFor();
        await page.waitForFunction(() => {
          const img = document.querySelector('img[alt="Page 1 of 3"]');
          return img && img.complete && img.naturalWidth > 0;
        }, null, { timeout: 15000 });
        await shot(page, `reader-pages-${tag}`);
        await axe(page, `original pages ${tag}`);
        await page.close();
      }

      // ------------------------------------------------------------ odd states --
      if (want("states") && vp.name === "1440") {
        if (failed) {
          const page = await open(context, `/app/read/?doc=${failed._id}`, errors);
          await page.getByRole("button", { name: "Try processing again" }).waitFor();
          await shot(page, `reader-failed-${tag}`);
          await axe(page, `reader failed ${tag}`);
          await page.close();
        }
        if (processing) {
          const page = await open(context, `/app/read/?doc=${processing._id}`, errors);
          await page.getByText(/still being processed/).waitFor();
          await shot(page, `reader-processing-${tag}`);
          await axe(page, `reader processing ${tag}`);
          await page.close();
        }
        if (notes) {
          const page = await open(context, `/app/read/?doc=${notes._id}`, errors);
          await page.locator("article").waitFor();
          await axe(page, `reader notes ${tag}`);
          await page.close();
        }
      }

      const real = errors.filter((e) => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(e));
      if (real.length) fail(`console errors ${tag}: ${real.slice(0, 6).join(" | ")}`);
      else pass(`no console errors ${tag}`);
      await context.close();
    }
  }
  // --------------------------------------------------- uploads across accounts --
  // Files still uploading or waiting when one account signs out never go into
  // the next account's library, and none of their names show there.
  if (want("accounts")) {
    const vp = VIEWPORTS[0];
    const skin = SKINS[0];
    const tag = `${vp.name}-${skin.name}`;
    console.log(`\n— uploads across a sign-out @ ${tag}`);
    const errors = [];
    const email = "qa-uli@example.com";
    const password = "qa-uli-password";
    let r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (r.status === 401) {
      r = await fetch(`${API}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, name: "Uli", inviteCode: "np-dev" }) });
    }
    if (!r.ok) throw new Error(`${email}: sign-in failed (${r.status})`);
    const uli = await r.json();
    const context = await newContext(browser, vp, skin, session);
    const page = await open(context, "/app/library/", errors);
    const appNav = (name) => page.getByRole("navigation", { name: "App" }).getByRole("link", { name, exact: true }).click();
    try {
      await page.getByRole("heading", { level: 1, name: "Library" }).waitFor();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 4e6, uploadThroughput: 48 * 1024 });
      const stamp = Date.now().toString(36);
      const names = ["one", "two", "three"].map((n) => `queued-${n}-${stamp}`);
      const body = Buffer.from("Photon counting notes, kept for later.\n\n".repeat(36000));
      await page.locator('input[type="file"]').setInputFiles(names.map((n) => ({ name: `${n}.txt`, mimeType: "text/plain", buffer: body })));
      await page.getByText(/Uploading · \d+% of/).first().waitFor({ timeout: 10000 });
      check((await page.getByText("Waiting to upload").count()) === 1, "uploads: two go up while one waits", "uploads: no file is waiting");
      // Sign out in the app (the queue's page stays loaded), mid-upload.
      await appNav("Settings");
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.getByRole("heading", { level: 1, name: "Welcome back" }).waitFor({ timeout: 10000 });
      check(
        (await page.getByText(/3 uploads that hadn’t finished were stopped/).count()) > 0,
        "uploads: the sign-in screen says the unfinished uploads were stopped",
        "uploads: no note about the stopped uploads",
      );
      await shot(page, `signin-uploads-stopped-${tag}`);
      // Uli signs in on the same tab, and the network is fast again.
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor({ timeout: 10000 });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await appNav("Library");
      await page.getByRole("heading", { level: 1, name: "Library" }).waitFor();
      await page.waitForTimeout(5000);
      const shown = await page.evaluate((list) => list.filter((n) => document.body.innerText.includes(n)), names);
      check(shown.length === 0, "uploads: none of the earlier files are listed for the next account", `uploads: shown to Uli: ${shown.join(", ")}`);
      const uliDocs = await api("/documents", { token: uli.token });
      const landed = uliDocs.filter((d) => names.some((n) => String(d.title).includes(n)));
      check(landed.length === 0, "uploads: nothing queued before the sign-out went into the next account’s library", `uploads: went into Uli’s library: ${landed.map((d) => d.title).join(", ")}`);
      const mine = (await api("/documents", { token })).filter((d) => names.some((n) => String(d.title).includes(n)));
      check(mine.length === 0, "uploads: the stopped uploads didn’t finish into the first account’s library either", `uploads: still landed for Ryx: ${mine.map((d) => d.title).join(", ")}`);
      await axe(page, `library after the account changed ${tag}`);
    } catch (e) {
      fail(`uploads across a sign-out: ${String(e).split("\n")[0]}`);
      await page.screenshot({ path: `${OUT}/FAILED-uploads-accounts.png` }).catch(() => undefined);
    }
    const real = errors.filter((e) => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(e));
    if (real.length) fail(`console errors uploads across a sign-out: ${real.slice(0, 6).join(" | ")}`);
    else pass("no console errors uploads across a sign-out");
    await page.close();
    await context.close();
  }

  // ------------------------------------------------ tickets after a password change --
  // A password changed in this tab makes the book's old reading passes
  // useless: the reader asks for fresh ones and the book still opens.
  if (want("tickets")) {
    const vp = VIEWPORTS[0];
    const skin = SKINS[0];
    console.log(`\n— an EPUB after a password change @ ${vp.name}-${skin.name}`);
    const errors = [];
    const email = `qa-epub-${Date.now().toString(36)}@example.com`;
    const password = "qa-epub-password-1";
    const reg = await fetch(`${API}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, name: "Eve", inviteCode: "np-dev" }) });
    if (!reg.ok) throw new Error(`${email}: couldn't create the account (${reg.status})`);
    const eve = await reg.json();
    const book = new FormData();
    book.append("file", new Blob([sampleEpub()], { type: "application/epub+zip" }), "tickets.epub");
    const up = await api("/documents/upload", { token: eve.token, method: "POST", form: book });
    const context = await newContext(browser, vp, skin, { token: eve.token, base: API, user: { id: eve.user?.id, email, name: "Eve" } });
    const page = await open(context, `/app/read/?doc=${up._id}`, errors);
    const chapterShows = async (n) => {
      await page.locator(`iframe[title^="Chapter ${n} of 2"]`).waitFor({ timeout: 10000 });
      await page.frameLocator(`iframe[title^="Chapter ${n} of 2"]`).locator("h1").waitFor({ timeout: 10000 });
    };
    try {
      await chapterShows(1);
      pass("the book opens with a reading pass");
      await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "Settings", exact: true }).click();
      await page.getByRole("button", { name: "Change password" }).click();
      await page.getByLabel("Current password").fill(password);
      await page.getByLabel("New password").fill(`${password}-new`);
      await page.getByRole("button", { name: "Save new password" }).click();
      await page.getByText("Password changed. Every other device was signed out.").waitFor({ timeout: 10000 });
      await page.goBack();
      await chapterShows(1);
      check((await page.getByText(/This chapter couldn’t be loaded/).count()) === 0, "after a password change in this tab, the book opens again", "after a password change, the chapter didn't load");
      await page.getByRole("button", { name: "Next chapter" }).click();
      await chapterShows(2);
      pass("…and turning the page works with the fresh pass");
    } catch (e) {
      fail(`an EPUB after a password change: ${String(e).split("\n")[0]}`);
      await page.screenshot({ path: `${OUT}/FAILED-epub-password.png` }).catch(() => undefined);
    }
    const real = errors.filter((e) => !/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(e));
    if (real.length) fail(`console errors an EPUB after a password change: ${real.slice(0, 6).join(" | ")}`);
    else pass("no console errors an EPUB after a password change");
    await page.close();
    await context.close();
  }

  // Leave the dev library as it was: remove what this run added.
  for (const d of await api("/documents", { token })) if (!known.has(d._id)) created.add(d._id);
  for (const id of created) await api(`/documents/${id}`, { token, method: "DELETE" }).catch(() => undefined);
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed. Screenshots: ${OUT}` : `\nAll checks passed. Screenshots: ${OUT}`);
process.exit(failures ? 1 : 0);
