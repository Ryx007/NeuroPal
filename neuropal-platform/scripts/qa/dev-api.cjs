/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS Node script that loads the backend */
// A real NeuroPal API (public sign-in mode) on an in-memory MongoDB, seeded
// with documents, for building and checking the web app (scripts/qa/*):
//   node scripts/qa/dev-api.cjs <port> [--cors http://localhost:4310]
// Needs neuropal-backend's node_modules (cd neuropal-backend && npm ci).
// Prints the seeded account. The AI is a FAKE (fixed, labelled answers) —
// there's no model in this sandbox; embeddings are off, so Ask uses the
// server's no-vector fallback path. Invite code for new accounts: np-dev
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const BACKEND = path.resolve(__dirname, "../../../neuropal-backend");
const nm = (m) => require(path.join(BACKEND, "node_modules", m));
const mongoose = nm("mongoose");
const { MongoMemoryServer } = nm("mongodb-memory-server");
const AdmZip = nm("adm-zip");

const port = Number(process.argv[2] || 4400);
const corsArg = process.argv.indexOf("--cors");
const EMAIL = "ryx@example.com";
const PASSWORD = "neuropal-dev-1";

// ---- the fake AI (installed before the app loads the real module) ----------
// Ask and Pal get fixed, labelled answers. The study routes (study.js) get
// answers in the shapes a real model returns for their prompts: a Markdown
// summary or cheat sheet with headings, bold, lists (and maths), a quiz in
// the asked-for format (numbered, **[level]** tags, "**Answer:**" lines),
// an explanation of the passage, and {cards:[{front,back}]} — built from the
// chunks the route passes, so they read like the document.
const providerPath = require.resolve(path.join(BACKEND, "src/services/aiProvider.js"));
const flat = (t) => String(t || "").replace(/\s+/g, " ").trim();
const sentencesOf = (t) => flat(t).match(/[^.!?]+[.!?]+(?=\s|$)/g)?.map((s) => s.trim()).filter((s) => s.split(" ").length >= 4) ?? [];
const studyPoints = (chunks, n) => {
  const all = chunks.flatMap((c) => sentencesOf(c.text).map((s) => ({ s, page: c.anchor?.page || 1 })));
  if (!all.length) all.push({ s: "The document has very little text to work from.", page: 1 });
  return Array.from({ length: n }, (_, i) => all[Math.floor((i * all.length) / n) % all.length]);
};
const lead = (s, words = 4) => s.split(" ").slice(0, words).join(" ").replace(/[,;:.]$/, "");
/** "**Measuring correlations between** two detectors…" */
const boldLead = (s, words = 3) => {
  const w = s.split(" ");
  return `**${w.slice(0, words).join(" ")}** ${w.slice(words).join(" ")}`;
};
const cite = (chunks) => chunks.slice(0, 2).map((c) => ({ chunkId: c._id || c.chunkId, page: c.anchor?.page || 1, excerpt: String(c.text).slice(0, 120) }));
const DEV_LABEL = "_Dev server (no AI model here): built from the document’s own sentences._";

function fakeStudyAnswer(question, chunks, docTitle) {
  const depth = /tight executive summary/.test(question) ? "quick" : /section-by-section/.test(question) ? "comprehensive" : "intuitive";
  if (/^Summarize this document/.test(question)) {
    const pts = studyPoints(chunks, depth === "quick" ? 4 : depth === "comprehensive" ? 8 : 6);
    const parts = [
      `### What it is about`,
      `*${docTitle}*: ${pts[0].s}`,
      `### Key ideas`,
      ...pts.slice(1, depth === "quick" ? 4 : 5).map((p) => `- ${boldLead(p.s)}`),
    ];
    if (depth !== "quick") parts.push(`### Why it matters`, pts[pts.length - 1].s, "In symbols, the idea the text keeps returning to is $g^{(2)}(0) = 1$ for a coherent source.");
    if (depth === "comprehensive") parts.push(`### Section by section`, ...pts.slice(5).map((p, i) => `${i + 1}. ${p.s}`));
    return [...parts, "", DEV_LABEL].join("\n\n");
  }
  if (/^Create \d+ practice questions/.test(question)) {
    const n = Math.max(1, Math.min(25, Number(/^Create (\d+)/.exec(question)[1])));
    const levels = ["easy", "medium", "hard"];
    const pts = studyPoints(chunks, n);
    const items = pts.map((p, i) => {
      const level = levels[i % 3];
      if (i === 2) {
        return `${i + 1}. **[${level}]** Walk through the reasoning behind “${lead(p.s, 6)}…” in two steps.\n   **Answer:** Two steps:\n   1. ${p.s}\n   2. Compare with an ordinary source, where $g^{(2)}(0) \\neq 1$.`;
      }
      return `${i + 1}. **[${level}]** What does the document say about “${lead(p.s, 5)}…”?\n   **Answer:** ${p.s}`;
    });
    return [`Here are ${n} questions on *${docTitle}*. Try each one before you look.`, ...items, DEV_LABEL].join("\n\n");
  }
  if (/^Produce a one-page exam cheatsheet/.test(question)) {
    const pts = studyPoints(chunks, 7);
    return [
      "### Key definitions",
      ...pts.slice(0, 3).map((p) => `- **${lead(p.s, 3)}** — ${p.s}`),
      "### Core results",
      "| Result | In words |",
      "|---|---|",
      ...pts.slice(3, 5).map((p) => `| ${lead(p.s, 3)} | ${p.s} |`),
      "$$g^{(2)}(0) = \\frac{\\langle a^\\dagger a^\\dagger a a \\rangle}{\\langle a^\\dagger a \\rangle^2}$$",
      "### Pitfalls",
      `- Don’t confuse the two detectors’ jobs: ${pts[5].s}`,
      "### The argument in one line",
      pts[6].s,
      "",
      DEV_LABEL,
    ].join("\n");
  }
  if (/^Explain this passage/.test(question)) {
    const passage = flat((/"([\s\S]*)"\s*$/.exec(question) || [])[1] || "");
    const pts = studyPoints(chunks, 2);
    const how = /in 2-3 sentences/.test(question) ? "quick" : /thoroughly/.test(question) ? "comprehensive" : "intuitive";
    return [
      `### In plain words`,
      `The passage “${passage.slice(0, 90)}${passage.length > 90 ? "…" : ""}” says that ${passage.charAt(0).toLowerCase()}${passage.slice(1, 200)}`,
      how === "quick" ? "" : `### How it fits\n\n- **Before it:** ${pts[0].s}\n- **After it:** ${pts[1].s}`,
      `*Depth: ${how}.*`,
      DEV_LABEL,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return null;
}

const fake = {
  activeProvider: () => "dev",
  DEFAULT_SYSTEM: "",
  async generateAnswer({ question, contextChunks = [], rawContext = "", docTitle = "" }) {
    const study = fakeStudyAnswer(String(question), contextChunks, docTitle);
    if (study !== null) {
      await new Promise((r) => setTimeout(r, 900));
      return { answer: study, citations: cite(contextChunks), verbatim: [], model: "dev-fake", provider: "dev", usage: { prompt: 0, completion: 0, total: 0 } };
    }
    await new Promise((r) => setTimeout(r, 700));
    const source = contextChunks.length ? contextChunks.map((c) => c.text).join(" ") : rawContext;
    const first = String(source).replace(/\s+/g, " ").trim().slice(0, 160);
    const citations = cite(contextChunks);
    if (!citations.length && first) citations.push({ page: 1, excerpt: first.slice(0, 120) });
    return {
      answer: `**Dev server answer** (no AI model here) to “${String(question).slice(0, 80)}” about *${docTitle}*.\n\nThe document begins: ${first}…\n\n- Point one, grounded in the text [1]\n- Point two`,
      citations,
      verbatim: citations.map((c) => c.excerpt),
      model: "dev-fake",
      provider: "dev",
      usage: { prompt: 0, completion: 0, total: 0 },
    };
  },
  async generateStructured({ task, contextChunks = [] }) {
    await new Promise((r) => setTimeout(r, 500));
    if (/Break this task/.test(task)) {
      return { data: { steps: ["Open the file and read the title", "Write one line about what done means", "Do ten minutes on the first part", "Take a short break"] }, model: "dev-fake", provider: "dev" };
    }
    const deck = /^Create (\d+) flashcards/.exec(String(task));
    if (deck) {
      await new Promise((r) => setTimeout(r, 400));
      const n = Math.max(3, Math.min(40, Number(deck[1])));
      const cards = studyPoints(contextChunks, n).map((p, i) =>
        i === 1 ? { front: "What is $g^{(2)}(0)$ for coherent light?", back: "It is $1$: the photons arrive independently, with no bunching." } : { front: `What does the document say about “${lead(p.s, 5)}…”?`, back: p.s },
      );
      return { data: { cards }, model: "dev-fake", provider: "dev" };
    }
    return { data: { reply: "That sounds like a lot. Want to pick one small next step together?", cards: [{ front: "What is g2(0) for coherent light?", back: "1" }] }, model: "dev-fake", provider: "dev" };
  },
};
require.cache[providerPath] = { id: providerPath, filename: providerPath, loaded: true, exports: fake };

const PAPER = `Correlation plenoptic imaging with entangled photons

Abstract. A plenoptic camera records both where light lands and which direction it came from, so a picture can be refocused after it is taken. Ordinary plenoptic cameras pay for that with resolution. Measuring correlations between two detectors, instead of intensity on one, removes the trade-off.

1 Introduction

A conventional image is a map of intensity. Two objects at different depths cannot both be sharp unless the lens stops down, and stopping down throws light away. Plenoptic imaging records the direction of each ray as well, at the cost of spatial resolution.

Correlation plenoptic imaging, or CPI, separates the two jobs. One detector sees the object; the other sees the lens. Neither detector alone forms an image. The image appears only in the correlation between them.

2 Setup

A pump laser drives a nonlinear crystal, which emits photon pairs by spontaneous parametric down-conversion. One photon of each pair passes the object and reaches a spatially resolving detector. Its twin travels to a second detector placed to image the lens.

Because the photons are born together, each coincidence carries both a position and a direction. Summing coincidences over the right combinations of pixels refocuses the image to any plane within the depth of field.

3 Results

The refocused images keep the resolution of a focused conventional image over a depth of field several times larger. With entangled photons the visibility of the correlation stays high, which classical light sources cannot match.

4 Limits

Only coincidences contribute, so acquisition is slower than taking an ordinary photograph. Faster detectors and brighter pair sources shorten the measurement, and the processing parallelises well.`;

const NOTES = `PhD exam notes — second quantisation

Fock space is the direct sum of the n-particle spaces. The vacuum state has no particles, and every other state is built by creation operators acting on it.

For bosons the creation and annihilation operators obey the commutator [a, a†] = 1. The number operator N = a†a counts quanta, and a† raises its eigenvalue by one.

Coherent states are eigenstates of the annihilation operator. They are the closest quantum states to a classical field, and a laser far above threshold produces them.`;

(async () => {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), "np-dev-"));
  Object.assign(process.env, {
    LOCAL_MODE: "false",
    JWT_SECRET: "dev-secret-".padEnd(64, "x"),
    SIGNUP_MODE: "invite",
    SIGNUP_INVITE_CODE: "np-dev",
    STORAGE_ROOT: storage,
    MATHSERVE_URL: "off",
    OLLAMA_URL: "http://127.0.0.1:9", // no embedder: RAG takes the fallback path
    QDRANT_URL: "http://127.0.0.1:9",
    AI_DAILY_LIMIT_PER_USER: "1000",
  });
  if (corsArg > 0 && process.argv[corsArg + 1]) process.env.CORS_ORIGINS = process.argv[corsArg + 1];
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const buildApp = require(path.join(BACKEND, "src/app"));
  const app = buildApp();
  const server = app.listen(port, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));

  // Stop with Ctrl-C or `kill <pid>` (SIGTERM): the database's temp folder
  // (~200 MB under /tmp/mongo-mem-*) and the storage folder are removed.
  // `kill -9` skips this and leaves them behind.
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      server.close();
      await mongoose.disconnect();
      await mongod.stop({ doCleanup: true, force: true });
      fs.rmSync(storage, { recursive: true, force: true });
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // The account, through the real route.
  const body = JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Ryx", inviteCode: "np-dev" });
  const reg = await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/api/auth/register", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.on("error", reject);
    req.end(body);
  });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${reg.body}`);

  const { User, Document, DocumentChunk } = require(path.join(BACKEND, "src/models"));
  const user = await User.findOne({ email: EMAIL });
  const dir = path.join(storage, "documents", String(user._id));
  fs.mkdirSync(dir, { recursive: true });

  async function textDoc({ title, subtitle, type, file, text, readingProgress, ageHours }) {
    fs.writeFileSync(path.join(dir, file), text);
    const paras = text.split(/\n\s*\n/);
    const toc = [];
    paras.forEach((p, i) => {
      if (/^\d+ [A-Z]/.test(p) || /^Abstract/.test(p)) toc.push({ title: p.split(".")[0].slice(0, 60), order: toc.length, startParagraph: i, startPage: 1 + Math.floor(i / 4) });
    });
    const doc = await Document.create({
      userId: user._id, title, subtitle, type, status: "ready", progress: 1,
      file: { relativePath: path.join("documents", String(user._id), file), mimeType: "text/plain", sizeBytes: text.length },
      pageCount: Math.ceil(paras.length / 4), wordCount: text.split(/\s+/).length, toc,
      pageMap: paras.map((_, i) => i).filter((i) => i % 4 === 0).map((i) => ({ page: 1 + i / 4, startParagraph: i })),
      createdAt: new Date(Date.now() - (ageHours || 1) * 3600e3),
    });
    await DocumentChunk.insertMany(paras.map((p, i) => ({
      documentId: doc._id, userId: user._id, chunkIndex: i, text: p, anchor: { page: 1 + Math.floor(i / 4), paragraphIndex: i },
      vectorId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, vectorCollection: "nomic-embed-text-v1.5",
      embeddingModel: "nomic-embed-text-v1.5", embeddingDim: 768, overlapChars: 0,
    })));
    if (readingProgress) {
      const { ReadingSession } = require(path.join(BACKEND, "src/models"));
      if (ReadingSession) await ReadingSession.create({ userId: user._id, documentId: doc._id, progress: readingProgress, lastWordIndex: 120, lastOpenedAt: new Date(Date.now() - 5 * 3600e3) });
    }
    return doc;
  }

  await textDoc({ title: "Correlation plenoptic imaging with entangled photons", subtitle: "Reading group · week 3", type: "txt", file: "cpi.txt", text: PAPER, readingProgress: 0.42, ageHours: 72 });
  await textDoc({ title: "PhD exam notes — second quantisation", type: "md", file: "notes.md", text: NOTES, ageHours: 300 });

  // An EPUB (two chapters, a stylesheet).
  const zip = new AdmZip();
  zip.addFile("mimetype", Buffer.from("application/epub+zip"));
  zip.addFile("META-INF/container.xml", Buffer.from('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'));
  zip.addFile("OEBPS/content.opf", Buffer.from('<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style.css" media-type="text/css"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'));
  zip.addFile("OEBPS/nav.xhtml", Buffer.from('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">1. Light, counted one photon at a time</a></li><li><a href="ch2.xhtml">2. Pairs from a crystal</a></li></ol></nav></body></html>'));
  zip.addFile("OEBPS/ch1.xhtml", Buffer.from('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="style.css"/></head><body><h1>1. Light, counted one photon at a time</h1><p>A detector that clicks does not tell you what light is. It tells you that, at one instant and one place, some energy was absorbed.</p><p>Put two detectors behind a beam splitter and count the moments when both click together. For thermal light the coincidences come more often than chance would allow.</p></body></html>'));
  zip.addFile("OEBPS/ch2.xhtml", Buffer.from('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="style.css"/></head><body><h1>2. Pairs from a crystal</h1><p>Pump a nonlinear crystal with a strong blue laser and, very rarely, one pump photon splits into two red ones.</p></body></html>'));
  zip.addFile("OEBPS/style.css", Buffer.from("body{line-height:1.5}"));
  zip.writeZip(path.join(dir, "book.epub"));
  await Document.create({ userId: user._id, title: "Quantum Light, Gently", subtitle: "A sample book", type: "epub", status: "ready", progress: 1, file: { relativePath: path.join("documents", String(user._id), "book.epub"), mimeType: "application/epub+zip" }, createdAt: new Date(Date.now() - 200 * 3600e3) });
  await Document.create({ userId: user._id, title: "Hong–Ou–Mandel interference, revisited", type: "pdf", status: "embedding", progress: 0.62 });
  await Document.create({ userId: user._id, title: "scan_0042.djvu", type: "djvu", status: "failed", progress: 0, ingestError: "No text found in this file.", createdAt: new Date(Date.now() - 48 * 3600e3) });

  console.log(`[dev-api] http://127.0.0.1:${port}  account ${EMAIL} / ${PASSWORD}  invite np-dev  storage ${storage}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
