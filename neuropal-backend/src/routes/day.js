const { Router } = require('express');

const { DayState, DayCheckin } = require('../models');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const day = require('../services/dayMerge');

// Day sync — docs/DAY-SYNC.md is the contract (v1).
//
//   POST   /api/me/day/sync   merge what the device has, answer the merged day
//   GET    /api/me/day        the merged day, sending nothing
//   DELETE /api/me/day        erase the day everywhere (bumps `gen`)
//
// The server is the only merger. The rules themselves are pure functions in
// services/dayMerge.js; this file only reads, writes and keeps two
// concurrent syncs of one person from losing each other's items:
//   - anchors / tasks / to-dos / dump live in one DayState document per user,
//     written with a compare-and-set on `rev` (read, merge, write only if rev
//     is unchanged, else read again and re-merge);
//   - check-ins are one DayCheckin row each, written as idempotent upserts
//     keyed on {userId, at}, so writes from two syncs simply add up.
// Nothing from a request or response body is ever logged: errors from the
// database are replaced by a content-free one before app.js can log them.

const router = Router();

// Rounds one sync may take when other syncs for the same person keep landing
// first. Every round re-reads, so nothing is lost; past the bound the client
// gets a 503 and retries later (§8 "Failures").
const MAX_ATTEMPTS = 40;

// Check-in writes in flight at once for one sync.
const SETTLE_BATCH = 16;

// Outcomes of writing one check-in.
const WROTE = 'wrote';
const KEPT = 'kept';
const STALE = 'stale';

// The unique indexes are what make concurrent first syncs and check-in
// upserts safe, so make sure they exist before the first write.
let indexesReady = null;
function ready() {
    if (!indexesReady) {
        indexesReady = Promise.all([DayState.init(), DayCheckin.init()]).catch((err) => {
            indexesReady = null;
            throw err;
        });
    }
    return indexesReady;
}

// A short random pause between rounds so racing syncs stop colliding.
function pause(attempt) {
    const ms = Math.floor(Math.random() * Math.min(40, 2 + attempt * 4));
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Database errors can carry the operation that failed (a bulk-write error
// lists its documents; a validation error quotes the value), and app.js logs
// unknown errors in full. Pass on only the kind of error and the code path.
function storageError(err) {
    const kind = [err && err.name, err && err.code].filter(Boolean).join(' ');
    const safe = new Error(`Day sync failed (${kind || 'unknown error'})`);
    safe.name = 'DaySyncError';
    const frames = String((err && err.stack) || '')
        .split('\n')
        .filter((line) => /^\s+at /.test(line));
    if (frames.length) safe.stack = `${safe.name}: ${safe.message}\n${frames.join('\n')}`;
    return safe;
}

async function loadState(userId, nowMs) {
    const doc = await DayState.findOne({ userId }).lean();
    if (!doc) return { doc: null, gen: 1, rev: 0, sections: day.emptySections() };
    return {
        doc,
        gen: Number.isSafeInteger(doc.gen) && doc.gen > 0 ? doc.gen : 1,
        rev: Number.isSafeInteger(doc.rev) && doc.rev >= 0 ? doc.rev : 0,
        sections: day.readSections(doc, nowMs),
    };
}

// The response body: the sections as given plus the newest check-ins of the
// current generation, oldest first.
async function respond(userId, state, nowMs, erased) {
    const rows = await DayCheckin.find({ userId, gen: state.gen })
        .sort({ at: -1 })
        .limit(day.LIMITS.checkinsReturned)
        .lean();
    const checkins = [];
    for (let i = rows.length - 1; i >= 0; i -= 1) {
        const c = day.checkinFromRow(rows[i]);
        if (c) checkins.push(c);
    }
    return day.dayBody(state, checkins, nowMs, erased);
}

// ---------------------------------------------------------------------------
// check-ins
// ---------------------------------------------------------------------------

// Every stored row within a minute of the given check-ins: all the 60-second
// rule needs to see to place them (rows further away can't be refined by them).
function rowsAround(userId, list) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of list) {
        const t = Date.parse(c.at);
        if (t < lo) lo = t;
        if (t > hi) hi = t;
    }
    return DayCheckin.find({
        userId,
        at: { $gte: new Date(lo - day.CHECKIN_REFINE_MS), $lte: new Date(hi + day.CHECKIN_REFINE_MS) },
    }).lean();
}

// Splits rows into this generation's check-ins and leftovers of an earlier
// one. A row from a LATER generation means an erase happened after this
// round read the state: the round is stale and must start over.
function viewOf(rows, gen) {
    const view = { live: [], byAt: new Map(), stale: false, leftovers: false };
    for (const row of rows) {
        if (!(row.at instanceof Date) || Number.isNaN(row.at.getTime())) continue;
        if (row.gen > gen) {
            view.stale = true;
            continue;
        }
        const checkin = row.gen === gen ? day.checkinFromRow(row) : null;
        if (!checkin) view.leftovers = true;
        view.byAt.set(row.at.toISOString(), { row, checkin, live: checkin !== null });
        if (checkin) view.live.push(checkin);
    }
    return view;
}

// Makes the row at c.at hold c, unless what is stored there wins the
// tie-break. `known` is the row this round already read (null: none).
// Conditional writes only, so a concurrent sync's row is never clobbered.
async function settle(userId, gen, c, known) {
    const at = new Date(c.at);
    let row = known;
    for (let i = 0; i < 6; i += 1) {
        if (row === undefined) row = await DayCheckin.findOne({ userId, at }).lean();
        if (!row) {
            try {
                await DayCheckin.create({ userId, gen, at, state: c.state, level: c.level });
                return WROTE;
            } catch (err) {
                if (!(err && err.code === 11000)) throw err;
                row = undefined; // another sync stored this moment first: compare with theirs
                continue;
            }
        }
        if (row.gen > gen) return STALE;
        const stored = row.gen === gen ? day.checkinFromRow(row) : null;
        if (stored && day.checkinJson(stored) >= day.checkinJson(c)) return KEPT;
        const result = await DayCheckin.updateOne(
            {
                _id: row._id,
                gen: row.gen,
                state: row.state === undefined ? null : row.state,
                level: row.level === undefined ? null : row.level,
            },
            { $set: { gen, state: c.state, level: c.level } },
        );
        if (result.matchedCount === 1) return WROTE;
        row = undefined;
    }
    return KEPT;
}

// After writing: another sync may have stored a neighbour while this one
// wrote (both read before either wrote). Look again and apply the 60-second
// rule to what is really there. Of two such syncs, the one that reads last
// sees both rows.
async function refineAround(userId, gen, written) {
    const view = viewOf(await rowsAround(userId, written), gen);
    const keep = new Set(day.mergeCheckins(view.live).map((c) => c.at));
    const drop = view.live.filter((c) => !keep.has(c.at)).map((c) => view.byAt.get(c.at).row._id);
    if (!drop.length) return false;
    const result = await DayCheckin.deleteMany({ _id: { $in: drop }, gen });
    return result.deletedCount > 0;
}

// The newest 5000 are kept.
async function capCheckins(userId, gen) {
    const [edge] = await DayCheckin.find({ userId, gen })
        .sort({ at: -1 })
        .skip(day.LIMITS.checkinsStored)
        .limit(1)
        .select({ at: 1, _id: 0 })
        .lean();
    if (!edge) return false;
    const result = await DayCheckin.deleteMany({ userId, gen, at: { $lte: edge.at } });
    return result.deletedCount > 0;
}

// Merges the request's check-ins (already cleaned, deduplicated and refined
// among themselves) into the stored ones. Returns whether anything stored
// changed, or `stale` when an erase overtook this round.
async function applyCheckins(userId, gen, incoming) {
    let list = incoming;
    // A check-in older than the newest 5000 would be stored only to be
    // dropped again (and would count as a change): leave it out.
    const [floor] = await DayCheckin.find({ userId, gen })
        .sort({ at: -1 })
        .skip(day.LIMITS.checkinsStored - 1)
        .limit(1)
        .select({ at: 1, _id: 0 })
        .lean();
    if (floor) {
        const oldestKept = floor.at.toISOString();
        list = list.filter((c) => c.at >= oldestKept);
    }
    if (!list.length) return { changed: false, stale: false };

    const view = viewOf(await rowsAround(userId, list), gen);
    if (view.stale) return { changed: false, stale: true };
    if (view.leftovers) await DayCheckin.deleteMany({ userId, gen: { $lt: gen } });

    const kept = day.mergeCheckins(view.live, list);
    const jobs = [];
    for (const c of kept) {
        const slot = view.byAt.get(c.at);
        if (slot && slot.live && day.checkinJson(slot.checkin) === day.checkinJson(c)) continue;
        jobs.push({ c, known: slot ? slot.row : null });
    }
    // Different moments never touch the same row, so a few go at once (a
    // device's first sync can bring 200).
    const outcomes = [];
    for (let i = 0; i < jobs.length; i += SETTLE_BATCH) {
        const batch = jobs.slice(i, i + SETTLE_BATCH);
        outcomes.push(...(await Promise.all(batch.map((j) => settle(userId, gen, j.c, j.known)))));
    }
    if (outcomes.includes(STALE)) return { changed: false, stale: true };
    const written = jobs.filter((j, i) => outcomes[i] === WROTE).map((j) => j.c);
    let changed = written.length > 0;
    // Stored check-ins that one of the new ones refines (§5).
    const keptAt = new Set(kept.map((c) => c.at));
    const drop = view.live.filter((c) => !keptAt.has(c.at)).map((c) => view.byAt.get(c.at).row._id);
    if (drop.length) {
        const result = await DayCheckin.deleteMany({ _id: { $in: drop }, gen });
        if (result.deletedCount > 0) changed = true;
    }
    if (written.length) {
        if (await refineAround(userId, gen, written)) changed = true;
        if (await capCheckins(userId, gen)) changed = true;
    }
    return { changed, stale: false };
}

// ---------------------------------------------------------------------------
// the day document
// ---------------------------------------------------------------------------

// Compare-and-set: lands only if nobody wrote since `state` was read.
// Returns the new rev, or 0 when another sync got there first.
async function writeState(userId, state, sections) {
    const rev = state.rev + 1;
    if (!state.doc) {
        try {
            await DayState.create({
                userId,
                gen: state.gen,
                rev,
                anchors: sections.anchors,
                tasks: sections.tasks,
                todos: sections.todos,
                dump: sections.dump,
            });
            return rev;
        } catch (err) {
            // Another first sync created the document: merge into that one.
            if (err && err.code === 11000) return 0;
            throw err;
        }
    }
    const result = await DayState.updateOne(
        { _id: state.doc._id, rev: state.doc.rev, gen: state.doc.gen },
        {
            $set: {
                rev,
                anchors: sections.anchors,
                tasks: sections.tasks,
                todos: sections.todos,
                dump: sections.dump,
            },
        },
    );
    return result.matchedCount === 1 ? rev : 0;
}

async function syncDay(userId, request, nowMs) {
    // Once this request's check-ins are stored, the rev it finally writes
    // must say so, even if that write happens in a later round.
    let checkinsChanged = false;
    let checkinsGen = 0; // the generation this request's check-ins went in under
    let seenGen = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await pause(attempt);
        const state = await loadState(userId, nowMs);
        if (seenGen && state.gen !== seenGen) {
            // An erase landed between two rounds. Rows this request wrote
            // under the old generation are ignored by every read already;
            // remove them from the disk as well.
            await DayCheckin.deleteMany({ userId, gen: { $lt: state.gen } });
            checkinsChanged = false;
        }
        seenGen = state.gen;

        // §7: an older gen means the day was erased elsewhere since this
        // device last synced. Merge nothing; its day is replaced by the answer.
        if (request.gen > 0 && request.gen < state.gen) {
            return respond(userId, state, nowMs, true);
        }

        const sections = day.mergeSections(state.sections, request.sections);
        const itemsChanged = !day.sameSections(sections, state.sections);

        if (request.checkins && request.checkins.length && checkinsGen !== state.gen) {
            const outcome = await applyCheckins(userId, state.gen, request.checkins);
            if (outcome.stale) continue;
            checkinsGen = state.gen;
            if (outcome.changed) checkinsChanged = true;
        }

        // An identical second sync stores nothing and leaves rev alone.
        if (!itemsChanged && !checkinsChanged) return respond(userId, state, nowMs, false);

        const rev = await writeState(userId, state, sections);
        if (rev) return respond(userId, { gen: state.gen, rev, sections }, nowMs, false);
    }
    return null;
}

// Erase everything, check-ins included, and move to the next generation so
// every other device learns of it on its next sync (§7).
async function eraseDay(userId) {
    try {
        // A person who never synced has no document yet; gen still goes 1 → 2.
        await DayState.updateOne(
            { userId },
            { $setOnInsert: { gen: 1, rev: 0, anchors: [], tasks: [], todos: [], dump: [] } },
            { upsert: true },
        );
    } catch (err) {
        if (!(err && err.code === 11000)) throw err;
    }
    const doc = await DayState.findOneAndUpdate(
        { userId },
        { $set: { anchors: [], tasks: [], todos: [], dump: [] }, $inc: { gen: 1, rev: 1 } },
        { new: true },
    ).lean();
    await DayCheckin.deleteMany({ userId, gen: { $lt: doc.gen } });
    return doc.gen;
}

// ---------------------------------------------------------------------------
// GET /api/me/day → the day (same body as a sync answer, `erased: false`)
// ---------------------------------------------------------------------------
router.get(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        let body;
        try {
            await ready();
            const nowMs = Date.now();
            body = await respond(req.userId, await loadState(req.userId, nowMs), nowMs, false);
        } catch (err) {
            throw storageError(err);
        }
        res.json(body);
    }),
);

// ---------------------------------------------------------------------------
// POST /api/me/day/sync
// body: { v: 1, gen?, anchors?, tasks?, todos?, dump?, checkins? }
// returns: { v, gen, rev, serverTime, erased, anchors, tasks, todos, dump, checkins }
// 422 only when the body is not an object or v is not 1; bad items are
// dropped, never an error.
// ---------------------------------------------------------------------------
router.post(
    '/sync',
    requireAuth,
    asyncHandler(async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        const body = req.body;
        if (!day.isObject(body)) {
            return res.status(422).json({ error: 'Day sync expects a JSON object' });
        }
        if (day.own(body, 'v') !== 1) {
            return res.status(422).json({ error: 'Day sync version must be 1' });
        }
        let result;
        try {
            await ready();
            const nowMs = Date.now();
            result = await syncDay(req.userId, day.normalizeRequest(body, nowMs), nowMs);
        } catch (err) {
            throw storageError(err);
        }
        if (!result) {
            res.set('Retry-After', '5');
            return res.status(503).json({ error: 'The day is busy on the server. Try again in a moment.' });
        }
        res.json(result);
    }),
);

// ---------------------------------------------------------------------------
// DELETE /api/me/day → { deleted: true, gen }
// ---------------------------------------------------------------------------
router.delete(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        let gen;
        try {
            await ready();
            gen = await eraseDay(req.userId);
        } catch (err) {
            throw storageError(err);
        }
        res.json({ deleted: true, gen });
    }),
);

module.exports = router;
