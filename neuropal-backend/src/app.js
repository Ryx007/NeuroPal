const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const documentsRoutes = require('./routes/documents');
const queryRoutes = require('./routes/query');

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
