// Runs once, when the MongoDB volume is first created
// (/docker-entrypoint-initdb.d). The API connects as this least-privilege
// user (readWrite on `neuropal` only), never as root.
const user = process.env.MONGO_APP_USER || 'neuropal_app';
const pwd = process.env.MONGO_APP_PASSWORD;
if (!pwd) throw new Error('MONGO_APP_PASSWORD is not set');
db.getSiblingDB('neuropal').createUser({
    user,
    pwd,
    roles: [{ role: 'readWrite', db: 'neuropal' }],
});
print(`[init] created ${user} (readWrite on neuropal)`);
