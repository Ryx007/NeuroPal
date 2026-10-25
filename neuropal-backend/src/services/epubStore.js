const fs = require('fs');
const path = require('path');

const { Document } = require('../models');
const { runChildJob } = require('./childJobs');

// API side of EPUB reading. The archive is unpacked ONCE, in a child process
// (epubUnpack.js), into STORAGE_ROOT/epub/<docId>/, and its manifest is kept
// on the Document. From then on chapters, css, images and fonts are plain
// files served with sendFile — the shared API process never opens the zip.
// The first open of a book triggers the unpack (deduplicated per document);
// reading never waits for ingest.

const LAYOUT_VERSION = 1;
const inflight = new Map(); // docId -> Promise<{dir, manifest}>

function storageRoot() {
    return process.env.STORAGE_ROOT || './storage';
}

function unpackDir(docId) {
    return path.resolve(storageRoot(), 'epub', String(docId));
}

// doc: a Document with _id, file.relativePath and (optionally) epub.
async function ensureEpub(doc) {
    const dir = unpackDir(doc._id);
    if (doc.epub && doc.epub.v === LAYOUT_VERSION && doc.epub.manifest && fs.existsSync(path.join(dir, '.complete'))) {
        return { dir, manifest: doc.epub.manifest };
    }
    const id = String(doc._id);
    if (!inflight.has(id)) {
        const src = path.resolve(storageRoot(), doc.file.relativePath);
        const job = (async () => {
            await fs.promises.access(src); // ENOENT → the route's "file not on disk"
            fs.mkdirSync(path.dirname(dir), { recursive: true });
            const r = await runChildJob({ kind: 'epub-unpack', src, dest: dir }, { timeoutMs: 3 * 60 * 1000 });
            await Document.updateOne(
                { _id: doc._id },
                {
                    $set: {
                        epub: {
                            v: LAYOUT_VERSION,
                            manifest: r.manifest,
                            files: r.files,
                            bytes: r.bytes,
                            unpackedAt: new Date(),
                        },
                    },
                },
            );
            return { dir, manifest: r.manifest };
        })().finally(() => inflight.delete(id));
        inflight.set(id, job);
    }
    return inflight.get(id);
}

function decodeSafe(p) {
    try {
        return decodeURIComponent(p);
    } catch (e) {
        return p;
    }
}

// → absolute path of an existing regular file inside dir, or null.
async function resolveEntry(dir, requestPath) {
    const tries = [String(requestPath || ''), decodeSafe(String(requestPath || ''))];
    for (const raw of tries) {
        const clean = raw.replace(/^\/+/, '');
        if (!clean || clean.split('/').some((p) => p === '..' || p.startsWith('.'))) continue;
        const abs = path.resolve(dir, clean);
        if (path.relative(dir, abs).startsWith('..')) continue;
        try {
            const st = await fs.promises.lstat(abs);
            if (st.isFile()) return abs;
        } catch (e) {
            // not this spelling
        }
    }
    return null;
}

async function removeUnpacked(docId) {
    await fs.promises.rm(unpackDir(docId), { recursive: true, force: true }).catch(() => {});
}

module.exports = { ensureEpub, resolveEntry, removeUnpacked, unpackDir };
