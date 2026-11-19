// The original name of an uploaded file, as the person sees it.
//
// multer 1.4 (busboy) reads the file name in a multipart upload as latin1,
// but browsers and the apps send it as UTF-8 bytes, so "perché.pdf" arrived
// as "perchÃ©.pdf" and became the document's title. Read the bytes again as
// UTF-8 when they are valid UTF-8; otherwise the name really was latin1 (or
// was already decoded) and stays as it is.
function uploadName(originalname) {
    const raw = typeof originalname === 'string' ? originalname : '';
    // Characters above U+00FF can't come from a latin1 reading: already decoded.
    if (!/[\u0080-ÿ]/.test(raw) || /[^\u0000-ÿ]/.test(raw)) return raw;
    const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
    return utf8.includes('�') ? raw : utf8;
}

module.exports = { uploadName };
