// Per-user daily budget for AI calls on a shared server, so one account can't
// use up the provider quota (or the bill) for everyone. In-memory, one API
// process; counts reset at midnight UTC. LOCAL_MODE (one user) has no budget.
//
//   if (!spendAiBudget(req, res)) return;   // sends 429 itself when spent
//
// AI_DAILY_LIMIT_PER_USER: answers per user per day (default 150; 0 = off).
// AI_DAILY_LIMIT_TOTAL:    answers for the whole server per day (default 0 =
//                          off) — set it to the provider's daily quota so the
//                          last answers of the day go to whoever asks, not to
//                          one heavy account.

const counts = new Map(); // `${day}|${userId}` -> count

function dayStamp() {
    return new Date().toISOString().slice(0, 10);
}

function limit() {
    const n = Number(process.env.AI_DAILY_LIMIT_PER_USER ?? 150);
    return Number.isFinite(n) ? n : 150;
}

function spendAiBudget(req, res, cost = 1) {
    if (process.env.LOCAL_MODE === 'true') return true;
    const max = limit();
    const totalMax = Number(process.env.AI_DAILY_LIMIT_TOTAL || 0);
    const day = dayStamp();
    if (counts.size > 5000) {
        for (const key of counts.keys()) if (!key.startsWith(day)) counts.delete(key);
    }
    const key = `${day}|${String(req.userId)}`;
    const totalKey = `${day}|*`;
    const next = (counts.get(key) || 0) + cost;
    const nextTotal = (counts.get(totalKey) || 0) + cost;
    if (max > 0 && next > max) {
        res.status(429).json({
            error: `That's today's ${max} AI answers for this account — they reset at midnight (UTC).`,
        });
        return false;
    }
    if (totalMax > 0 && nextTotal > totalMax) {
        res.status(429).json({
            error: 'The AI answers for today are used up on this server — they reset at midnight (UTC).',
        });
        return false;
    }
    counts.set(key, next);
    counts.set(totalKey, nextTotal);
    return true;
}

function _resetAiBudgets() {
    counts.clear();
}

module.exports = { spendAiBudget, _resetAiBudgets };
