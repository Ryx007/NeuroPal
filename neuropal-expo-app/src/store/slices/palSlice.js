import { createSlice, nanoid } from "@reduxjs/toolkit";

// Pal as a buddy: the floating bubble + the assistant sheet (PalSheet).
//
// CONTRACT with the Android widget (keep exactly): mounted at `state.pal`;
// `openSheet` / `closeSheet` ('pal/openSheet' / 'pal/closeSheet', no
// payload); `state.pal.sheetOpen` boolean. The widget's "Ask Pal" button
// dispatches {type: 'pal/openSheet'}.
//
// Persisted (AppProviders, "np.pal.v1"): bubbleHidden, dump, chat, sit,
// sits. Never persisted: sheetOpen, section (the sheet always starts closed).
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
  chat: [], // [{ id, role: 'user' | 'pal', text, at, crisis?, local? }]
  // { id, minutes, label, taskId, anchorId, startedAt, endsAt,
  //   checkIn: null | 'asked' | 'yes' | 'no', endedAt, endReason: 'time' | 'done' }
  sit: null,
  sits: [], // finished sessions the user noted: [{ id, minutes, label, note, at }]
};

const validSection = (s) => (PAL_SECTIONS.includes(s) ? s : null);
const text = (v, max = 2000) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isoNow = () => new Date().toISOString();

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
      state.dump = cleanList(p.dump, 1000, (d) => (text(d.text) ? { id: String(d.id || nanoid()), text: text(d.text), at: String(d.at || isoNow()) } : null));
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
        return { payload: { id: nanoid(), text: text(value), at: isoNow() } };
      },
    },
    removeDump(state, action) {
      state.dump = state.dump.filter((d) => d.id !== action.payload);
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

// What AppProviders writes to storage.
export function persistedPal(pal) {
  return { bubbleHidden: pal.bubbleHidden, dump: pal.dump, chat: pal.chat, sit: pal.sit, sits: pal.sits };
}

export default palSlice.reducer;
