// A hostile or broken upload must not take the shared API down: extraction
// runs in a child process with a timeout, interrupted ingests stop being
// retried, and EPUB entries are size-checked before they are inflated.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const AdmZip = require('adm-zip');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let tmp;

before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'np-ingest-'));
    process.env.STORAGE_ROOT = tmp;
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
});

test('extraction runs in a child process and returns the text', async () => {
    const { extractTextIsolated } = require('../src/services/extractIsolated');
    const f = path.join(tmp, 'note.txt');
    fs.writeFileSync(f, 'Photons arrive in pairs.\n\nThe second paragraph is here.');
    const out = await extractTextIsolated(f, 'txt', {});
    assert.match(out.text, /Photons arrive in pairs/);
    assert.ok(out.wordCount >= 8);
});

test('a slow extraction is stopped instead of hanging forever', async () => {
    const { extractTextIsolated } = require('../src/services/extractIsolated');
    const f = path.join(tmp, 'slow.txt');
    fs.writeFileSync(f, 'x');
    process.env.EXTRACT_TIMEOUT_MS = '1';
    await assert.rejects(() => extractTextIsolated(f, 'txt', {}), /took too long/);
    delete process.env.EXTRACT_TIMEOUT_MS;
});

test('an ingest interrupted twice is marked failed, not resumed again', async () => {
    const { Document, User } = require('../src/models');
    const { resumeStuckIngests } = require('../src/services/ingestPipeline');
    const user = await User.create({ email: 'r@example.com', passwordHash: 'x' });
    const doc = await Document.create({
        userId: user._id,
        title: 'Poison',
        type: 'txt',
        status: 'parsing',
        ingestAttempts: 2,
        file: { relativePath: 'nowhere.txt' },
    });
    await resumeStuckIngests();
    let fresh;
    for (let i = 0; i < 50; i += 1) {
        fresh = await Document.findById(doc._id).lean();
        if (fresh.status === 'failed') break;
        await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(fresh.status, 'failed');
    assert.match(fresh.ingestError, /interrupted twice/);
});

test('a book with too many files inside is refused before anything is unpacked', async () => {
    const { runChildJob } = require('../src/services/childJobs');
    const zip = new AdmZip();
    for (let i = 0; i < 10050; i += 1) zip.addFile(`OEBPS/e${i}.txt`, Buffer.from(''));
    const src = path.join(tmp, 'many.epub');
    zip.writeZip(src);
    const t0 = Date.now();
    await assert.rejects(
        () => runChildJob({ kind: 'epub-unpack', src, dest: path.join(tmp, 'many-out') }, { timeoutMs: 60000 }),
        (err) => err.status === 413 && /too many parts/.test(err.message),
    );
    assert.ok(!fs.existsSync(path.join(tmp, 'many-out')), 'nothing was written');
    assert.ok(Date.now() - t0 < 30000);
});

test('unpacking skips zip-slip names and writes only inside the book folder', async () => {
    const { unpackEpub } = require('../src/services/epubUnpack');
    const zip = new AdmZip();
    zip.addFile('META-INF/container.xml', Buffer.from('<container><rootfile full-path="c.opf"/></container>'));
    zip.addFile('c.opf', Buffer.from('<package><manifest><item id="a" href="a.xhtml"/></manifest><spine><itemref idref="a"/></spine></package>'));
    zip.addFile('a.xhtml', Buffer.from('<p>a</p>'));
    const raw = zip.toBuffer();
    // forge an entry name with ../ (adm-zip normalises names on add)
    const forged = Buffer.from(raw.toString('latin1').replace(/a\.xhtml/g, '../x.xh'), 'latin1');
    const src = path.join(tmp, 'slip.epub');
    fs.writeFileSync(src, forged);
    const dest = path.join(tmp, 'slip-out');
    await unpackEpub(src, dest).catch(() => {});
    assert.ok(!fs.existsSync(path.join(tmp, 'x.xh')), 'nothing escaped the folder');
});

test('an EPUB entry that declares a huge size is refused before it is inflated', async () => {
    const { readEpubEntry } = require('../src/services/epubServe');
    const zip = new AdmZip();
    zip.addFile('OEBPS/big.bin', Buffer.alloc(65 * 1024 * 1024)); // zeros: tiny once deflated
    zip.addFile('OEBPS/ok.xhtml', Buffer.from('<p>fine</p>'));
    const buf = zip.toBuffer();
    assert.ok(buf.length < 2 * 1024 * 1024, 'the file itself is small');
    const ok = await readEpubEntry('bomb', async () => buf, 'OEBPS/ok.xhtml');
    assert.match(String(ok.data), /fine/);
    await assert.rejects(() => readEpubEntry('bomb', async () => buf, 'OEBPS/big.bin'), (err) => err.status === 413);
});
