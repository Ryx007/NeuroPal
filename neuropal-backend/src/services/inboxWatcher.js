const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const chokidar = require('chokidar');

const { Document } = require('../models');
const { resolveLocalUser } = require('../middleware/auth');
const { ingestDocument } = require('./ingestPipeline');

// Watched drop-folder ingestion (LOCAL_MODE only).
//
// Drop a PDF/EPUB/TXT/DOCX into the inbox folder (Finder drag-and-drop,
// AirDrop then move, scp, anything) and it becomes a library document: the
// file is MOVED into the canonical storage layout, a Document row is
// created for the local user, and the normal ingest pipeline runs. The
// library's status polling picks it up like any uploaded file.
//
// INBOX_DIR env sets the folder (a Finder-friendly path like
// ~/NeuroPal-Inbox is a good choice); default is <STORAGE_ROOT>/inbox.
// Files already sitting in the folder at boot are ingested too, so books
// dropped while the server was down aren't missed.

const STORAGE_ROOT = process.env.STORAGE_ROOT || './storage';

const EXT_TO_TYPE = {
    '.pdf': 'pdf',
    '.epub': 'epub',
    '.docx': 'docx',
    '.txt': 'txt',
};

const TYPE_TO_MIME = {
    pdf: 'application/pdf',
    epub: 'application/epub+zip',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
};

function inboxDir() {
    const dir = process.env.INBOX_DIR || path.join(STORAGE_ROOT, 'inbox');
    // Expand a leading ~ so INBOX_DIR=~/NeuroPal-Inbox works as expected.
    const expanded = dir.startsWith('~')
        ? path.join(process.env.HOME || '', dir.slice(1))
        : dir;
    return path.resolve(expanded);
}

function startInboxWatcher() {
    const dir = inboxDir();
    fs.mkdirSync(dir, { recursive: true });

    const watcher = chokidar.watch(dir, {
        ignoreInitial: false, // pick up files that arrived while we were down
        depth: 0,
        // A book copied over WiFi/USB lands in many writes — wait until the
        // size has been stable for 2s before treating the file as complete.
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 300 },
        // Basename check only — a path-wide dot regex would silently ignore
        // EVERYTHING if INBOX_DIR ever sits under a hidden directory.
        ignored: (p) => path.basename(p).startsWith('.'),
    });

    watcher.on('add', (filePath) => {
        handleNewFile(filePath).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[inbox] failed:', path.basename(filePath), err.message || err);
        });
    });
    watcher.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.error('[inbox] watcher error:', err.message || err);
    });

    // eslint-disable-next-line no-console
    console.log('[inbox] watching', dir);
    return watcher;
}

// Parity with the upload route's multer cap — an unbounded PDF would be
// read whole into memory by the extractor and could OOM the server.
// 300MB accommodates full-color textbook scans (Young & Freedman is 228MB).
const MAX_FILE_BYTES = 300 * 1024 * 1024;

async function handleNewFile(filePath) {
    const base = path.basename(filePath);
    const type = EXT_TO_TYPE[path.extname(filePath).toLowerCase()];
    if (!type) {
        // eslint-disable-next-line no-console
        console.warn(`[inbox] ignoring unsupported file: ${base}`);
        return;
    }

    const srcStat = await fsp.stat(filePath);
    if (srcStat.size > MAX_FILE_BYTES) {
        // eslint-disable-next-line no-console
        console.warn(
            `[inbox] "${base}" is ${(srcStat.size / 1e6).toFixed(0)}MB — over the 100MB cap, leaving it in the inbox`,
        );
        return;
    }

    const user = await resolveLocalUser();
    if (!user) throw new Error('LOCAL_MODE user could not be resolved');

    // Same storage layout + collision-proof naming as the upload route.
    const destDir = path.resolve(STORAGE_ROOT, 'documents', String(user._id));
    await fsp.mkdir(destDir, { recursive: true });
    const safe = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const destName = `${unique}-${safe}`;
    const destAbs = path.join(destDir, destName);

    // Move out of the inbox (the folder should visibly "empty" as books are
    // taken in). rename() fails across volumes — fall back to copy+unlink.
    try {
        await fsp.rename(filePath, destAbs);
    } catch (err) {
        if (err.code === 'EXDEV') {
            await fsp.copyFile(filePath, destAbs);
            await fsp.unlink(filePath);
        } else {
            throw err;
        }
    }

    let doc;
    try {
        const stat = await fsp.stat(destAbs);
        doc = await Document.create({
            userId: user._id,
            title: base.replace(/\.[^.]+$/, ''),
            type,
            file: {
                relativePath: path.posix.join('documents', String(user._id), destName),
                sizeBytes: stat.size,
                mimeType: TYPE_TO_MIME[type],
            },
            status: 'pending',
        });
    } catch (err) {
        // DB hiccup after the file already left the inbox would orphan the
        // book invisibly — put it back so the boot-time rescan retries it.
        await fsp.rename(destAbs, filePath).catch(() => {});
        throw err;
    }

    // eslint-disable-next-line no-console
    console.log(`[inbox] ingesting "${base}" → ${doc._id}`);
    ingestDocument(doc._id).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[inbox] ingest kickoff failed:', err);
    });
}

module.exports = { startInboxWatcher, inboxDir };
