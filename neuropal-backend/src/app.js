const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const annotationsRoutes = require('./routes/annotations');
const searchRoutes = require('./routes/search');
const vizRoutes = require('./routes/viz');
const authRoutes = require('./routes/auth');
const documentsRoutes = require('./routes/documents');
const queryRoutes = require('./routes/query');
const studyRoutes = require('./routes/study');

// Builds the Express app. server.js calls this after the Mongoose
// connection is up.
function buildApp() {
    const app = express();
    app.disable('x-powered-by');

    // CORS — widened so the standalone APK on the phone can reach the
    // server (the phone's origin is not one of the Metro dev ports).
    // Combined with JWT auth this is acceptable: any origin can hit the
    // API but nothing inside requires a session cookie.
    app.use(cors({ origin: true, credentials: true }));

    app.use(express.json({ limit: '5mb' }));

    // Health probe — for nginx / uptime checks.
    app.get('/healthz', (req, res) => {
        res.json({ status: 'ok', uptime: process.uptime() });
    });

    // Routers. Each file uses Express Router with GET/POST only.
    app.use('/api/auth', authRoutes);
    app.use('/api/documents', documentsRoutes);
    app.use('/api', queryRoutes); // owns POST /api/documents/:id/query
    app.use('/api', studyRoutes); // owns /api/documents/:id/{summarize,quiz,cheatsheet,explain}
    app.use('/api', annotationsRoutes); // highlights + bookmarks
    app.use('/api/search', searchRoutes); // arXiv + Semantic Scholar paper search/import
    app.use('/api/viz', vizRoutes); // AI-generated visualization specs

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

    // ---- Web app (static production build) ------------------------------
    // WEB_DIST env → `npx expo export -p web` output. Served at / so ANY
    // browser on the LAN (MacBooks, iPhones, other phones) gets the full
    // app from http://<mini-ip>:4000/ — same always-on process as the API.
    // Unknown non-API GETs fall back to index.html (client-side routing).
    const webDist = process.env.WEB_DIST;
    if (webDist && fs.existsSync(path.resolve(webDist))) {
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

        // eslint-disable-next-line no-console
        console.error('[err]', req.method, req.path, err);
        res.status(500).json({ error: 'Server error' });
    });

    return app;
}

module.exports = buildApp;
