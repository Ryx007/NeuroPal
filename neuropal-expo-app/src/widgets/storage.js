// AsyncStorage access for the widget data contract (constants.js).
//
// The widget's headless task and the app run in the SAME JavaScript runtime
// (react-native-android-widget starts headless tasks on the app's ReactHost),
// so a promise-chain lock in this module is enough to make the check-in
// read-modify-write atomic between the two: a tap on the widget can never be
// lost while the app is consuming the list.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { CHECKINS_KEY, LINK_KEY_STORAGE, SNAPSHOT_KEY } from "./constants.js";
import { appendCheckin, parseCheckins, parseSnapshot } from "./model.js";

let chain = Promise.resolve();
function withLock(task) {
  const run = chain.then(task);
  chain = run.catch(() => {});
  return run;
}

export async function readSnapshot() {
  try {
    return parseSnapshot(await AsyncStorage.getItem(SNAPSHOT_KEY));
  } catch {
    return null;
  }
}

export async function writeSnapshot(snapshot) {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function readCheckins() {
  try {
    return parseCheckins(await AsyncStorage.getItem(CHECKINS_KEY));
  } catch {
    return [];
  }
}

// Widget side: record a tap. Resolves to the full pending list.
export function recordCheckin(state, at = new Date().toISOString()) {
  return withLock(async () => {
    const next = appendCheckin(await readCheckins(), state, at);
    await AsyncStorage.setItem(CHECKINS_KEY, JSON.stringify(next));
    return next;
  });
}

// App side: take every pending check-in and clear the key.
export function takeCheckins() {
  return withLock(async () => {
    const list = await readCheckins();
    if (list.length) await AsyncStorage.removeItem(CHECKINS_KEY);
    return list;
  });
}

// Same-runtime fast path: when the app is alive in the background, the
// widget's headless task tells the bridge right away instead of waiting for
// the next time the app comes to the foreground.
const listeners = new Set();
export function onWidgetCheckin(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function notifyWidgetCheckin() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // a listener's failure must not break the widget task
    }
  });
}

// The secret the widget's "Overwhelmed" link carries (constants.js). Made
// once, kept in the app's private storage; other apps can't read it.
let linkKeyPromise = null;
function randomHex32() {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  let out = "";
  while (out.length < 32) out += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  return out.slice(0, 32);
}
export function getLinkKey() {
  if (!linkKeyPromise) {
    linkKeyPromise = (async () => {
      const stored = await AsyncStorage.getItem(LINK_KEY_STORAGE);
      if (stored && /^[a-f0-9]{32}$/.test(stored)) return stored;
      const fresh = randomHex32();
      await AsyncStorage.setItem(LINK_KEY_STORAGE, fresh);
      return fresh;
    })().catch((e) => {
      linkKeyPromise = null;
      throw e;
    });
  }
  return linkKeyPromise;
}
