"use client";
// Keeps the day — check-ins, anchors, the minimum viable day and Pal's brain
// dump — in step with the server, so a check-in on the phone shows up here
// and an anchor edited here reaches the phone (docs/DAY-SYNC.md §8). The web
// app has no to-do list: it never sends or stores `todos`.
//
// One request does everything: POST /api/me/day/sync sends every item this
// browser has (tombstones included) and answers with the merged day, which
// replaces ours (dayModel.adoptAnswer) — unless something changed here while
// it was on the wire; then the answer is dropped and we send again.
//
// When: at start and sign-in, when the tab becomes visible, 2.5 s after the
// last change made in this tab, when the connection comes back, and every
// 5 minutes while the tab is visible. Only signed in, with "Keep my day in
// sync" on (Settings), and never on the calming steps (no network there).
// Failures: offline, 5xx, 408 or 429 → retry after 5 s, 30 s, then every 5
// minutes; 401 for the token held now → the session ended: stop until the
// session changes (a late 401 for a token since replaced stops nothing);
// 404 → this server has no day sync; any other 4xx → it refused the day:
// stop until the next start (or another server).
//
// Sync never interrupts. The only place a problem shows is the line under the
// Settings switch: requests go through apiRequest (like lookSync.ts), so a
// failed background try never raises the shell's "can't reach" notice (an
// answer still clears it), and a 401 only stops the sync — the next ordinary
// request applies the session-ended rule (client.ts).
//
// Two tabs share the stored day. A change is sent by the tab it was made in
// (the other tab steps in only if it is still unsent 10 s later, say the tab
// was closed); an answer one tab adopts is never a change for another, so
// tabs never answer each other's writes with sync after sync. The sync's own
// writes go through the day's lock and read storage itself (day.ts
// updateStored), so a tab that hasn't heard of another tab's write yet can't
// undo it.
import { useEffect, useSyncExternalStore } from "react";
import { apiBaseStore, apiRequest, sessionStore, type ApiResult, type Session } from "@/lib/api";
import { connectionStore, reportReachable, type ServerState } from "./connection";
import { dayStore, ensureToday, onDayEdit, updateDay, updateStored } from "./day";
import { adoptAnswer, buildRequest, hasUnsynced, isDayAnswer, isOlderAnswer, noteResult, setSyncEnabled, type StoredDay, type SyncResult } from "./dayModel";
import { accountKey, currentSession, ownerStore, personalOpen } from "./owner";

const PATH = "/api/me/day/sync";
const DEBOUNCE_MS = 2500;
const PERIOD_MS = 5 * 60 * 1000;
const RETRY_MS = [5000, 30000, PERIOD_MS];
/** A change made in another tab that still hasn't gone (that tab closed): sent from here. */
const OTHER_TAB_MS = 10_000;
const TIMEOUT_MS = 20_000;

// ---- whether a sync is on the wire in this tab (the Settings line) ---------------------

let syncing = false;
const busyListeners = new Set<() => void>();

function setSyncing(v: boolean) {
  if (syncing === v) return;
  syncing = v;
  busyListeners.forEach((l) => l());
}

const busyStore = {
  subscribe(l: () => void) {
    busyListeners.add(l);
    return () => {
      busyListeners.delete(l);
    };
  },
  get: () => syncing,
  getServer: () => false,
};

export function useDaySyncBusy(): boolean {
  return useSyncExternalStore(busyStore.subscribe, busyStore.get, busyStore.getServer);
}

// ---- the loop (one per tab) ---------------------------------------------------------------

let starts = 0;
let stops: (() => void)[] = [];
/** Whose day this tab syncs (owner.ts accountKey); null while nobody's may be synced. */
let account: string | null = null;
let busy = false;
/** Run once more when the request on the wire settles. */
let again = false;
let failures = 0;
/** The token a 401 came back for: nothing more until the session changes. */
let halted: string | null = null;
/** The server that answered 404 or refused the day (another 4xx): nothing more until the next start. */
let stoppedOn: string | null = null;
let debounceTimer = 0;
let nextTimer = 0;
let otherTimer = 0;
let startTimer = 0;
let editSeen = "";
let enabledSeen = true;
let serverSeen: ServerState = "unknown";

const visible = () => document.visibilityState !== "hidden";
const browserOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

function sessionAccount(): string | null {
  const s = currentSession();
  return s && personalOpen() ? accountKey(s) : null;
}

/** The answer for `acc` may still be taken: same account, it still owns the day, sync still on. */
const live = (acc: string) => starts > 0 && account === acc && personalOpen(acc) && dayStore.get().sync.enabled;

function clearTimers() {
  window.clearTimeout(debounceTimer);
  window.clearTimeout(nextTimer);
  window.clearTimeout(otherTimer);
  window.clearTimeout(startTimer);
  debounceTimer = nextTimer = otherTimer = startTimer = 0;
}

function reset() {
  clearTimers();
  failures = 0;
  halted = null;
  again = false;
}

function schedule(ms: number, fn: () => void = () => void run()) {
  window.clearTimeout(nextTimer);
  nextTimer = window.setTimeout(() => {
    nextTimer = 0;
    fn();
  }, ms);
}

// Every 5 minutes while visible, counted from the last sync of any tab.
function periodic() {
  const at = Date.parse(dayStore.get().sync.syncedAt ?? "");
  const wait = Number.isFinite(at) ? at + PERIOD_MS - Date.now() : 0;
  if (wait > 1000) schedule(wait, periodic);
  else void run();
}

/** How the last try went, noted in the stored day (every tab's Settings line reads it). */
function note(result: SyncResult, acc: string) {
  void updateStored(acc, (d, c) => noteResult(d, result, c));
}

/** A 4xx that sending the same day again can't change (408 and 429 are retried like a 5xx). */
const refused = (status: number) => status >= 400 && status < 500 && status !== 401 && status !== 404 && status !== 408 && status !== 429;

async function run(): Promise<void> {
  if (starts === 0) return;
  window.clearTimeout(debounceTimer);
  window.clearTimeout(otherTimer);
  window.clearTimeout(nextTimer);
  debounceTimer = otherTimer = nextTimer = 0;
  const acc = account;
  const s = currentSession();
  if (!acc || !s || accountKey(s) !== acc || !personalOpen(acc)) return;
  if (!dayStore.get().sync.enabled || halted === s.token || stoppedOn === s.base) return;
  if (busy) {
    again = true;
    return;
  }
  // The browser knows it's offline: no request until `online`.
  if (browserOffline()) {
    note("offline", acc);
    return;
  }
  busy = true;
  setSyncing(true);
  let answered = false;
  let retrying = false;
  try {
    ensureToday(); // an old save gets its stamps written before they are sent
    const sent = dayStore.get();
    const res = await apiRequest<unknown>(s.base, PATH, { method: "POST", body: buildRequest(sent), token: s.token, timeoutMs: TIMEOUT_MS });
    // Signed out, another account, or switched off meanwhile: not for the day we have now.
    if (live(acc)) {
      retrying = await settle(res, acc, s, sent);
      answered = res.status !== 0;
    }
  } finally {
    busy = false;
    setSyncing(false);
  }
  // Any answer means the server is there (after the adopt, so this can't start a second sync).
  if (answered) reportReachable();
  // After a failure the ladder decides when; never a tight loop.
  const more = again && !retrying;
  again = false;
  if (more) void run();
}

/** What one answer means for the loop (§8 "Receiving", "Failures"). True: the retry ladder decides what comes next. */
async function settle(res: ApiResult<unknown>, acc: string, s: Session, sent: StoredDay): Promise<boolean> {
  if (res.ok && isDayAnswer(res.data)) {
    failures = 0;
    const data = res.data;
    const outcome: { edited: boolean } = { edited: false };
    await updateStored(acc, (now, clock) => {
      if (!live(acc) || !now.sync.enabled) return null;
      if (now.sync.edit !== sent.sync.edit) {
        // Something changed here (or in another tab) while it was on the wire.
        outcome.edited = true;
        return null;
      }
      // Another tab took a newer answer for the same day meanwhile: this one adds nothing.
      if (now.sync.syncedAt !== sent.sync.syncedAt && isOlderAnswer(data, now)) return null;
      return adoptAnswer(now, data, clock, sent.sync.edit, acc)?.day ?? null;
    });
    if (outcome.edited) again = true;
    if (visible()) schedule(PERIOD_MS, periodic);
    return false;
  }
  if (res.status === 401) {
    if (currentSession()?.token === s.token) {
      // The session ended: nothing more until it changes (onSession). The
      // line says that signing in again resumes sync.
      halted = s.token;
      note("ended", acc);
    } else {
      // A late 401 for a token since replaced: the session held now goes next.
      again = true;
    }
    return false;
  }
  if (res.status === 404 || refused(res.status)) {
    stoppedOn = s.base;
    note(res.status === 404 ? "unsupported" : "stopped", acc);
    return false;
  }
  failures += 1;
  note(res.status === 0 ? "offline" : "error", acc);
  schedule(RETRY_MS[Math.min(failures, RETRY_MS.length) - 1]);
  return true;
}

/** A change still unsent when this tab stops syncing for the account (signing out): best effort, with that session, answer unused. */
function leave(acc: string) {
  const s = currentSession();
  if (starts === 0 || !s || accountKey(s) !== acc || halted === s.token || stoppedOn === s.base) return;
  const day = dayStore.get();
  if (!day.sync.enabled || !hasUnsynced(day) || browserOffline()) return;
  void apiRequest<unknown>(s.base, PATH, { method: "POST", body: buildRequest(day), token: s.token, timeoutMs: TIMEOUT_MS });
}

// Signed in or out, another account, the owner changed (here or in another
// tab), another server. The day belongs to the owner (owner.ts): another
// account's sign-in clears it, with its gen, before anything is synced as
// that account (localData.ts), so one person's day never reaches another's.
function onSession() {
  const next = sessionAccount();
  if (next !== account) {
    if (account) leave(account);
    reset();
    account = next;
    if (account) void run();
    return;
  }
  // The same account with a fresh token after a 401: try again.
  const s = currentSession();
  if (account && halted && s && s.token !== halted) {
    halted = null;
    void run();
  }
}

// Any write to the stored day, from this tab or another.
function onDayChange() {
  const d = dayStore.get();
  if (d.sync.enabled !== enabledSeen) {
    enabledSeen = d.sync.enabled;
    if (d.sync.enabled) {
      failures = 0;
      void run(); // on again: a first sync (setSyncEnabled forgot gen)
    } else {
      clearTimers();
    }
  }
  if (d.sync.edit !== editSeen) {
    editSeen = d.sync.edit;
    // Probably another tab's change: that tab sends it. onLocalEdit cancels
    // this right away when the change was made here.
    window.clearTimeout(otherTimer);
    otherTimer = window.setTimeout(() => {
      otherTimer = 0;
      if (hasUnsynced(dayStore.get())) void run();
    }, OTHER_TAB_MS);
  }
}

// A change made in this tab: sent 2.5 s after the last one.
function onLocalEdit() {
  window.clearTimeout(otherTimer);
  otherTimer = 0;
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = 0;
    void run();
  }, DEBOUNCE_MS);
}

function onVisibility() {
  if (visible()) {
    void run();
    return;
  }
  window.clearTimeout(nextTimer);
  nextTimer = 0;
  // A change made just before the tab went to the background goes now.
  if (debounceTimer) void run();
}

function onOnline() {
  void run();
}

// The server answering again after it couldn't be reached (another request
// noticed). Only a change from unreachable to ok counts: a route that keeps
// failing while the server answers stays on the retry ladder.
function onConnection() {
  const c = connectionStore.get();
  const back = c.online && c.server === "ok" && serverSeen === "unreachable";
  serverSeen = c.server;
  if (back && dayStore.get().sync.last?.result === "offline") void run();
}

/** Run the sync while the app is open (the shell starts it, never on the calming steps); returns the stop. */
export function startDaySync(): () => void {
  starts += 1;
  if (starts === 1) {
    const d = dayStore.get();
    editSeen = d.sync.edit;
    enabledSeen = d.sync.enabled;
    serverSeen = connectionStore.get().server;
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    stops = [
      sessionStore.subscribe(onSession),
      apiBaseStore.subscribe(onSession),
      ownerStore.subscribe(onSession),
      dayStore.subscribe(onDayChange),
      connectionStore.subscribe(onConnection),
      onDayEdit(onLocalEdit),
      () => {
        window.removeEventListener("online", onOnline);
        document.removeEventListener("visibilitychange", onVisibility);
      },
    ];
    // A moment later, so React's development double start (mount, unmount,
    // mount) sends one request, not two.
    startTimer = window.setTimeout(() => {
      startTimer = 0;
      onSession();
    }, 0);
  }
  return () => {
    starts -= 1;
    if (starts > 0) return;
    stops.forEach((stop) => stop());
    stops = [];
    reset();
    account = null;
  };
}

/** The shell mounts this once: the day syncs while `active` (every app page but the calming steps). */
export function useDaySync(active: boolean) {
  useEffect(() => (active ? startDaySync() : undefined), [active]);
}

/** "Keep my day in sync". On again counts as a first sync (the loop sees the switch and sends). */
export function setDaySyncEnabled(on: boolean): boolean {
  return updateDay((d) => setSyncEnabled(d, on));
}
