// Upload file names arrive as latin1 readings of UTF-8 bytes (multer 1.4);
// src/utils/uploadName.js reads them back. Run: npm test
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { uploadName } = require('../src/utils/uploadName');

// What multer hands over for a name the client sent as UTF-8 bytes.
const asMulterSees = (name) => Buffer.from(name, 'utf8').toString('latin1');

test('a UTF-8 file name read as latin1 comes back as the person wrote it', () => {
    for (const name of ['perché.pdf', 'Università degli Studi.epub', 'Schrödinger – notes.docx', 'λόγος.txt', '量子光学.pdf', 'week 3 📚.md']) {
        assert.equal(uploadName(asMulterSees(name)), name);
    }
});

test('plain names, real latin1 names and already-decoded names stay as they are', () => {
    assert.equal(uploadName('lecture-notes_v2.pdf'), 'lecture-notes_v2.pdf');
    // "café" sent as latin1 (one byte E9): not valid UTF-8, so it is kept.
    assert.equal(uploadName('café.txt'), 'café.txt');
    // A name that was already decoded (characters above U+00FF).
    assert.equal(uploadName('perché – Ω.pdf'), 'perché – Ω.pdf');
    assert.equal(uploadName(undefined), '');
    assert.equal(uploadName(''), '');
});
