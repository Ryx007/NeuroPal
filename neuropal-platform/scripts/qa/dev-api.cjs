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
const providerPath = require.resolve(path.join(BACKEND, "src/services/aiProvider.js"));
const fake = {
  activeProvider: () => "dev",
  DEFAULT_SYSTEM: "",
  async generateAnswer({ question, contextChunks = [], rawContext = "", docTitle = "" }) {
    await new Promise((r) => setTimeout(r, 700));
    const source = contextChunks.length ? contextChunks.map((c) => c.text).join(" ") : rawContext;
    const first = String(source).replace(/\s+/g, " ").trim().slice(0, 160);
    const citations = contextChunks.slice(0, 2).map((c) => ({ chunkId: c._id || c.chunkId, page: c.anchor?.page || 1, excerpt: String(c.text).slice(0, 120) }));
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
  async generateStructured({ task }) {
    await new Promise((r) => setTimeout(r, 500));
    if (/Break this task/.test(task)) {
      return { data: { steps: ["Open the file and read the title", "Write one line about what done means", "Do ten minutes on the first part", "Take a short break"] }, model: "dev-fake", provider: "dev" };
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
