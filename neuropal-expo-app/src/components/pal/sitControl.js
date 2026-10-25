import { announce } from "../../services/announce";
import { cancelScheduled, scheduleAt } from "../../services/notify";
import { pausePhase, phaseCompleted, startPhase } from "../../store/slices/focusSlice";
import { sitCheckIn, sitCleared, sitEnded, sitStarted } from "../../store/slices/palSlice";
import { palSay } from "../../theme/tokens";

// "Sit with me" (body doubling) runs on the app's ONE focus timer
// (focusSlice): a sit is a focus block Pal keeps you company through, so
// Home's Focus tile, the Toolbox pomodoro and its notification all show the
// same block. palSlice.sit only adds what Pal needs on top (label, the
// halfway check-in, the end prompt). `store` = { dispatch, getState }.
// Its prompts are spoken with the shared announce(), which also reaches
// screen readers on the web (live regions).

const GRACE_MS = 1500; // let the Toolbox pomodoro (if mounted) finish the block first
const FORGET_ENDED_MS = 30 * 60 * 1000; // an unanswered "Nice. Note it?" goes away quietly

function sayEnd(pal) {
  announce(`${pal?.name || "Pal"}: ${palSay(pal, "sitEnd")}`);
}

// Start a new sit. Anything running on the focus timer gives way (a break
// ends; a running block is replaced — the sheet offers "join" instead when
// one is running).
export async function startSit(store, { minutes, label = "", taskId = null, anchorId = null, pal }) {
  const { dispatch, getState } = store;
  const f = getState().focus;
  if (f.running) {
    await cancelScheduled(f.notificationId);
    dispatch(pausePhase());
  }
  if (getState().focus.phase !== "work") dispatch(phaseCompleted()); // break → work, no count change
  const startedAt = Date.now();
  const endsAt = startedAt + Math.max(1, minutes) * 60000;
  dispatch(startPhase({ endsAt, notificationId: null }));
  dispatch(sitStarted({ minutes, label, taskId, anchorId, startedAt, endsAt }));
  announce(palSay(pal, "sitStart"));
  // The end notification (native only; may ask for permission once) is
  // attached afterwards so the timer never waits on a permission prompt.
  const name = pal?.name || "Pal";
  const body = label ? `That’s your ${minutes} minutes on ${label}. Want to note what you did?` : `That’s your ${minutes} minutes. Want to note what you did?`;
  const id = await scheduleAt(new Date(endsAt), `${name}: nice.`, body, { category: "pomodoro", data: { refId: `pal-sit-${endsAt}` } });
  if (!id) return;
  const now = getState().focus;
  if (now.running && now.endsAt === endsAt) dispatch(startPhase({ endsAt, notificationId: id }));
  else cancelScheduled(id);
}

// Keep the user company through the focus block that is already running.
export function joinFocus(store, { label = "", pal }) {
  const { dispatch, getState } = store;
  const f = getState().focus;
  if (!f.running || !f.endsAt || f.phase !== "work") return;
  const startedAt = Date.now();
  dispatch(sitStarted({ minutes: Math.max(1, Math.round((f.endsAt - startedAt) / 60000)), label, startedAt, endsAt: f.endsAt }));
  announce(palSay(pal, "sitStart"));
}

function linkedBlock(getState) {
  const s = getState().pal.sit;
  const f = getState().focus;
  return Boolean(s && f.running && f.endsAt === s.endsAt) ? f : null;
}

// "I'm done": the block counts as finished (pomodoro moves to its break).
export async function finishSit(store) {
  const { dispatch, getState } = store;
  const f = linkedBlock(getState);
  if (f) {
    await cancelScheduled(f.notificationId);
    if (linkedBlock(getState)) dispatch(phaseCompleted());
  }
  dispatch(sitEnded({ reason: "done", at: Date.now() }));
  sayEnd(getState().look.pal); // the pressed button is gone; the end prompt replaced it
}

// "Stop here": the block is paused, not counted. Still ends kindly.
export async function stopSit(store) {
  const { dispatch, getState } = store;
  const f = linkedBlock(getState);
  if (f) {
    await cancelScheduled(f.notificationId);
    if (linkedBlock(getState)) dispatch(pausePhase());
  }
  dispatch(sitEnded({ reason: "done", at: Date.now() }));
  sayEnd(getState().look.pal);
}

// One tick of the session watcher (PalBuddyHost runs it every second while
// a sit exists): the halfway check-in, the natural end, a block paused or
// reset elsewhere (Toolbox), and forgetting an old unanswered end prompt.
export function tickSit(store, { pal, sheetShowsSit = false } = {}) {
  const { dispatch, getState } = store;
  const s = getState().pal.sit;
  if (!s) return;
  const now = Date.now();
  if (s.endedAt) {
    if (!sheetShowsSit && now - s.endedAt > FORGET_ENDED_MS) dispatch(sitCleared());
    return;
  }
  const linked = Boolean(linkedBlock(getState));
  const half = s.startedAt + (s.endsAt - s.startedAt) / 2;
  if (!s.checkIn && linked && now >= half && s.endsAt - now > 60000) {
    dispatch(sitCheckIn("asked"));
    announce(`${pal?.name || "Pal"}: ${palSay(pal, "sitCheck")}`);
    return;
  }
  if (now >= s.endsAt + GRACE_MS || (!linked && now >= s.endsAt - 2000)) {
    // Ran out: finish the focus block if nobody else did, then Pal's prompt.
    if (linkedBlock(getState)) dispatch(phaseCompleted());
    dispatch(sitEnded({ reason: "time", at: s.endsAt }));
    sayEnd(pal);
    return;
  }
  if (!linked) {
    // The block was paused or reset in the Toolbox: the sit is over too.
    dispatch(sitCleared());
  }
}

export function minutesLeft(sit, now) {
  if (!sit) return 0;
  return Math.max(0, Math.ceil((sit.endsAt - now) / 60000));
}

export function leftLabel(sit, now) {
  const ms = sit ? sit.endsAt - now : 0;
  if (ms <= 0) return "time’s up";
  if (ms < 60000) return "under a minute left";
  const m = Math.ceil(ms / 60000);
  return `${m} min left`;
}
