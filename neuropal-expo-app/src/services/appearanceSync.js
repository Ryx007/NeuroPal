// Keeps the user's appearance (skin, Signal settings, Pal, Home layout) in
// step with the backend so every device — this phone, the web app, the
// Flutter app — shows the same NeuroPal. Local-first: everything works with
// no backend at all; sync is best-effort and silent.
//
// Rules
//   • On start: pull the server copy. Newer than ours → adopt it. Ours newer
//     (or the server has none) → push ours.
//   • Any local change → debounced push (1.5 s); a change made while a PUT
//     is in flight is sent right after it, never dropped.
//   • The server answers 409 with its copy when ours is older → adopt it,
//     unless we edited again after the server's copy (then push again).
//   • Classic theme/accent edits made by older screens (Tweaks sheet,
//     Settings) change content without a new timestamp → stamp them first.
import { apiConfigured, subscribeApi } from "../store/ApiLink";
import { applyAppearance, selectAppearance } from "../store/appearance";
import { touchLook } from "../store/slices/lookSlice";
import { USE_MOCK, apiClient } from "./network";

const contentKey = (a) => JSON.stringify({ ...a, updatedAt: null });
const newer = (a, b) => Date.parse(a || "") > Date.parse(b || "");

let started = false;

export function startAppearanceSync(store) {
  if (started || USE_MOCK) return () => {};
  started = true;

  let prev = selectAppearance(store.getState());
  let lastKey = contentKey(prev);
  let lastAt = prev.updatedAt;
  let timer = null;
  let inFlight = false;
  let pending = false; // a change arrived while a PUT was on the wire
  let conflicts = 0; // consecutive 409s answered by re-pushing
  let adopting = false;

  // Adopting dispatches three actions (theme, accent, look); the half-applied
  // states in between must not look like local edits, or the server's own
  // copy would be pushed straight back to it.
  const adopt = (server) => {
    adopting = true;
    try {
      store.dispatch(applyAppearance(server, { adopt: true }));
    } finally {
      adopting = false;
    }
    prev = selectAppearance(store.getState());
    lastKey = contentKey(prev);
    lastAt = prev.updatedAt;
  };

  async function push() {
    if (!apiConfigured) return;
    if (inFlight) {
      // Never drop an edit: send it as soon as the current PUT settles.
      pending = true;
      return;
    }
    inFlight = true;
    const sent = selectAppearance(store.getState());
    try {
      const { data } = await apiClient.put("me/appearance", { appearance: sent }, { timeout: 15000 });
      conflicts = 0;
      // The server clamps a fast clock's stamp. If nothing changed locally
      // since, take its stamp so the next pull doesn't push the same look.
      const saved = data?.appearance;
      const local = selectAppearance(store.getState());
      if (saved && saved.updatedAt !== local.updatedAt && contentKey(saved) === contentKey(local)) adopt(saved);
    } catch (error) {
      const server = error?.response?.status === 409 ? error.response.data?.appearance : null;
      if (server) {
        // Last write wins by edit time in both directions: a local edit made
        // after the server's copy goes up again (at most twice in a row);
        // otherwise the server's copy is adopted.
        const local = selectAppearance(store.getState());
        const localWins = local.updatedAt && newer(local.updatedAt, server.updatedAt) && contentKey(local) !== contentKey(server);
        if (localWins && conflicts < 2) {
          conflicts += 1;
          pending = true;
        } else {
          conflicts = 0;
          adopt(server);
        }
      }
      // Anything else (offline, old backend without the route) — keep the
      // local copy; the next change or reconnect tries again.
    } finally {
      inFlight = false;
      if (pending) {
        pending = false;
        push();
      }
    }
  }

  async function pull() {
    if (!apiConfigured) return;
    try {
      const { data } = await apiClient.get("me/appearance", { timeout: 15000 });
      const server = data?.appearance;
      const local = selectAppearance(store.getState());
      if (server && (!local.updatedAt || newer(server.updatedAt, local.updatedAt))) {
        adopt(server);
      } else if (local.updatedAt && (!server || newer(local.updatedAt, server.updatedAt))) {
        push();
      }
    } catch (error) {
      // offline / older backend — stay local
    }
  }

  const unsubscribeStore = store.subscribe(() => {
    if (adopting) return;
    const a = selectAppearance(store.getState());
    if (a === prev) return;
    prev = a;
    const key = contentKey(a);
    if (key === lastKey) return;
    if (a.updatedAt === lastAt) {
      // Content changed but nobody stamped it (a legacy theme/accent edit).
      store.dispatch(touchLook());
      return;
    }
    lastKey = key;
    lastAt = a.updatedAt;
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, 1500);
  });

  // Reconnects (or the probe switching hosts) are a good moment to
  // reconcile: pull whenever the backend comes back ('ok' after anything
  // else) — not on every probe round.
  let lastState = null;
  const unsubscribeApi = subscribeApi((status) => {
    const state = status?.state;
    if (state === "ok" && lastState !== "ok") pull();
    lastState = state;
  });
  pull();

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribeStore();
    unsubscribeApi?.();
    started = false;
  };
}
