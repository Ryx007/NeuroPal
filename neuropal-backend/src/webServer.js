require('dotenv').config();

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const express = require('express');

// Front-end server — the web build gets its OWN port (8081) and its own
// process, separate from the API (4000).
//
// WHY IT PROXIES INSTEAD OF LETTING THE BROWSER CALL :4000 DIRECTLY.
// The client resolves the backend with a bare RELATIVE path on production
// web (store/ApiLink.js), which is what makes "deploy at any domain" work
// with zero baked URLs. Relative only works if everything the page asks
// for lives on the page's own origin — so this server owns :8081 and
// forwards the API-owned prefixes to the backend. Point it at a different
// API host (API_PROXY_TARGET) and nothing in the bundle has to change.
//
// Three things in the app REQUIRE this proxy rather than plain CORS,
// because they resolve relative URLs against the PAGE's origin and never
// see an axios baseURL:
//   · KaTeX  — components/mathViewHtml.js injects
//     `<link href="${apiHost}/katex/katex.min.css">` into a srcdoc iframe;
//     apiHost is '' on production web, so it resolves to :8081/katex/...
//   · EPUB   — reader/EpubReader.jsx injects `<base href="/api/documents/
//     :id/epub/<dir>/">`; the publisher's relative css/img/font hrefs
//     resolve against THAT, i.e. against :8081.
//   · /healthz — components/ConnectionStatus.jsx fetches it directly
//     (not through axios), and ApiLink probes it to pick a candidate.
//
// NOTE: no body parser is installed here on purpose. The request stream is
// piped straight through, so multipart uploads (a 600-page PDF) stream
// without ever being buffered into this process's memory.

const WEB_PORT = parseInt(process.env.WEB_PORT || '8081', 10);
const API_TARGET =
    process.env.API_PROXY_TARGET || `http://127.0.0.1:${process.env.PORT || '4000'}`;

// Paths the API owns. Everything else is the front-end's.
const PROXY_PREFIXES = ['/api', '/healthz', '/katex', '/apk'];

// Hop-by-hop headers belong to a single transport leg and MUST NOT be
// forwarded to the next one (RFC 7230 §6.1) — Node manages these itself.
//
// This is load-bearing, not hygiene: forwarding a client's `Trailer` header
// onto a BODYLESS outbound request makes Node throw ERR_HTTP_TRAILER_INVALID
// from an internal write, which no handler here can catch — it kills the
// whole web-server process. One unauthenticated line does it:
//   printf 'GET /api/documents HTTP/1.1\r\nHost: h\r\nTrailer: X\r\n\r\n' \
//     | nc <host> 8081
// (Verified on Node 20.20 against a replica of the pre-strip code. It does
// NOT reproduce when the request carries a body — content-length or chunked
// — which is why a curl-based test can miss it entirely.)
const HOP_BY_HOP = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'trailers',
    'transfer-encoding',
    'upgrade',
]);

function stripHopByHop(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase())) out[k] = v;
    }
    return out;
}

const target = new URL(API_TARGET);
const transport = target.protocol === 'https:' ? https : http;

function proxy(req, res) {
    // originalUrl keeps the mount prefix AND the query string; req.url has
    // the prefix stripped by app.use().
    const options = {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        method: req.method,
        path: req.originalUrl,
        headers: {
            ...stripHopByHop(req.headers),
            host: target.host,
            // Set AFTER the spread so a client cannot spoof these.
            'x-forwarded-host': req.headers.host || '',
            'x-forwarded-proto': req.protocol,
            'x-forwarded-for': req.socket.remoteAddress || '',
        },
    };

    const upstream = transport.request(options, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, stripHopByHop(upstreamRes.headers));
        // pipe() tears down the WRITABLE side on error but leaves the
        // readable's own 'error' unhandled — if the API dies mid-body the
        // client would otherwise wait forever on a response that can never
        // finish. Kill the socket so the browser surfaces a failed request.
        upstreamRes.on('error', (err) => {
            // eslint-disable-next-line no-console
            console.error(`[web] upstream stream ${req.method} ${req.originalUrl} → ${err.code || err.message}`);
            res.destroy(err);
        });
        upstreamRes.pipe(res);
    });

    // The API being down must read as a clear 502 from the proxy, not a
    // hung socket — the client's own offline banner keys off failed
    // /healthz probes and needs them to actually fail.
    upstream.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.error(`[web] proxy ${req.method} ${req.originalUrl} → ${err.code || err.message}`);
        if (res.headersSent) {
            res.destroy();
            return;
        }
        res.status(502).json({
            error: `API unreachable at ${API_TARGET} (${err.code || err.message})`,
        });
    });

    // Client hung up — don't leak the upstream socket or leave the API
    // working on a response nobody will read. 'aborted' only covers a
    // truncated REQUEST body; the common case is the client vanishing
    // during the RESPONSE (navigating away mid-EPUB-page, cancelling the
    // 96MB APK download), which surfaces as 'close' on res. Without this
    // an always-on proxy leaks one socket + one live API handler per
    // abandoned download. Guarded on writableEnded so a normal completion
    // — which also emits 'close' — doesn't destroy an already-finished
    // request.
    res.on('close', () => {
        if (!res.writableEnded) upstream.destroy();
    });

    req.pipe(upstream);
}

function buildWebApp() {
    const app = express();
    app.disable('x-powered-by');

    for (const prefix of PROXY_PREFIXES) {
        app.use(prefix, proxy);
    }

    const webDist = process.env.WEB_DIST;
    if (!webDist) {
        // eslint-disable-next-line no-console
        console.error('[web] WEB_DIST is not set — nothing to serve. Run `npx expo export -p web` and point WEB_DIST at neuropal-expo-app/dist.');
    } else if (!fs.existsSync(path.resolve(webDist))) {
        // eslint-disable-next-line no-console
        console.error(`[web] WEB_DIST does not exist: ${path.resolve(webDist)}`);
    } else {
        const dist = path.resolve(webDist);
        app.use(express.static(dist));
        // Client-side routing: unknown non-proxied GETs return the shell.
        app.get(/.*/, (req, res) => {
            res.sendFile(path.join(dist, 'index.html'));
        });
        // eslint-disable-next-line no-console
        console.log('[web] serving', dist);
    }

    return app;
}

const app = buildWebApp();
const server = app.listen(WEB_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[web] listening on :${WEB_PORT} — proxying ${PROXY_PREFIXES.join(', ')} → ${API_TARGET}`);
});

// 8081 is ALSO Expo/Metro's default dev port, so a stray `expo start --web`
// is the likeliest way this ever fails to bind. Say so plainly instead of
// dying on an unhandled 'error' and letting pm2 restart-loop in silence.
server.on('error', (err) => {
    // eslint-disable-next-line no-console
    if (err.code === 'EADDRINUSE') {
        console.error(`[web] port ${WEB_PORT} is already in use — something else (a stray \`expo start --web\`, whose default port is also 8081?) owns it. Free it or set WEB_PORT.`);
    } else {
        console.error('[web] server error:', err);
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[web][unhandledRejection]', reason);
});
