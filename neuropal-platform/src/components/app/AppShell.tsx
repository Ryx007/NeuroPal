"use client";

// The web app's frame. Wide screens: a sidebar (Home, Library, Pal, Settings,
// the calming steps set apart, the signed-in account at the bottom). Narrow
// screens: a bottom bar. The calming steps are always one click away and work
// signed out. Also here, for every page: the sign-in gate, a quiet notice when
// the browser is offline or the server can't be reached, keyboard shortcuts
// (with a "?" list and an off switch), the screen-reader announcer, the
// "Sit with me" watcher, and the session check that keeps the token fresh.
// The signed-in account's personal things (lib/neuropal/localData.ts) show
// only once they are that account's, and the look follows the account
// (lib/neuropal/lookSync.ts).
// The bottom bar's height is published on <html> as --np-app-bottom-bar
// (0px on wide screens) so docked players and sheets can sit above it.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Backdrop } from "@/components/Backdrop";
import { useAppearance } from "@/components/AppearanceProvider";
import { hostOf } from "@/lib/api";
import { refreshSession } from "@/lib/neuropal/account";
import { currentSession } from "@/lib/neuropal/client";
import { checkServer, useConnection } from "@/lib/neuropal/connection";
import { claimLocalData } from "@/lib/neuropal/localData";
import { normalizePal, palSay } from "@/lib/neuropal/look";
import { startLookSync } from "@/lib/neuropal/lookSync";
import { tickSit, useSit } from "@/lib/neuropal/palState";
import { setPrefs, usePrefs } from "@/lib/neuropal/prefs";
import { displayName, useAppSession, useLocalData } from "@/lib/neuropal/session";
import { announce } from "./common/announce";
import { Announcer } from "./common/Announcer";
import { BOTTOM_BAR_VAR, rememberPath, ROUTES, SHORTCUTS_EVENT } from "./common/appNav";
import { Kbd, Switch } from "./common/bits";
import { Dialog } from "./common/Dialog";
import { CloudOffIcon, HomeIcon, KeyboardIcon, LeafIcon, LibraryIcon, PalIcon, RefreshIcon, SettingsIcon } from "./common/icons";
import { SignIn } from "./common/SignIn";
import styles from "./shell.module.css";

const NAV = [
  { href: ROUTES.home, label: "Home", key: "h", Icon: HomeIcon },
  { href: ROUTES.library, label: "Library", key: "l", Icon: LibraryIcon },
  { href: ROUTES.pal, label: "Pal", key: "p", Icon: PalIcon },
  { href: ROUTES.settings, label: "Settings", key: "s", Icon: SettingsIcon },
] as const;

const GO_KEYS: Record<string, string> = { h: ROUTES.home, l: ROUTES.library, p: ROUTES.pal, s: ROUTES.settings };

/** Where the sidebar becomes the bottom bar: keep in step with shell.module.css. */
const BAR_QUERY = "(max-width: 839px)";

const norm = (p: string) => p.replace(/\/+$/, "") || "/";

// One session check per token (a refreshed token is a new one).
let lastChecked: string | null = null;

export function AppShell({ children }: { children: ReactNode }) {
  const path = norm(usePathname() || "/app");
  const router = useRouter();
  const { ready, signedIn, user, base, local, account } = useAppSession();
  const localData = useLocalData(account);
  const prefs = usePrefs();
  const [helpOpen, setHelpOpen] = useState(false);
  const [goPending, setGoPending] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const calm = path === norm(ROUTES.calm);
  const gate = ready && !signedIn && !calm;

  // The look follows the signed-in account, both ways. Never on the calming
  // steps (no network there); a change still waiting goes up on the next page.
  useEffect(() => (calm ? undefined : startLookSync()), [calm]);

  // Publish the bottom bar's height (before paint, and again whenever it
  // changes: a rotation, larger text, the safe area) for anything docked
  // to the bottom of the window.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const narrow = window.matchMedia(BAR_QUERY);
    const publish = () => {
      const h = narrow.matches ? Math.ceil(nav.getBoundingClientRect().height) : 0;
      root.style.setProperty(BOTTOM_BAR_VAR, `${h}px`);
    };
    publish();
    const watch = new ResizeObserver(publish);
    watch.observe(nav);
    narrow.addEventListener("change", publish);
    return () => {
      watch.disconnect();
      narrow.removeEventListener("change", publish);
      root.style.removeProperty(BOTTOM_BAR_VAR);
    };
  }, []);

  // Remember the route (the calming steps go back to it).
  useEffect(() => {
    rememberPath(path);
  }, [path]);

  // Ask the server who we are once per token: fresher details, a refreshed
  // token when it's due, and a 401 ends a session that was signed out
  // elsewhere. Never on the calming steps (no network there).
  useEffect(() => {
    if (!signedIn || calm) return;
    const token = currentSession()?.token ?? null;
    if (!token || token === lastChecked) return;
    lastChecked = token;
    refreshSession().catch(() => undefined);
  }, [signedIn, calm]);

  // Signed out on an app page: the tab says so too. Next sets each page's
  // title (also after this runs), so the title is held while signed out and
  // the page's own comes back after signing in.
  useEffect(() => {
    if (!gate) return;
    const want = "Sign in · NeuroPal";
    let pageTitle: string | null = null;
    const hold = () => {
      if (document.title === want) return;
      pageTitle = document.title;
      document.title = want;
    };
    hold();
    const watch = new MutationObserver(hold);
    watch.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      watch.disconnect();
      if (pageTitle) document.title = pageTitle;
    };
  }, [gate]);

  // Settings › Keyboard can open the list too.
  useEffect(() => {
    const open = () => setHelpOpen(true);
    window.addEventListener(SHORTCUTS_EVENT, open);
    return () => window.removeEventListener(SHORTCUTS_EVENT, open);
  }, []);

  // Keyboard shortcuts: g then h/l/p/s, c for the calming steps, ? for the
  // list. Never while typing, with a modifier held, or inside a dialog.
  useEffect(() => {
    if (!prefs.shortcuts) return;
    let pending = 0;
    let hintTimer = 0;
    const clearPending = () => {
      pending = 0;
      window.clearTimeout(hintTimer);
      setGoPending(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      if (e.key === "?") {
        e.preventDefault();
        clearPending();
        setHelpOpen(true);
        return;
      }
      if (pending && Date.now() - pending < 1500 && GO_KEYS[k]) {
        e.preventDefault();
        clearPending();
        router.push(GO_KEYS[k]);
        return;
      }
      if (e.shiftKey) return;
      if (k === "g") {
        pending = Date.now();
        setGoPending(true);
        window.clearTimeout(hintTimer);
        hintTimer = window.setTimeout(clearPending, 1500);
        return;
      }
      clearPending();
      if (k === "c") {
        e.preventDefault();
        router.push(ROUTES.calm);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(hintTimer);
    };
  }, [prefs.shortcuts, router]);

  const name = displayName(user);
  const who = name || user?.email || (local ? "Single-user server" : "Signed in");

  return (
    <div className={styles.shell}>
      <a className="np-skip" href="#app-main">
        Skip to content
      </a>
      <Backdrop />
      <nav ref={navRef} aria-label="App" className={styles.sidebar}>
        <Link href={ROUTES.home} className={styles.brand}>
          <span className="np-led" aria-hidden="true" />
          <span className={styles.brandText}>NeuroPal</span>
        </Link>
        <ul className={styles.navList}>
          {NAV.map(({ href, label, key, Icon }) => {
            const target = norm(href);
            const active = path === target || (target === norm(ROUTES.library) && path === "/app/read");
            return (
              <li key={href}>
                <Link href={href} className={styles.navLink} aria-current={active ? "page" : undefined}>
                  <Icon />
                  <span className={styles.navText}>{label}</span>
                  {prefs.shortcuts ? (
                    <span className={styles.hint} aria-hidden="true">
                      <Kbd>g</Kbd>
                      <Kbd>{key}</Kbd>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
          <li className={styles.calmItem}>
            <Link href={ROUTES.calm} className={styles.calmLink} aria-current={calm ? "page" : undefined}>
              <span className={styles.calmIcon} aria-hidden="true">
                <LeafIcon />
              </span>
              <span className={styles.navText}>Calming steps</span>
              {prefs.shortcuts ? (
                <span className={styles.hint} aria-hidden="true">
                  <Kbd>c</Kbd>
                </span>
              ) : null}
            </Link>
          </li>
        </ul>
        <div className={styles.sideFoot}>
          {ready && signedIn ? (
            <Link href={`${ROUTES.settings}#account`} className={styles.account}>
              <span className={styles.avatar} aria-hidden="true">
                {(name || user?.email || "N").charAt(0).toUpperCase()}
              </span>
              <span className={styles.accountText}>
                <span className="np-sr-only">Account: </span>
                <span className={styles.accountName}>{who}</span>
                <span className={styles.accountMeta}>{hostOf(base)}</span>
              </span>
            </Link>
          ) : ready ? (
            <p className={styles.accountMeta}>Not signed in</p>
          ) : null}
          <button type="button" className={`np-btn np-btn--ghost np-btn--small ${styles.keysButton}`} onClick={() => setHelpOpen(true)}>
            <KeyboardIcon />
            Keyboard shortcuts
            <Kbd>?</Kbd>
          </button>
        </div>
      </nav>

      <div className={styles.content}>
        <ConnectionNotice signedIn={ready && signedIn} base={base} />
        <main id="app-main" tabIndex={-1} className={styles.main} data-route={path.split("/")[2] || "home"}>
          {!ready ? null : calm ? (
            children
          ) : !signedIn ? (
            <SignIn />
          ) : localData === "ok" ? (
            children
          ) : localData === "elsewhere" && account ? (
            <OtherAccountHere account={account} />
          ) : null}
        </main>
      </div>

      {goPending ? (
        <p className={styles.goHint} aria-hidden="true">
          Go to: <Kbd>h</Kbd> Home <Kbd>l</Kbd> Library <Kbd>p</Kbd> Pal <Kbd>s</Kbd> Settings
        </p>
      ) : null}

      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SitWatcher />
      <Announcer />
    </div>
  );
}

// ---- another account took this browser, in another tab ------------------------------

// This browser keeps one account's day, chat and notes at a time. When an
// account signs in in another tab, this tab stops showing them (they are
// that account's now) until the person here chooses to continue.
function OtherAccountHere({ account }: { account: string }) {
  const id = useId();
  return (
    <section className={`np-panel ${styles.elsewhere}`} aria-labelledby={`${id}-title`}>
      <h1 id={`${id}-title`} className={`np-display ${styles.elsewhereTitle}`}>
        Another account is open in this browser
      </h1>
      <p>
        Someone signed in with a different account in another tab. This browser keeps one account’s day, chat and notes at a time, so
        yours were cleared from it, and nothing personal is shown here.
      </p>
      <p>Continue here to use NeuroPal as you. The other account’s things are cleared from this browser first, and its tab will show this message.</p>
      <div>
        <button type="button" className="np-btn" onClick={() => claimLocalData(account)}>
          Continue here
        </button>
      </div>
    </section>
  );
}

// ---- offline / server unreachable -------------------------------------------------

function ConnectionNotice({ signedIn, base }: { signedIn: boolean; base: string }) {
  const c = useConnection();
  const show = !c.online || (signedIn && c.server === "unreachable");
  return (
    <div role="status" className={styles.noticeSlot}>
      {show ? (
        <div className={styles.notice}>
          <CloudOffIcon />
          <p>
            {!c.online ? "You’re offline." : `Can’t reach your NeuroPal server${base ? ` at ${hostOf(base)}` : ""}.`} Your day, the
            calming steps and Pal’s offline tools still work.
          </p>
          {c.online ? (
            <button
              type="button"
              className="np-btn np-btn--ghost np-btn--small"
              aria-disabled={c.checking}
              onClick={() => {
                if (c.checking) return;
                void checkServer().then((ok) => announce(ok ? "Connected again." : "Still can’t reach the server."));
              }}
            >
              <RefreshIcon />
              {c.checking ? "Checking…" : "Try again"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---- the "?" list -----------------------------------------------------------------------

// Each row: one or more chords ("Shift + ↑"), joined by "then" or "or".
type ShortcutRow = { chords: string[][]; join?: "then" | "or"; what: string };

const SHORTCUT_GROUPS: { title: string; rows: ShortcutRow[] }[] = [
  {
    title: "Anywhere in the app",
    rows: [
      { chords: [["g"], ["h"]], join: "then", what: "Go to Home" },
      { chords: [["g"], ["l"]], join: "then", what: "Go to Library" },
      { chords: [["g"], ["p"]], join: "then", what: "Go to Pal" },
      { chords: [["g"], ["s"]], join: "then", what: "Go to Settings" },
      { chords: [["c"]], what: "Open the calming steps" },
      { chords: [["?"]], what: "Show this list" },
      { chords: [["Esc"]], what: "Close a dialog" },
    ],
  },
  {
    // The reader's own keys (src/components/app/reader): same on/off switch.
    title: "In the reader",
    rows: [
      { chords: [["Space"]], what: "Play or pause reading aloud" },
      { chords: [["←"], ["→"]], join: "or", what: "Previous or next sentence" },
      { chords: [["Shift", "↑"], ["Shift", "↓"]], join: "or", what: "Previous or next paragraph" },
    ],
  },
];

const SPOKEN_KEYS: Record<string, string> = { "←": "Left arrow", "→": "Right arrow", "↑": "Up arrow", "↓": "Down arrow", Esc: "Escape" };

function KeyName({ k }: { k: string }) {
  const spoken = SPOKEN_KEYS[k];
  if (!spoken) return <Kbd>{k}</Kbd>;
  return (
    <Kbd>
      <span aria-hidden="true">{k}</span>
      <span className="np-sr-only">{spoken}</span>
    </Kbd>
  );
}

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const id = useId();
  const prefs = usePrefs();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={`${id}-title`} describedBy={`${id}-desc`}>
      <h2 id={`${id}-title`} className={`np-display ${styles.dialogTitle}`}>
        Keyboard shortcuts
      </h2>
      <p id={`${id}-desc`} className="np-muted">
        Single keys, never while you type in a field. Turn them off if they get in your way.
      </p>
      <div className={styles.keysToggle}>
        <span id={`${id}-switch`} className={styles.keysToggleLabel}>
          Use keyboard shortcuts
        </span>
        <Switch checked={prefs.shortcuts} labelledBy={`${id}-switch`} onChange={(v) => setPrefs({ shortcuts: v })} />
      </div>
      {SHORTCUT_GROUPS.map((g) => (
        <table key={g.title} className={styles.keysTable}>
          <caption className={styles.keysCaption}>{g.title}</caption>
          <thead>
            <tr>
              <th scope="col">Keys</th>
              <th scope="col">What it does</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => (
              <tr key={r.what}>
                <td>
                  {r.chords.map((chord, i) => (
                    <span key={chord.join("+")} className={styles.chord}>
                      {i > 0 ? <span className={styles.then}> {r.join ?? "then"} </span> : null}
                      {chord.map((k, j) => (
                        <span key={k}>
                          {j > 0 ? <span className={styles.then}> + </span> : null}
                          <KeyName k={k} />
                        </span>
                      ))}
                    </span>
                  ))}
                </td>
                <td>{r.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <p className="np-help">On the check-in slider: arrow keys move it, Home and End jump to the ends.</p>
    </Dialog>
  );
}

// ---- "Sit with me": the halfway check-in and the end, on any page ------------------------

function SitWatcher() {
  const { sit } = useSit();
  const { appearance } = useAppearance();
  const pal = normalizePal(appearance.pal);
  const sitId = sit?.id ?? null;
  const ended = Boolean(sit?.endedAt);
  const palName = pal.name;
  const talk = pal.talk;

  useEffect(() => {
    if (!sitId) return;
    const say = { name: palName, talk };
    const tick = () => {
      const ev = tickSit(Date.now());
      if (ev === "asked") announce(`${palName}: ${palSay(say, "sitCheck")}`);
      else if (ev === "ended") announce(`${palName}: ${palSay(say, "sitEnd")}`);
    };
    tick();
    const t = window.setInterval(tick, ended ? 60_000 : 1000);
    return () => window.clearInterval(t);
  }, [sitId, ended, palName, talk]);

  return null;
}
