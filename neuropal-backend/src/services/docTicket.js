const jwt = require('jsonwebtoken');

// Document tickets — short-lived, single-document read passes.
//
// Why: in a signed-in (LOCAL_MODE=false) deployment every route wants an
// `Authorization` header, but some requests can't carry one:
//   - the EPUB reader's WebView resolves the publisher's relative hrefs (css,
//     images, fonts, next chapter) against an injected <base href>, and
//     subresource requests never carry custom headers;
//   - <Image source={{ uri }}> for rendered PDF pages on web.
// So the client asks for a ticket once (an authed call) and puts it in the
// URL: in the PATH for EPUB (so relative URLs inherit it) and as `?t=` for
// page images. A ticket is scoped to one document and one user, and expires.

const TICKET_TTL_SEC = 12 * 60 * 60; // a long reading session
const SCOPE = 'doc';

function secret() {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 32) {
        throw new Error('JWT_SECRET must be set and at least 32 chars');
    }
    return s;
}

function issueDocTicket(user, documentId) {
    const ticket = jwt.sign(
        { sub: String(user._id), v: user.tokenVersion || 0, doc: String(documentId), scope: SCOPE },
        secret(),
        { expiresIn: TICKET_TTL_SEC },
    );
    return { ticket, expiresAt: new Date(Date.now() + TICKET_TTL_SEC * 1000).toISOString() };
}

// → the ticket's claims ({sub, v, doc}), or null if it is invalid, expired,
// for another document, or not a ticket at all (a session JWT has no `doc`).
function verifyDocTicket(ticket, documentId) {
    if (!ticket || typeof ticket !== 'string' || ticket.length > 2048) return null;
    try {
        const payload = jwt.verify(ticket, secret());
        if (payload.scope !== SCOPE) return null;
        if (String(payload.doc) !== String(documentId)) return null;
        return payload.sub ? payload : null;
    } catch (e) {
        return null;
    }
}

module.exports = { issueDocTicket, verifyDocTicket, TICKET_TTL_SEC };
