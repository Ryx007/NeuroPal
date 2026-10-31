// The look follows the account, both ways, by the rules of the native and
// Expo apps (GET/PUT /api/me/appearance, docs/BRAIN.md §4):
//   - a session starts (a sign-in, or a load with one): the server's copy is
//     taken when it is newer by updatedAt, or when this browser's copy was
//     never changed; otherwise this browser's copy goes up
//   - every look change while signed in goes up about a second later
//   - 409 (the server holds a newer copy): that copy is taken
//   - offline, or a server without the route: this browser's copy stays and
//     goes up on the next load, or as soon as the server answers again
// Pal's settings (name, talk style, voice) are part of the look, so they
// travel with it. What goes up is `lookForServer` (appearanceStore.ts, the
// same rule as the studio's Save): what only the apps edit (the Home layout,
// Pal's shape, colour and face) is kept from the server's copy.
import { apiBaseStore, getAppearance, putAppearance, sessionStore, type Session } from "@/lib/api";
import { normalizeAppearance, type Appearance } from "@/lib/appearance";
import { adoptAppearance, appearanceStore, lookForServer, sameLookContent } from "@/lib/appearanceStore";
import { connectionStore } from "./connection";
import { onForget } from "./localData";
import { accountKey, currentSession, ownerStore, personalOpen } from "./owner";

const PUSH_AFTER_MS = 1000;

const newer = (a: string | null | undefined, b: string | null | undefined) => Date.parse(a || "") > Date.parse(b || "");

function readCopy(data: unknown): Appearance | null {
  const a = (data as { appearance?: unknown } | null)?.appearance;
  return a && typeof a === "object" ? normalizeAppearance(a) : null;
}

/** The account the state below belongs to (owner.ts `accountKey`), null when nobody's signed in. */
let account: string | null = null;
/** The copy last seen on the server for `account`. */
let base: Appearance | null = null;
let reconciled = false;
let timer = 0;
let busy = false;
let again = false;
/** The last sync didn't finish (offline, or the server didn't answer well). */
let retry = false;
let adopting = false;

const live = (acc: string) => account === acc && personalOpen(acc);

function take(copy: Appearance) {
  base = copy;
  adopting = true;
  try {
    adoptAppearance(copy);
  } finally {
    adopting = false;
  }
}

async function syncOnce(acc: string) {
  const s = currentSession();
  if (!s || !live(acc)) return;
  const got = await getAppearance(s.base, s.token);
  if (!live(acc)) return;
  if (!got.ok) {
    // Offline, or an older server: keep this copy; try again later.
    retry = true;
    return;
  }
  const remote = readCopy(got.data);
  const local = appearanceStore.get();
  if (remote && (!local.updatedAt || newer(remote.updatedAt, local.updatedAt))) {
    take(remote);
    retry = false;
    return;
  }
  if (!local.updatedAt) {
    // Never changed here, and nothing newer on the server: nothing to send.
    base = remote;
    retry = false;
    return;
  }
  const body = lookForServer(local, remote, base);
  if (remote && sameLookContent(body, remote)) {
    take(remote);
    retry = false;
    return;
  }
  const put = await putAppearance(s.base, s.token, body);
  if (!live(acc)) return;
  const untouched = appearanceStore.get() === local;
  if (put.ok) {
    retry = false;
    const saved = readCopy(put.data) ?? body;
    if (untouched) take(saved);
    else {
      base = saved;
      again = true; // changed again meanwhile: that goes up next
    }
  } else if (put.status === 409 && readCopy(put.data)) {
    const stored = readCopy(put.data) as Appearance;
    retry = false;
    if (untouched) take(stored);
    else {
      base = stored;
      again = true;
    }
  } else {
    retry = true;
  }
}

async function sync(acc: string) {
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    do {
      again = false;
      await syncOnce(acc);
    } while (again && live(acc));
  } finally {
    busy = false;
  }
  // Another account signed in while this one was syncing: its turn now.
  if (again && account && account !== acc) {
    again = false;
    void sync(account);
  }
}

/** A change made just before the session ends still goes up (best effort, with that session). */
function flush(s: Session | null) {
  const pending = timer !== 0;
  window.clearTimeout(timer);
  timer = 0;
  if (!pending || !s || !account || accountKey(s) !== account) return;
  const local = appearanceStore.get();
  const was = base;
  void getAppearance(s.base, s.token).then((got) => {
    const remote = got.ok ? readCopy(got.data) : null;
    if (got.ok && !(remote && newer(remote.updatedAt, local.updatedAt))) void putAppearance(s.base, s.token, lookForServer(local, remote, was));
  });
}

function reset() {
  window.clearTimeout(timer);
  timer = 0;
  account = null;
  base = null;
  reconciled = false;
  retry = false;
  again = false;
}

function onSession() {
  const s = currentSession();
  const now = s && personalOpen() ? accountKey(s) : null;
  if (now !== account) {
    flush(s);
    reset();
    account = now;
  }
  if (account && !reconciled) {
    reconciled = true;
    void sync(account);
  }
}

function onLook() {
  if (adopting || !account || !live(account)) return;
  const local = appearanceStore.get();
  if (base && sameLookContent(local, base)) return;
  const acc = account;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = 0;
    void sync(acc);
  }, PUSH_AFTER_MS);
}

function onConnection() {
  const c = connectionStore.get();
  if (retry && account && c.online && c.server === "ok") {
    retry = false;
    void sync(account);
  }
}

onForget(() => {
  flush(currentSession());
  reset();
});

let starts = 0;
let stops: (() => void)[] = [];

/**
 * Run the sync while the app is open (the shell starts it); returns the
 * stop. A change still waiting at the stop goes up when it starts again:
 * the first sync of a start sends this browser's newer copy.
 */
export function startLookSync(): () => void {
  starts += 1;
  if (starts === 1) {
    stops = [
      sessionStore.subscribe(onSession),
      apiBaseStore.subscribe(onSession),
      ownerStore.subscribe(onSession),
      appearanceStore.subscribe(onLook),
      connectionStore.subscribe(onConnection),
    ];
    onSession();
  }
  return () => {
    starts -= 1;
    if (starts > 0) return;
    stops.forEach((stop) => stop());
    stops = [];
    reset();
  };
}
