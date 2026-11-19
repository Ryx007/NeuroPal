import { createSlice, current, isDraft, nanoid } from "@reduxjs/toolkit";

import { TEXT_MAX, adoptDump, canonical, cleanDumpTombs, cleanText, isDayBody, shortTitle, stamps, stampsFrom, withTombstone } from "../../services/dayModel.js";
import { addTask, addTodo } from "./homeSlice.js";

// Pal as a buddy: the floating bubble + the assistant sheet (PalSheet).
//
// CONTRACT with the Android widget (keep exactly): mounted at `state.pal`;
// `openSheet` / `closeSheet` ('pal/openSheet' / 'pal/closeSheet', no
// payload); `state.pal.sheetOpen` boolean. The widget's "Ask Pal" button
// dispatches {type: 'pal/openSheet'}.
//
// Persisted (AppProviders, "np.pal.v1"): bubbleHidden, dump, dumpGone, chat,
// sit, sits. Never persisted: sheetOpen, section (the sheet always starts
// closed).
//
// The brain dump syncs with the day (docs/DAY-SYNC.md, services/daySync.js):
// `dump` stays the live list the sheet shows; a deleted line leaves a
// tombstone in `dumpGone` ({id, deletedAt}) until the server has it.
//
// `sit` is the running "Sit with me" session. Its clock is the focus timer
// (focusSlice): the session's endsAt IS focus.endsAt, so Home's Focus tile
// and the Toolbox pomodoro show the same block. PalBuddyHost watches the two
// and ends the session when the block ends.

export const PAL_SECTIONS = ["now", "breakdown", "dump", "sit", "talk"];
const CHAT_KEEP = 30; // stored; the sheet shows the last 10
const SITS_KEEP = 30;

const initialState = {
  sheetOpen: false,
  section: null, // null = the list of actions
  bubbleHidden: false,
  dump: [], // [{ id, text, at }], newest first
  dumpGone: [], // [{ id, deletedAt }] — deleted lines, for day sync
  chat: [], // [{ id, role: 'user' | 'pal', text, at, crisis?, local? }]
  // { id, minutes, label, taskId, anchorId, startedAt, endsAt,
  //   checkIn: null | 'asked' | 'yes' | 'no', endedAt, endReason: 'time' | 'done' }
  sit: null,
  sits: [], // finished sessions the user noted: [{ id, minutes, label, note, at }]
};

const validSection = (s) => (PAL_SECTIONS.includes(s) ? s : null);
const text = (v, max = 2000) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
// A brain-dump line syncs: the server's own text rule, so it comes back unchanged.
const dumpText = (v) => cleanText(v, TEXT_MAX.dump);
const isoNow = () => new Date().toISOString();

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function withoutUnsafe(obj) {
  const out = {};
  for (const key of Object.keys(obj)) if (!UNSAFE_KEYS.has(key)) out[key] = obj[key];
  return out;
}

function cleanList(list, keep, fn) {
  return (Array.isArray(list) ? list : []).filter((x) => x && typeof x === "object").map(fn).filter(Boolean).slice(0, keep);
}

const palSlice = createSlice({
  name: "pal",
  initialState,
  reducers: {
    hydratePal(state, action) {
      const p = action.payload && typeof action.payload === "object" ? action.payload : {};
      state.bubbleHidden = Boolean(p.bubbleHidden);
      // Fields this app doesn't use (from the server) are kept.
      state.dump = cleanList(p.dump, 1000, (d) =>
        dumpText(d.text) ? { ...withoutUnsafe(d), id: String(d.id || nanoid()), text: dumpText(d.text), at: String(d.at || isoNow()) } : null
      );
      state.dumpGone = cleanDumpTombs(p.dumpGone);
      state.chat = cleanList(p.chat, Infinity, (m) =>
        text(m.text, 4000) && (m.role === "user" || m.role === "pal")
          ? { id: String(m.id || nanoid()), role: m.role, text: text(m.text, 4000), at: String(m.at || isoNow()), crisis: Boolean(m.crisis), local: Boolean(m.local) }
          : null
      ).slice(-CHAT_KEEP);
      const s = p.sit;
      state.sit =
        s && typeof s === "object" && Number.isFinite(s.endsAt) && Number.isFinite(s.startedAt)
          ? {
              id: String(s.id || nanoid()),
              minutes: Number(s.minutes) || Math.round((s.endsAt - s.startedAt) / 60000),
              label: text(s.label, 120),
              taskId: s.taskId ? String(s.taskId) : null,
              anchorId: s.anchorId ? String(s.anchorId) : null,
              startedAt: s.startedAt,
              endsAt: s.endsAt,
              checkIn: ["asked", "yes", "no"].includes(s.checkIn) ? s.checkIn : null,
              endedAt: Number.isFinite(s.endedAt) ? s.endedAt : null,
              endReason: s.endReason === "done" ? "done" : s.endedAt ? "time" : null,
            }
          : null;
      state.sits = cleanList(p.sits, SITS_KEEP, (x) => ({
        id: String(x.id || nanoid()),
        minutes: Math.max(0, Math.round(Number(x.minutes) || 0)),
        label: text(x.label, 120),
        note: text(x.note, 500),
        at: String(x.at || isoNow()),
      }));
    },

    // ---- the sheet (widget contract) ----
    openSheet(state) {
      state.sheetOpen = true;
      // A running or just-finished sit is what you came back for.
      state.section = state.sit ? "sit" : null;
    },
    closeSheet(state) {
      state.sheetOpen = false;
      state.section = null;
    },
    // Open the sheet straight on one action (e.g. openPalSheet('talk')).
    openSection(state, action) {
      state.sheetOpen = true;
      state.section = validSection(action.payload);
    },
    setSection(state, action) {
      state.section = validSection(action.payload);
    },
    setBubbleHidden(state, action) {
      state.bubbleHidden = Boolean(action.payload);
    },

    // ---- brain dump ----
    addDump: {
      reducer(state, action) {
        if (!action.payload.text) return;
        state.dump.unshift(action.payload);
        // the same cap the saved list gets when it's loaded
        if (state.dump.length > 1000) state.dump.length = 1000;
      },
      prepare(value) {
        return { payload: { id: nanoid(), text: dumpText(value), at: isoNow() } };
      },
    },
    // The text is gone at once; the tombstone carries the deletion to the
    // server and other devices. Undo writes the text again under a new id.
    removeDump: {
      reducer(state, action) {
        if (!state.dump.some((d) => d.id === action.payload)) return;
        const { now } = stampsFrom(action.meta);
        state.dump = state.dump.filter((d) => d.id !== action.payload);
        const gone = isDraft(state.dumpGone) ? current(state.dumpGone) : state.dumpGone;
        state.dumpGone = withTombstone(gone, { id: String(action.payload), deletedAt: now });
      },
      prepare: (id) => ({ payload: id, meta: stamps() }),
    },

    // ---- talk ----
    pushChat: {
      reducer(state, action) {
        if (!action.payload.text) return;
        state.chat.push(action.payload);
        if (state.chat.length > CHAT_KEEP) state.chat = state.chat.slice(-CHAT_KEEP);
      },
      prepare({ role, text: value, crisis = false, local = false }) {
        return {
          payload: { id: nanoid(), role: role === "user" ? "user" : "pal", text: text(value, 4000), at: isoNow(), crisis: Boolean(crisis), local: Boolean(local) },
        };
      },
    },
    clearChat(state) {
      state.chat = [];
    },

    // ---- sit with me ----
    sitStarted: {
      reducer(state, action) {
        state.sit = action.payload;
      },
      prepare({ minutes, label = "", taskId = null, anchorId = null, startedAt, endsAt }) {
        return {
          payload: {
            id: nanoid(),
            minutes: Math.max(1, Math.round(Number(minutes) || 1)),
            label: text(label, 120),
            taskId: taskId ? String(taskId) : null,
            anchorId: anchorId ? String(anchorId) : null,
            startedAt,
            endsAt,
            checkIn: null,
            endedAt: null,
            endReason: null,
          },
        };
      },
    },
    sitCheckIn(state, action) {
      if (state.sit && ["asked", "yes", "no"].includes(action.payload)) state.sit.checkIn = action.payload;
    },
    // reason: 'time' (the block ran out) | 'done' (the user finished)
    sitEnded(state, action) {
      if (!state.sit || state.sit.endedAt) return;
      const { reason = "time", at } = action.payload || {};
      state.sit.endedAt = Number.isFinite(at) ? at : state.sit.endsAt;
      state.sit.endReason = reason === "done" ? "done" : "time";
    },
    // Session over without a note (skipped, stopped, or forgotten).
    sitCleared(state) {
      state.sit = null;
    },
    saveSitNote: {
      reducer(state, action) {
        if (!state.sit) return;
        const s = state.sit;
        const end = s.endedAt || s.endsAt;
        if (action.payload.note) {
          state.sits.unshift({
            id: action.payload.id,
            minutes: Math.max(1, Math.round((end - s.startedAt) / 60000)),
            label: s.label,
            note: action.payload.note,
            at: action.payload.at,
          });
          state.sits = state.sits.slice(0, SITS_KEEP);
        }
        state.sit = null;
      },
      prepare(note) {
        return { payload: { id: nanoid(), note: text(note, 500), at: isoNow() } };
      },
    },
  },
  extraReducers: (builder) => {
    // The session ended (signed out, or the server said so): a sheet asked
    // for meanwhile must not pop up after the next sign-in.
    builder.addCase("auth/resetAuth", (state) => {
      state.sheetOpen = false;
      state.section = null;
    });
    // Day sync (homeSlice.adoptDay): the dump half of the server's answer.
    // Same rule as the other sections: lines the answer doesn't mention stay.
    builder.addCase("home/adoptDay", (state, action) => {
      const body = action.payload;
      if (!isDayBody(body)) return;
      const snap = current(state);
      const r = adoptDump(snap.dump, snap.dumpGone, body.dump, body.erased === true);
      if (!r) return;
      if (canonical(r.live) !== canonical(snap.dump)) state.dump = r.live;
      if (canonical(r.gone) !== canonical(snap.dumpGone)) state.dumpGone = r.gone;
    });
    // The day belonged to another account (homeSlice.resetDay).
    builder.addCase("home/resetDay", (state) => {
      state.dump = [];
      state.dumpGone = [];
    });
  },
});

export const {
  hydratePal,
  openSheet,
  closeSheet,
  openSection,
  setSection,
  setBubbleHidden,
  addDump,
  removeDump,
  pushChat,
  clearChat,
  sitStarted,
  sitCheckIn,
  sitEnded,
  sitCleared,
  saveSitNote,
} = palSlice.actions;

// The brain dump's "Minimum day" / "To-do" buttons. A task or to-do keeps
// less text than a dump line (§8 "Text limits"), so a line that doesn't fit
// whole stays in the dump and its end is never lost; the target gets a
// shortened copy (whole words, "…"). Returns true when the line stayed (the
// sheet says so).
export const moveDumpLine = (item, where) => (dispatch) => {
  if (!item || typeof item.text !== "string") return false;
  const title = shortTitle(item.text, where === "day" ? TEXT_MAX.taskTitle : TEXT_MAX.todoTitle);
  const fits = title === dumpText(item.text);
  dispatch(where === "day" ? addTask(title) : addTodo(title));
  if (fits) dispatch(removeDump(item.id));
  return !fits;
};

// What AppProviders writes to storage.
export function persistedPal(pal) {
  return { bubbleHidden: pal.bubbleHidden, dump: pal.dump, dumpGone: pal.dumpGone, chat: pal.chat, sit: pal.sit, sits: pal.sits };
}

export default palSlice.reducer;
