const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const annotationsRoutes = require('./routes/annotations');
const notesRoutes = require('./routes/notes');
const searchRoutes = require('./routes/search');
const simulationsRoutes = require('./routes/simulations');
const vizRoutes = require('./routes/viz');
const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const documentsRoutes = require('./routes/documents');
const queryRoutes = require('./routes/query');
const studyRoutes = require('./routes/study');
const palRoutes = require('./routes/pal');

// Builds the Express app. server.js calls this after the Mongoose
// connection is up.
function buildApp() {
    const app = express();
    app.disable('x-powered-by');

    // Behind the Cloudflare Tunnel the API only ever sees cloudflared; one
    // proxy hop is trusted so req.ip / req.protocol reflect the edge's view.
    if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

    // CORS. Native apps don't send an Origin, so this only matters for web
    // pages. CORS_ORIGINS (comma-separated, e.g. https://ryx007.work) pins the
    // browser origins allowed to call the API; unset = reflect any origin
    // (local development). Auth is a Bearer header, never a cookie, so a
    // foreign page can't ride a session either way.
    const corsOrigins = String(process.env.CORS_ORIGINS || '')
        .split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean);
    app.use(
        cors({
            origin: corsOrigins.length ? corsOrigins : true,
            credentials: false,
        }),
    );

    // A few cheap headers for a public API (no helmet dependency needed).
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        next();
    });

    app.use(express.json({ limit: '5mb' }));

    // Health probe — for nginx / uptime checks. Fast by default; pass
    // ?deps=1 for per-dependency up/down + latency (Issue 1: see what's
    // dead BEFORE uploading a 644-page book — the Settings screen shows
    // this). Never throws; a dead dependency is a report, not a 500.
    app.get('/healthz', async (req, res) => {
        const base = { status: 'ok', uptime: process.uptime() };
        if (!req.query.deps) return res.json(base);

        const axios = require('axios');
        const mongoose = require('mongoose');
        const probe = async (fn) => {
            const t0 = Date.now();
            try {
                await fn();
                return { up: true, ms: Date.now() - t0 };
            } catch (e) {
                return { up: false, ms: Date.now() - t0, error: String(e.code || e.message).slice(0, 120) };
            }
        };
        const ollamaUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
        const qdrantUrl = (process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/+$/, '');
        // MATHSERVE_URL set to '' or 'off' = the math tier isn't deployed
        // here (the cloud server has no Apple GPU); report that, not "down".
        const mathserveRaw = process.env.MATHSERVE_URL;
        const mathserveOff = mathserveRaw !== undefined && /^(|off|none|disabled)$/i.test(mathserveRaw.trim());
        const mathserveUrl = (mathserveRaw || 'http://localhost:8077').replace(/\/+$/, '');
        const [mongo, qdrant, ollama, extractor] = await Promise.all([
            probe(async () => {
                if (mongoose.connection.readyState !== 1) throw new Error('disconnected');
                await mongoose.connection.db.admin().ping();
            }),
            probe(() =>
                axios.get(`${qdrantUrl}/collections`, {
                    timeout: 3000,
                    headers: process.env.QDRANT_API_KEY ? { 'api-key': process.env.QDRANT_API_KEY } : {},
                }),
            ),
            probe(() => axios.get(`${ollamaUrl}/api/tags`, { timeout: 3000 })),
            mathserveOff
                ? Promise.resolve({ up: false, disabled: true, ms: 0 })
                : probe(() => axios.get(`${mathserveUrl}/healthz`, { timeout: 3000 })),
        ]);
        const deps = { mongo, qdrant, ollama, extractor };
        // A public server says up/down only — error codes describe its
        // private network.
        if (process.env.PUBLIC_DEPLOYMENT === 'true') {
            for (const d of Object.values(deps)) delete d.error;
        }
        res.json({ ...base, deps });
    });

    // Routers. Each file uses Express Router with GET/POST only.
    app.use('/api/auth', authRoutes);
    app.use('/api/me', meRoutes); // v2 appearance sync (skin, Pal, Home layout)
    app.use('/api/documents', documentsRoutes);
    app.use('/api', queryRoutes); // owns POST /api/documents/:id/query
    app.use('/api', studyRoutes); // owns /api/documents/:id/{summarize,quiz,cheatsheet,explain}
    app.use('/api', annotationsRoutes); // highlights + bookmarks
    app.use('/api/search', searchRoutes); // arXiv + Semantic Scholar paper search/import
    app.use('/api/viz', vizRoutes); // AI-generated visualization specs
    app.use('/api/simulations', simulationsRoutes); // saved visualizer sims (P5)
    app.use('/api/notes', notesRoutes); // typed + ink notes, synced (P6)
    app.use('/api/pal', palRoutes); // Pal as a buddy: breakdown + short chat

    // KaTeX assets for the reader's equation WebViews (D9) — served from the
    // backend so equation rendering works fully offline on the LAN.
    app.use(
        '/katex',
        express.static(path.join(__dirname, '..', 'node_modules', 'katex', 'dist'), {
            maxAge: '30d',
            immutable: true,
        }),
    );

    // ---- Android APK download ------------------------------------------
    // APK_PATH env → the sideload-able release build. The explicit MIME
    // type matters: an APK is structurally a ZIP, and generic static
    // servers label it application/zip — Android's browser then saves it
    // as "<name>.apk.zip" and refuses to hand it to the installer.
    const apkPath = process.env.APK_PATH;
    if (apkPath) {
        app.get('/apk', (req, res) => {
            const abs = path.resolve(apkPath);
            if (!fs.existsSync(abs)) {
                return res.status(404).json({ error: 'APK not built yet' });
            }
            res.setHeader('Content-Type', 'application/vnd.android.package-archive');
            res.setHeader('Content-Disposition', 'attachment; filename="neuropal.apk"');
            res.sendFile(abs);
        });
    }

    // ---- Web app (static production build) — OPT-IN, OFF BY DEFAULT -----
    // The front-end now has its own process and port: src/webServer.js on
    // :8081 serves WEB_DIST and proxies /api, /healthz, /katex and /apk
    // back here. This API is therefore API-ONLY, and `GET /` returns the
    // 404 envelope below rather than the app shell.
    //
    // SERVE_WEB_FROM_API=true restores the old single-port behaviour (the
    // API serving the bundle at / as well) — kept for the case where you
    // want one process again, e.g. a minimal deploy or while debugging the
    // web server itself. Both may run at once; they read the same WEB_DIST.
    const webDist = process.env.WEB_DIST;
    if (process.env.SERVE_WEB_FROM_API === 'true' && webDist && fs.existsSync(path.resolve(webDist))) {
        const dist = path.resolve(webDist);
        app.use(express.static(dist));
        app.get(/^\/(?!api\/|healthz|apk).*/, (req, res) => {
            res.sendFile(path.join(dist, 'index.html'));
        });
    }

    // 404 — anything that fell through the routers above.
    app.use((req, res) => {
        res.status(404).json({ error: 'Not found' });
    });

    // Final error funnel. Translates known errors to clean JSON, logs
    // unknown errors, returns a generic 500 to the client.
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large' });
        }
        if (err && err.name === 'ValidationError') {
            const messages = Object.values(err.errors || {})
                .map((e) => e.message)
                .filter(Boolean);
            return res
                .status(422)
                .json({ error: messages.join('; ') || 'Validation failed' });
        }
        if (err && err.code === 11000) {
            return res.status(409).json({ error: 'Already exists' });
        }
        if (err && err.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid identifier' });
        }
        if (err && err.status && err.expose) {
            return res.status(err.status).json({ error: err.message });
        }

        // Document tickets travel in URLs (/epub/t/<ticket>/…, ?t=) — keep
        // them out of the logs.
        const where = String(req.path).replace(/\/t\/[^/]+/g, '/t/<ticket>');
        // eslint-disable-next-line no-console
        console.error('[err]', req.method, where, err);
        res.status(500).json({ error: 'Server error' });
    });

    return app;
}

module.exports = buildApp;
