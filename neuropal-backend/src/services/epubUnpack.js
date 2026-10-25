const fs = require('fs');
const path = require('path');

const { assertZipBudget } = require('./zipBudget');
const { buildEpubManifest } = require('./epubServe');

// Runs in a CHILD process (childWorker.js): opens a user's EPUB once, checks
// it against the zip budget (entry count, sizes), writes its files to disk
// and builds the reading manifest. The API then serves the files with
// sendFile and never opens the archive itself — a book with 100 000 entries
// or a zip bomb can only cost this child.
//
// Layout:  <dest>/<the book's own paths…>   plus  <dest>/.complete
// Written to <dest>.tmp-<pid> first and renamed, so a half-written folder is
// never served.

function safeRelative(entryName) {
    const name = String(entryName).replace(/\\/g, '/');
    if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return null;
    const parts = name.split('/').filter((p) => p !== '' && p !== '.');
    if (parts.length === 0 || parts.some((p) => p === '..' || p.includes('\0'))) return null;
    return parts.join('/');
}

async function unpackEpub(src, dest) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(src);
    const entries = assertZipBudget(zip, 'This book');

    const tmp = `${dest}.tmp-${process.pid}`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });

    let files = 0;
    let bytes = 0;
    for (const e of entries) {
        if (e.isDirectory) continue;
        const rel = safeRelative(e.entryName);
        if (!rel) continue; // zip-slip style names are skipped, never written
        const out = path.join(tmp, rel);
        if (path.relative(tmp, out).startsWith('..')) continue;
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const data = e.getData();
        fs.writeFileSync(out, data, { flag: 'wx' });
        files += 1;
        bytes += data.length;
    }

    const manifest = await buildEpubManifest(`unpack:${dest}`, async () => fs.readFileSync(src));
    fs.writeFileSync(path.join(tmp, '.complete'), JSON.stringify({ files, bytes, at: new Date().toISOString() }));

    const old = `${dest}.old-${process.pid}`;
    if (fs.existsSync(dest)) fs.renameSync(dest, old);
    fs.renameSync(tmp, dest);
    fs.rmSync(old, { recursive: true, force: true });

    return { manifest, files, bytes };
}

module.exports = { unpackEpub, safeRelative };
