// The non-React half of the app-side widget bridge; useWidgetBridge.android.js
// wires it to the component lifecycle. Android only (imports render.js).

import { middleOfState } from "../components/home/stateScale";
import { recordCheckin, setNervousState } from "../store/slices/homeSlice";
import { buildSnapshot, latestCheckin, snapshotKey } from "./model";
import { refreshPalWidgets } from "./render";
import { getLinkKey, readSnapshot, takeCheckins, writeSnapshot } from "./storage";

// Flushes run one at a time (module-wide, even across remounts) and read the
// store when they start, so the last one to finish wrote the latest state.
let flushChain = Promise.resolve();

/**
 * @param {object} p
 *   store       the Redux store (getState / dispatch)
 *   getPalette  () => the resolved palette (ThemeProvider), read at flush time
 */
export function createWidgetBridge({ store, getPalette }) {
  let hint = null; // last widget check-in applied: {state, at}
  let lastKey = ""; // last snapshot written (minus updatedAt)

  async function flush({ forceRefresh = false } = {}) {
    const { home, look } = store.getState();
    const now = new Date();
    const state = home.nervousState;
    let stateAt = null;
    if (state) {
      if (hint && hint.state === state) {
        stateAt = hint.at; // applied from a widget check-in: keep its time
      } else {
        hint = null;
        const prev = await readSnapshot();
        stateAt = prev && prev.state === state && prev.stateAt ? prev.stateAt : now.toISOString();
      }
    }
    const linkKey = await getLinkKey().catch(() => null);
    const snapshot = buildSnapshot({ home, look, palette: getPalette(), stateAt, now, linkKey });
    const key = snapshotKey(snapshot);
    if (key === lastKey) {
      if (forceRefresh) await refreshPalWidgets();
      return;
    }
    await writeSnapshot(snapshot);
    lastKey = key;
    await refreshPalWidgets({ snapshot });
  }

  // Write the snapshot (if anything changed) and redraw the widgets.
  function queueFlush(options) {
    flushChain = flushChain
      .then(() => flush(options))
      .catch((e) => {
        // Widget missing from this build, storage full… the app carries on.
        if (typeof __DEV__ !== "undefined" && __DEV__) console.warn("[widget] snapshot not written:", e?.message || e);
      });
    return flushChain;
  }

  // Apply check-ins tapped on the widget: the latest one becomes the state —
  // unless the app has a newer check-in of its own, which wins (the widget
  // tap then only joins the history, in time order).
  async function consumeCheckins() {
    const latest = latestCheckin(await takeCheckins());
    if (!latest) return;
    const history = store.getState().home.checkins || [];
    const last = history.length ? Date.parse(history[history.length - 1].at) : NaN;
    const newer = !Number.isFinite(last) || Date.parse(latest.at) > last;
    // The same as a tap on Home: into the check-in history (at the time it
    // was tapped), the slider to that state's middle, then the usual action.
    store.dispatch(recordCheckin({ state: latest.state, level: middleOfState(latest.state), at: latest.at }));
    if (!newer) return;
    hint = latest;
    store.dispatch(setNervousState(latest.state));
    // Write straight away: the pending list is gone, so until the snapshot
    // carries the new state the widget would show the old one.
    await queueFlush();
  }

  return { queueFlush, consumeCheckins };
}
