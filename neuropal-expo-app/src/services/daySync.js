// Keeps the day — check-ins, anchors, the minimum viable day, to-dos and
// Pal's brain dump — in step with the server, so a check-in on the phone
// shows up in the web app and an anchor edited on the laptop reaches the
// phone (docs/DAY-SYNC.md §8). Local-first, like appearanceSync.js:
// everything works with no server, signed out, offline or with "Keep my day
// in sync" off. Sync never interrupts: the only place a problem shows is the
// line under the Settings switch (getDaySyncStatus).
//
// One request does everything: POST /api/me/day/sync sends every item we
// have (tombstones included) and answers with the merged day, which replaces
// ours (dayModel.adoptHome / adoptDump) — unless something changed here
// while it was on the wire; then the answer is dropped and we send again.
//
// When: at start and sign-in, on coming to the foreground (on the web: the
// tab becoming visible), 2.5 s after the last local change, when the server
// is reachable again, and every 5 minutes while in front.
// Failures: offline, 5xx, 408 or 429 → retry after 5 s, 30 s, then every 5
// minutes. 401 → the session ended: stop until another session is stored or
// someone signs in again — but only when the 401 answers the session held
// now (a late 401 for an old token stops nothing), and without signing
// anyone out (network.js leaves that to the next ordinary request). 404 →
// this server has no day sync; any other 4xx → it refused the day: stop
// until the next start (or another server).

import { AppState } from "react-native";

import { apiConfigured, apiHost, getApiStatus, subscribeApi } from "../store/ApiLink";
import { adoptDay, refreshDay, resetDay, setDayOwner, setNervousState } from "../store/slices/homeSlice";
import { buildSyncBody, isDayBody, localDate, newestCheckinMs, ownerStep } from "./dayModel";
import { USE_MOCK, syncDayApi } from "./network";

const DEBOUNCE_MS = 2500;
const PERIOD_MS = 5 * 60 * 1000;
const RETRY_MS = [5000, 30000, PERIOD_MS];

// ---- what Settings shows -------------------------------------------------------
// phase: idle | syncing | ok | offline | off | waiting | signed-out |
//        ended (a 401: sign in again) | unavailable (no day sync on this
//        server) | stopped (the server refused the day) | demo | unconfigured
let status = { phase: "idle" };
const listeners = new Set();

export function getDaySyncStatus() {
  return status;
}

export function subscribeDaySync(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setPhase(phase) {
  if (status.phase === phase) return;
  status = { phase };
  listeners.forEach((fn) => {
    try {
      fn(status);
    } catch (e) {
      // one broken listener must not stop the others
    }
  });
}

// The account signed in now. Null while signed out, and while the app was
// opened offline and the server hasn't said yet who this is.
function accountOf(state) {
  const auth = state.auth || {};
  return auth.loggedIn === true && auth.userId ? String(auth.userId) : null;
}

const authKeyOf = (state) => `${state.auth?.loggedIn}|${state.auth?.userId || ""}`;

// A local change = a new reference for anything that syncs.
function syncedRefs(state) {
  const { home, pal } = state;
  return [home.tasks, home.anchors, home.todos, home.checkins, home.sync.gone, pal.dump, pal.dumpGone];
}
const sameRefs = (a, b) => a.every((x, i) => x === b[i]);

// The server that answered 404 (phase "unavailable") or another 4xx
// ("stopped"), as { host, phase }: nothing more is sent to it until the next
// start.
let refusedBy = null;
let started = false;

// Does a 401 answer the session held now? Only the network layer knows which
// token went out (network.js syncDayApi); without its word, assume it does.
async function answersCurrentSession(error) {
  const check = error && error.isCurrentSession;
  if (typeof check !== "function") return true;
  try {
    return (await check()) !== false;
  } catch (e) {
    return true;
  }
}

export function startDaySync(store) {
  if (started) return () => {};
  started = true;
  if (USE_MOCK || !apiConfigured) {
    setPhase(USE_MOCK ? "demo" : "unconfigured");
    return () => {
      started = false;
    };
  }

  let refs = syncedRefs(store.getState());
  let authKey = authKeyOf(store.getState());
  let enabled = store.getState().home.sync.enabled;
  let changeSeq = 0; // bumped by every local change
  let authEpoch = 0; // bumped by every sign-in, sign-out or change of account
  let inFlight = false;
  let again = false; // run once more when the current request settles
  // The 401 that ended the session ({ error }), or null. Sync waits until
  // another session is stored (checkHalt) or the auth state changes.
  let halt = null;
  let haltChecking = false;
  let failures = 0;
  let debounceTimer = null;
  let nextTimer = null;
  let quiet = false; // our own dispatches (adopt, whose day) are not local changes
  let foreground = AppState.currentState !== "background";
  let stopped = false;

  const clearTimers = () => {
    clearTimeout(debounceTimer);
    clearTimeout(nextTimer);
    debounceTimer = null;
    nextTimer = null;
  };

  const schedule = (ms) => {
    clearTimeout(nextTimer);
    nextTimer = setTimeout(() => {
      nextTimer = null;
      run();
    }, ms);
  };

  const quietly = (fn) => {
    quiet = true;
    try {
      fn();
    } finally {
      quiet = false;
      refs = syncedRefs(store.getState());
    }
  };

  // Why we can't sync right now, or null when we can.
  function blockedPhase() {
    const st = store.getState();
    if (!st.home.sync.enabled) return "off";
    if (refusedBy !== null && refusedBy.host === apiHost) return refusedBy.phase;
    if (!accountOf(st)) return st.auth?.loggedIn === true ? "waiting" : "signed-out";
    if (halt) return "ended";
    return null;
  }

  const retryLater = () => {
    failures += 1;
    schedule(RETRY_MS[Math.min(failures, RETRY_MS.length) - 1]);
  };

  // `epoch`: the auth state the request went out under.
  async function failed(error, epoch) {
    const code = error && error.response ? error.response.status : 0;
    if (code === 401) {
      const current = epoch === authEpoch && (await answersCurrentSession(error));
      if (stopped) return;
      if (current && epoch === authEpoch) {
        // The session ended. Nobody is signed out from here: a background
        // sync never interrupts, and the next ordinary request does it.
        halt = { error };
        clearTimers();
        setPhase("ended");
        return;
      }
      // A late 401 for a session already replaced (signed out and in again,
      // a new password): it says nothing about the session held now, which
      // the next try carries.
      retryLater();
      return;
    }
    if (code === 404 || (code >= 400 && code < 500 && code !== 408 && code !== 429)) {
      // 404: this server has no day sync. Any other 4xx: it refused the day
      // (too big, say), and sending the same again can't help.
      refusedBy = { host: apiHost, phase: code === 404 ? "unavailable" : "stopped" };
      clearTimers();
      setPhase(refusedBy.phase);
      return;
    }
    // No re-probe from here (recheckApi): a failed probe raises the app-wide
    // "Backend unreachable" banner, which announces itself, and a background
    // sync must never interrupt anyone. The ladder and the triggers below
    // are enough to notice the server coming back.
    setPhase("offline");
    retryLater();
  }

  // Halted: has another session been stored since that 401 (a new password
  // brings one without any change to the auth state)? Then sync goes on.
  // Asked again on every trigger while halted.
  function checkHalt() {
    const h = halt;
    if (!h || haltChecking) return;
    haltChecking = true;
    answersCurrentSession(h.error).then((current) => {
      haltChecking = false;
      if (current || stopped || halt !== h) return;
      halt = null;
      run();
    });
  }

  async function run() {
    if (stopped) return;
    const blocked = blockedPhase();
    if (blocked) {
      clearTimers();
      setPhase(blocked);
      if (blocked === "ended") checkHalt();
      return;
    }
    if (inFlight) {
      again = true;
      return;
    }
    clearTimers();
    inFlight = true;
    const epoch = authEpoch;
    let ok = true;
    try {
      // Whose day is it (§8)? Never send one account's day as another's.
      const account = accountOf(store.getState());
      const step = ownerStep(store.getState().home.sync.owner, account);
      if (step === "reset") quietly(() => store.dispatch(resetDay(account)));
      else if (step === "join") quietly(() => store.dispatch(setDayOwner(account)));

      const st = store.getState();
      const body = buildSyncBody(st.home, st.pal);
      const sentSeq = changeSeq;
      const newestBefore = newestCheckinMs(st.home.checkins);
      if (status.phase !== "ok" && status.phase !== "offline") setPhase("syncing");

      const data = await syncDayApi(body);
      if (stopped) return;
      const now = store.getState();
      // Signed out, another account, or switched off meanwhile: this answer
      // isn't for the day we have now.
      if (accountOf(now) !== account || !now.home.sync.enabled) {
        again = true;
        return;
      }
      // Something changed here while the request was out: drop the answer
      // and send again (§8 "Receiving").
      if (changeSeq !== sentSeq) {
        again = true;
        return;
      }
      if (!isDayBody(data)) throw new Error("The server's answer wasn't a day");
      quietly(() => {
        store.dispatch(adoptDay(data));
        // A newer check-in from another device: adoptDay moved Home's state
        // and level to it; the usual action follows, as on Home.
        const home = store.getState().home;
        if (newestCheckinMs(home.checkins) > newestBefore && home.nervousState) {
          store.dispatch(setNervousState(home.nervousState));
        }
      });
      failures = 0;
      setPhase("ok");
      if (foreground) schedule(PERIOD_MS);
    } catch (error) {
      ok = false;
      if (!stopped) await failed(error, epoch);
    } finally {
      inFlight = false;
      // After a failure the retry ladder decides when; never a tight loop.
      const more = again && ok && !stopped;
      again = false;
      if (more) run();
    }
  }

  const unsubscribeStore = store.subscribe(() => {
    const st = store.getState();
    // Local changes first, from this very state: run() below may dispatch
    // (quietly) and move `refs` on, which must not read as a change.
    if (!quiet) {
      const next = syncedRefs(st);
      if (!sameRefs(next, refs)) {
        refs = next;
        changeSeq += 1;
        if (st.home.sync.enabled) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            run();
          }, DEBOUNCE_MS);
        }
      }
    }
    const key = authKeyOf(st);
    const switched = st.home.sync.enabled !== enabled;
    enabled = st.home.sync.enabled;
    if (key !== authKey) {
      // Signed in, signed out, or another account: start over. A 401 still
      // on its way answers the session before this one (failed → epoch).
      authKey = key;
      authEpoch += 1;
      halt = null;
      run();
    } else if (switched) {
      // On: a first sync (the slice forgot gen). Off: the line says so.
      run();
    }
  });

  const appStateSub = AppState.addEventListener("change", (next) => {
    if (next === "active") {
      foreground = true;
      run();
    } else if (next === "background") {
      foreground = false;
      clearTimeout(nextTimer);
      nextTimer = null;
      // A change made just before leaving goes now, not at the next return.
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        run();
      }
    }
  });

  // The connection coming back (down → ok), or the probe moving to another
  // address. A probe that only re-confirms "ok" (other features ask for one
  // after a failed request) is not a reconnect: a route that keeps failing
  // while /healthz answers must stay on the retry ladder, never in a loop.
  let settled = getApiStatus().state;
  let host = apiHost;
  const unsubscribeApi = subscribeApi((s) => {
    if (s.state === "checking") return;
    const back = s.state === "ok" && (settled === "down" || s.host !== host);
    settled = s.state;
    host = s.host;
    if (back) run();
  });

  // Browsers say when the network returns.
  const onOnline = () => run();
  const win = typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null;
  if (win) win.addEventListener("online", onOnline);

  run();

  return () => {
    stopped = true;
    clearTimers();
    unsubscribeStore();
    appStateSub.remove();
    unsubscribeApi();
    if (win) win.removeEventListener("online", onOnline);
    started = false;
  };
}

// "Done today" means doneOn === the local date, so when the date changes
// while the app is open, task.done and anchor.status are derived again
// (signed in or not, sync on or off).
export function startDayClock(store) {
  const check = () => {
    if (store.getState().home.dayStamp !== localDate()) store.dispatch(refreshDay());
  };
  check();
  const timer = setInterval(check, 60 * 1000);
  const sub = AppState.addEventListener("change", (next) => {
    if (next === "active") check();
  });
  return () => {
    clearInterval(timer);
    sub.remove();
  };
}
