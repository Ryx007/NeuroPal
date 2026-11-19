// Day sync (docs/DAY-SYNC.md §4–§6) as pure functions: no I/O, no Mongoose.
// routes/day.js reads the stored state, hands it here with the request, and
// writes back what comes out; test/day.merge.test.js checks the merge
// properties (commutative, associative, idempotent) on generated cases.
//
// Everything that reaches the database is rebuilt here, field by field, from
// an allow-list. Nothing from a request object is spread or copied as-is, so
// unknown keys (`__proto__` and `constructor` included) are never stored.
// Bad items are dropped quietly: a sync never fails because of one item.

const LIMITS = Object.freeze({
    perRequest: 2000, // items per section in one request; the rest are ignored
    live: Object.freeze({ anchors: 200, tasks: 100, todos: 1000, dump: 1000 }),
    tombstones: 500, // per section; the oldest go first
    checkinsStored: 5000, // per user; the newest are kept
    checkinsReturned: 200, // newest, sent oldest first
});

// One phone with a fast clock must not win every merge forever: a stamp more
// than this far ahead of the server is set to the server's clock.
const CLOCK_SLACK_MS = 60 * 1000;
// Clients refine a check-in made within a minute of the previous one instead
// of adding another (neuropal-expo-app homeSlice: CHECKIN_MERGE_MS, `<`).
const CHECKIN_REFINE_MS = 60 * 1000;

const SECTIONS = Object.freeze(['anchors', 'tasks', 'todos', 'dump']);
const CATEGORIES = new Set(['medication', 'break', 'study', 'move', 'other']);
const STATES = new Set(['green', 'yellow', 'red']);

// The definition of an item is every field except the stamps, the tick and
// deletedAt (§5.1). Listed in the order items are written out.
const DEFINITION_FIELDS = Object.freeze({
    anchors: Object.freeze(['title', 'subtitle', 'time', 'flexMinutes', 'category', 'icon', 'location']),
    tasks: Object.freeze(['title', 'subtitle']),
    todos: Object.freeze(['title', 'done']),
});
const TICKED = new Set(['anchors', 'tasks']);

const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const STAMP_RE =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:(Z)|([+-])(\d{2}):?(\d{2}))$/;

// Years 0000–9999 only, so every stored stamp has the same 24-character shape
// and comparing two stamps as strings compares them in time.
const MIN_MS = Date.parse('0000-01-01T00:00:00.000Z');
const MAX_MS = Date.parse('9999-12-31T23:59:59.999Z');

// A marker for "present but unusable", distinct from null ("absent").
const BAD = Symbol('bad');

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Read only the object's own keys: nothing inherited from a prototype.
function own(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

// -0 survives JSON.parse and BSON but prints as 0; store the plain zero.
function plainZero(n) {
    return n === 0 ? 0 : n;
}

function compareStrings(a, b) {
    if (a < b) return -1;
    return a > b ? 1 : 0;
}

// JSON with object keys sorted at every level, for the tie-breaks of §5.
function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const parts = [];
        for (const key of Object.keys(value).sort()) {
            if (value[key] === undefined) continue;
            parts.push(`${JSON.stringify(key)}:${canonicalJson(value[key])}`);
        }
        return `{${parts.join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
}

// A lone surrogate can't be stored as UTF-8: MongoDB would hand back U+FFFD,
// and the next sync would see a "different" text. Replace it up front.
const toWellFormed =
    typeof String.prototype.toWellFormed === 'function'
        ? (s) => s.toWellFormed()
        : (s) => s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');

// §4: trim, collapse inner whitespace to single spaces, cut to the limit.
// The limit counts UTF-16 units (what JS and Dart call length); a cut never
// splits a surrogate pair, and a cut that ends on a space is trimmed again so
// that cleaning a cleaned text changes nothing.
function cleanText(value, limit) {
    if (typeof value !== 'string') return null;
    let s = toWellFormed(value).replace(/\s+/g, ' ').trim();
    if (s.length > limit) {
        s = s.slice(0, limit);
        const last = s.charCodeAt(s.length - 1);
        if (last >= 0xd800 && last <= 0xdbff) s = s.slice(0, -1);
        s = s.trimEnd();
    }
    return s;
}

function cleanId(value) {
    return typeof value === 'string' && ID_RE.test(value) ? value : null;
}

function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isCalendarDay(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    return d <= (m === 2 && isLeapYear(y) ? 29 : MONTH_DAYS[m - 1]);
}

// Strict ISO-8601 → epoch milliseconds, or NaN. Date.parse alone is too
// lenient for an identity field: it rolls 2026-02-30 over into March, reads
// "1" as the year 2001, and takes a stamp without a zone as server-local time.
// Accepted: date, `T`, hh:mm[:ss[.fraction]], then `Z` or an offset.
function parseStamp(value) {
    if (typeof value !== 'string' || value.length > 40) return NaN;
    const m = STAMP_RE.exec(value);
    if (!m) return NaN;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const s = m[6] ? Number(m[6]) : 0;
    const ms = m[7] ? Number(`${m[7]}00`.slice(0, 3)) : 0;
    if (!isCalendarDay(y, mo, d) || h > 23 || mi > 59 || s > 59) return NaN;
    let offsetMs = 0;
    if (!m[8]) {
        const oh = Number(m[10]);
        const om = Number(m[11]);
        if (oh > 23 || om > 59) return NaN;
        offsetMs = (m[9] === '-' ? -1 : 1) * (oh * 60 + om) * 60 * 1000;
    }
    // setUTCFullYear, not Date.UTC: Date.UTC maps the years 0–99 to 19xx.
    const date = new Date(0);
    date.setUTCFullYear(y, mo - 1, d);
    date.setUTCHours(h, mi, s, ms);
    const t = date.getTime() - offsetMs;
    return t >= MIN_MS && t <= MAX_MS ? t : NaN;
}

// A timestamp field: null when absent, BAD when unusable, otherwise the
// normalised ISO string with the clock rule of §6 applied.
function stamp(value, nowMs) {
    if (value === undefined || value === null) return null;
    const t = parseStamp(value);
    if (Number.isNaN(t)) return BAD;
    return new Date(t > nowMs + CLOCK_SLACK_MS ? nowMs : t).toISOString();
}

// `doneOn` is a local calendar date on the device that ticked: kept as the
// string it is, never shifted or clamped.
function cleanDay(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') return BAD;
    const m = DAY_RE.exec(value);
    if (!m || !isCalendarDay(Number(m[1]), Number(m[2]), Number(m[3]))) return BAD;
    return value;
}

// ---------------------------------------------------------------------------
// items (§4)
// ---------------------------------------------------------------------------

function cleanTime(value) {
    if (!isObject(value)) return null;
    const hour = own(value, 'hour');
    const minute = own(value, 'minute');
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    return { hour: plainZero(hour), minute: plainZero(minute) };
}

// Optional fields are left out when they have no usable value (never null).
function cleanFlexMinutes(value) {
    if (!isNumber(value)) return undefined;
    return plainZero(Math.min(120, Math.max(0, Math.round(value))));
}

function cleanLocation(value) {
    if (!isObject(value)) return undefined;
    const lat = own(value, 'lat');
    const lng = own(value, 'lng');
    const radius = own(value, 'radius');
    if (!isNumber(lat) || lat < -90 || lat > 90) return undefined;
    if (!isNumber(lng) || lng < -180 || lng > 180) return undefined;
    if (!isNumber(radius) || radius < 0) return undefined;
    return { lat: plainZero(lat), lng: plainZero(lng), radius: plainZero(radius) };
}

const DEFINITIONS = {
    anchors(raw) {
        const title = cleanText(own(raw, 'title'), 120);
        const time = cleanTime(own(raw, 'time'));
        if (!title || !time) return null;
        const def = { title, subtitle: cleanText(own(raw, 'subtitle'), 200) || '', time };
        const flexMinutes = cleanFlexMinutes(own(raw, 'flexMinutes'));
        if (flexMinutes !== undefined) def.flexMinutes = flexMinutes;
        const category = own(raw, 'category');
        if (typeof category === 'string' && CATEGORIES.has(category)) def.category = category;
        const icon = cleanText(own(raw, 'icon'), 40);
        if (icon) def.icon = icon;
        const location = cleanLocation(own(raw, 'location'));
        if (location) def.location = location;
        return def;
    },
    tasks(raw) {
        const title = cleanText(own(raw, 'title'), 120);
        if (!title) return null;
        return { title, subtitle: cleanText(own(raw, 'subtitle'), 120) || '' };
    },
    todos(raw) {
        const title = cleanText(own(raw, 'title'), 200);
        if (!title) return null;
        return { title, done: own(raw, 'done') === true };
    },
};

// A tick is `doneOn` + `tickAt`. A `doneOn` without the moment it was set
// can't be ordered against other ticks, so it counts as no tick at all.
function cleanTick(raw, nowMs) {
    const tickAt = stamp(own(raw, 'tickAt'), nowMs);
    const doneOn = cleanDay(own(raw, 'doneOn'));
    if (tickAt === BAD || doneOn === BAD) return BAD;
    if (tickAt === null) return { doneOn: null, tickAt: null };
    return { doneOn, tickAt };
}

function tombstone(id, createdAt, updatedAt, deletedAt) {
    return { id, createdAt, updatedAt, deletedAt };
}

// Writes a live item in a fixed key order, copying only the definition
// fields of `src` (an item this module built, never a request object).
function liveItem(kind, id, src, createdAt, updatedAt, tick) {
    const item = { id };
    for (const field of DEFINITION_FIELDS[kind]) {
        if (src[field] !== undefined) item[field] = src[field];
    }
    item.createdAt = createdAt;
    item.updatedAt = updatedAt;
    item.deletedAt = null;
    if (TICKED.has(kind)) {
        item.doneOn = tick ? tick.doneOn : null;
        item.tickAt = tick ? tick.tickAt : null;
    }
    return item;
}

function normalizeDumpItem(id, raw, nowMs) {
    const deletedAt = stamp(own(raw, 'deletedAt'), nowMs);
    if (deletedAt === BAD) return null;
    // No restore for the dump (Undo writes a new id), so any deletion is final.
    if (deletedAt !== null) return { id, deletedAt };
    const text = cleanText(own(raw, 'text'), 2000);
    const at = stamp(own(raw, 'at'), nowMs);
    if (!text || at === null || at === BAD) return null;
    return { id, text, at, deletedAt: null };
}

// One item of a section, rebuilt from the allow-list — or null to drop it:
// wrong shape, bad id, empty title or text, unparseable time (§6).
function normalizeItem(kind, raw, nowMs) {
    if (!isObject(raw)) return null;
    const id = cleanId(own(raw, 'id'));
    if (!id) return null;
    if (kind === 'dump') return normalizeDumpItem(id, raw, nowMs);

    const createdAt = stamp(own(raw, 'createdAt'), nowMs);
    const updatedAt = stamp(own(raw, 'updatedAt'), nowMs);
    const deletedAt = stamp(own(raw, 'deletedAt'), nowMs);
    if (createdAt === null || createdAt === BAD) return null;
    if (updatedAt === null || updatedAt === BAD || deletedAt === BAD) return null;
    // A tombstone carries no content: whatever else came with it is dropped
    // here, before it could reach the merge or the database.
    if (deletedAt !== null && deletedAt >= updatedAt) return tombstone(id, createdAt, updatedAt, deletedAt);

    const def = DEFINITIONS[kind](raw);
    if (!def) return null;
    let tick = null;
    if (TICKED.has(kind)) {
        tick = cleanTick(raw, nowMs);
        if (tick === BAD) return null;
    }
    return liveItem(kind, id, def, createdAt, updatedAt, tick);
}

function normalizeList(kind, list, nowMs, max) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const n = Math.min(list.length, max);
    for (let i = 0; i < n; i += 1) {
        const item = normalizeItem(kind, list[i], nowMs);
        if (item) out.push(item);
    }
    return out;
}

function normalizeCheckin(raw, nowMs) {
    if (!isObject(raw)) return null;
    const at = stamp(own(raw, 'at'), nowMs);
    const state = own(raw, 'state');
    if (at === null || at === BAD || typeof state !== 'string' || !STATES.has(state)) return null;
    const level = own(raw, 'level');
    return { at, state, level: isNumber(level) ? plainZero(Math.min(1, Math.max(0, level))) : null };
}

// ---------------------------------------------------------------------------
// merge (§5)
// ---------------------------------------------------------------------------

function isTombstone(item) {
    return item.deletedAt !== null && item.deletedAt !== undefined;
}

function definitionJson(kind, item) {
    const def = {};
    for (const field of DEFINITION_FIELDS[kind]) {
        if (item[field] !== undefined) def[field] = item[field];
    }
    return canonicalJson(def);
}

function laterOf(a, b) {
    if (a === null) return b;
    if (b === null) return a;
    return a >= b ? a : b;
}

// The later tickAt wins; no tick loses to any tick; a tie goes to the
// greater doneOn (null smallest). A tombstone brings no tick.
function laterTick(a, b) {
    const ta = isTombstone(a) ? null : a.tickAt;
    const tb = isTombstone(b) ? null : b.tickAt;
    if (ta !== tb) {
        if (ta === null) return b;
        if (tb === null) return a;
        return ta > tb ? a : b;
    }
    if (ta === null) return null;
    const da = a.doneOn;
    const db = b.doneOn;
    if (da === db || db === null) return a;
    if (da === null) return b;
    return da > db ? a : b;
}

// Two copies of one anchor / task / to-do (same id), each live or a tombstone.
function mergeItem(kind, a, b) {
    const updatedAt = a.updatedAt >= b.updatedAt ? a.updatedAt : b.updatedAt;
    const createdAt = a.createdAt <= b.createdAt ? a.createdAt : b.createdAt;
    const deletedAt = laterOf(a.deletedAt, b.deletedAt);
    if (deletedAt !== null && deletedAt >= updatedAt) return tombstone(a.id, createdAt, updatedAt, deletedAt);

    // Live. The definition comes whole from the later edit; a tie with
    // different content goes to the greater canonical JSON. (The source is
    // never a tombstone here: a tombstone holding the latest updatedAt makes
    // deletedAt >= updatedAt above.)
    let src;
    if (a.updatedAt !== b.updatedAt) src = a.updatedAt > b.updatedAt ? a : b;
    else src = definitionJson(kind, a) >= definitionJson(kind, b) ? a : b;
    const tick = TICKED.has(kind) ? laterTick(a, b) : null;
    return liveItem(kind, a.id, src, createdAt, updatedAt, tick);
}

function dumpJson(item) {
    return canonicalJson({ at: item.at, text: item.text });
}

// Two copies of one brain-dump item. Its text is never edited, so the copy
// written first (the earlier `at`) keeps text and at — decided by the copies
// themselves, not by which one reached the server first, so the result is
// the same in any order. A deletion is final.
function mergeDumpItem(a, b) {
    const deletedAt = laterOf(a.deletedAt, b.deletedAt);
    if (deletedAt !== null) return { id: a.id, deletedAt };
    let first;
    if (a.at !== b.at) first = a.at < b.at ? a : b;
    else first = dumpJson(a) >= dumpJson(b) ? a : b;
    return { id: a.id, text: first.text, at: first.at, deletedAt: null };
}

function minutesOfDay(item) {
    return item.time.hour * 60 + item.time.minute;
}

// Response order (§5): anchors by time of day, then id; tasks and to-dos by
// createdAt, then id; the dump newest first. Tombstones have no time of day
// (anchors) or `at` (dump), so they follow the live items there.
function orderSection(kind, items) {
    const list = items.slice();
    if (kind === 'anchors') {
        return list.sort((a, b) => {
            const ta = isTombstone(a);
            const tb = isTombstone(b);
            if (ta !== tb) return ta ? 1 : -1;
            if (!ta) {
                const d = minutesOfDay(a) - minutesOfDay(b);
                if (d) return d;
            }
            return compareStrings(a.id, b.id);
        });
    }
    if (kind === 'dump') {
        return list.sort((a, b) => {
            const ta = isTombstone(a);
            const tb = isTombstone(b);
            if (ta !== tb) return ta ? 1 : -1;
            const d = ta ? compareStrings(b.deletedAt, a.deletedAt) : compareStrings(b.at, a.at);
            return d || compareStrings(a.id, b.id);
        });
    }
    return list.sort((a, b) => compareStrings(a.createdAt, b.createdAt) || compareStrings(a.id, b.id));
}

// Stored per user (§6). Over the cap the oldest go first: tombstones by
// deletedAt, live items by createdAt (the dump by `at`). A live item over the
// cap is simply not stored; clients keep and resend what an answer leaves out.
function capSection(kind, items) {
    const live = [];
    const gone = [];
    for (const item of items) (isTombstone(item) ? gone : live).push(item);
    const liveCap = LIMITS.live[kind];
    const age = kind === 'dump' ? 'at' : 'createdAt';
    const keptLive =
        live.length <= liveCap
            ? live
            : live.sort((a, b) => compareStrings(b[age], a[age]) || compareStrings(b.id, a.id)).slice(0, liveCap);
    const keptGone =
        gone.length <= LIMITS.tombstones
            ? gone
            : gone
                  .sort((a, b) => compareStrings(b.deletedAt, a.deletedAt) || compareStrings(b.id, a.id))
                  .slice(0, LIMITS.tombstones);
    return keptLive.concat(keptGone);
}

// Merges any number of lists of normalised items of one section (each list
// may repeat an id) into one capped, ordered list.
function mergeSection(kind, ...lists) {
    const byId = new Map();
    for (const list of lists) {
        for (const item of list || []) {
            const prev = byId.get(item.id);
            if (!prev) byId.set(item.id, item);
            else byId.set(item.id, kind === 'dump' ? mergeDumpItem(prev, item) : mergeItem(kind, prev, item));
        }
    }
    return orderSection(kind, capSection(kind, [...byId.values()]));
}

function checkinJson(c) {
    return canonicalJson({ at: c.at, state: c.state, level: c.level });
}

// §5 check-ins: within a time-sorted list, a check-in followed by another
// less than 60 seconds later is dropped (the later one refines it).
function dropRefined(sorted) {
    const out = [];
    for (let i = 0; i < sorted.length; i += 1) {
        const next = sorted[i + 1];
        if (next && Date.parse(next.at) - Date.parse(sorted[i].at) < CHECKIN_REFINE_MS) continue;
        out.push(sorted[i]);
    }
    return out;
}

// The union by `at` (the same `at` twice: the greater canonical JSON wins),
// sorted oldest first, then the 60-second rule.
function mergeCheckins(...lists) {
    const byAt = new Map();
    for (const list of lists) {
        for (const c of list || []) {
            const prev = byAt.get(c.at);
            if (!prev || checkinJson(c) > checkinJson(prev)) byAt.set(c.at, c);
        }
    }
    return dropRefined([...byAt.values()].sort((a, b) => compareStrings(a.at, b.at)));
}

// ---------------------------------------------------------------------------
// request, stored state, response
// ---------------------------------------------------------------------------

function emptySections() {
    return { anchors: [], tasks: [], todos: [], dump: [] };
}

// The request body (already known to be an object with v === 1). A section
// that is missing or not an array is "not sent" (null) and stays untouched;
// `gen` that isn't a positive integer counts as "never synced" (0).
function normalizeRequest(body, nowMs) {
    const genRaw = own(body, 'gen');
    const sections = {};
    for (const kind of SECTIONS) {
        const list = own(body, kind);
        sections[kind] = Array.isArray(list) ? normalizeList(kind, list, nowMs, LIMITS.perRequest) : null;
    }
    const rawCheckins = own(body, 'checkins');
    let checkins = null;
    if (Array.isArray(rawCheckins)) {
        const list = [];
        const n = Math.min(rawCheckins.length, LIMITS.perRequest);
        for (let i = 0; i < n; i += 1) {
            const c = normalizeCheckin(rawCheckins[i], nowMs);
            if (c) list.push(c);
        }
        // Applying the 60-second rule to the request alone only drops what the
        // rule over the union would drop too, and saves writing it.
        checkins = mergeCheckins(list);
    }
    return {
        gen: Number.isSafeInteger(genRaw) && genRaw > 0 ? genRaw : 0,
        sections,
        checkins,
    };
}

// The sections of a stored DayState document, re-checked the same way as a
// request (so the merge only ever sees items this module built).
function readSections(doc, nowMs) {
    const out = emptySections();
    if (!doc) return out;
    for (const kind of SECTIONS) {
        out[kind] = mergeSection(kind, normalizeList(kind, doc[kind], nowMs, Infinity));
    }
    return out;
}

// stored ⊕ request, section by section; a section the request didn't send
// is left exactly as stored.
function mergeSections(stored, incoming) {
    const out = {};
    for (const kind of SECTIONS) {
        out[kind] = incoming[kind] ? mergeSection(kind, stored[kind], incoming[kind]) : stored[kind];
    }
    return out;
}

// Both sides are built by this module with a fixed key order, so plain
// JSON text is a faithful comparison.
function sameSections(a, b) {
    return SECTIONS.every((kind) => JSON.stringify(a[kind]) === JSON.stringify(b[kind]));
}

// A stored DayCheckin row back into a check-in, or null if it is unusable.
function checkinFromRow(row) {
    if (!row || !(row.at instanceof Date) || Number.isNaN(row.at.getTime())) return null;
    if (typeof row.state !== 'string' || !STATES.has(row.state)) return null;
    const level = isNumber(row.level) ? plainZero(Math.min(1, Math.max(0, row.level))) : null;
    return { at: row.at.toISOString(), state: row.state, level };
}

function dayBody(state, checkins, nowMs, erased) {
    return {
        v: 1,
        gen: state.gen,
        rev: state.rev,
        serverTime: new Date(nowMs).toISOString(),
        erased: Boolean(erased),
        anchors: state.sections.anchors,
        tasks: state.sections.tasks,
        todos: state.sections.todos,
        dump: state.sections.dump,
        checkins,
    };
}

module.exports = {
    LIMITS,
    SECTIONS,
    CLOCK_SLACK_MS,
    CHECKIN_REFINE_MS,
    isObject,
    own,
    canonicalJson,
    cleanText,
    parseStamp,
    normalizeItem,
    normalizeCheckin,
    normalizeRequest,
    readSections,
    isTombstone,
    mergeItem,
    mergeDumpItem,
    mergeSection,
    mergeSections,
    sameSections,
    orderSection,
    capSection,
    checkinJson,
    dropRefined,
    mergeCheckins,
    checkinFromRow,
    emptySections,
    dayBody,
};
