// Keeps the user's appearance (skin, Signal settings, Pal, Home layout) in
// step with the backend so every device — this phone, the web app, the
// Flutter app — shows the same NeuroPal. Local-first: everything works with
// no backend at all; sync is best-effort and silent.
//
// Rules
//   • On start: pull the server copy. Newer than ours → adopt it. Ours newer
//     (or the server has none) → push ours.
//   • Any local change → debounced push (1.5 s).
//   • The server answers 409 with its copy when ours is older → adopt it.
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
    if (!apiConfigured || inFlight) return;
    inFlight = true;
    const appearance = selectAppearance(store.getState());
    try {
      await apiClient.put("me/appearance", { appearance }, { timeout: 15000 });
    } catch (error) {
      const server = error?.response?.status === 409 ? error.response.data?.appearance : null;
      if (server) adopt(server);
      // Anything else (offline, old backend without the route) — keep the
      // local copy; the next change or reconnect tries again.
    } finally {
      inFlight = false;
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
