// Mongoose connection — Mongoose 8.x against MongoDB 7+ / Atlas.
//
// Call `connectDb()` once at app boot, before mounting routes. The function
// is idempotent — safe to call multiple times (e.g. from tests).
const mongoose = require('mongoose');

let connecting = null;

async function connectDb() {
    if (mongoose.connection.readyState === 1) return mongoose.connection;
    if (connecting) return connecting;

    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI env var is required');

    mongoose.set('strictQuery', true);

    connecting = mongoose
        .connect(uri, {
            // Mongoose 8 has good defaults. Only override what we care about.
            serverSelectionTimeoutMS: 8000,
            socketTimeoutMS: 45000,
            maxPoolSize: 25,
            // App name shows up in Mongo's `currentOp` — useful for debugging.
            appName: 'neuropal-api',
        })
        .then((m) => {
            // eslint-disable-next-line no-console
            console.log('[db] connected to', m.connection.name);
            return m.connection;
        })
        .catch((err) => {
            connecting = null;
            throw err;
        });

    return connecting;
}

mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.warn('[db] disconnected');
});
mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] error', err);
});

module.exports = { connectDb, mongoose };
