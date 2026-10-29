"use client";
// The app's sign-in gate (after the Expo app's LoginScreen). The server
// address is editable right here, so a wrong default is never a dead end;
// /auth/config decides what to show (sign in, create an account with an
// invite code, or "nothing to sign in to" on a single-user server); errors
// stay on screen in plain words until the next try; the calming steps are
// one click away while signed out. The password is never kept.
import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { apiBaseStore, hostOf, mixedContentProblem, parseBase, saveSession, userLabel, type PublicUser } from "@/lib/api";
import { authConfig, fetchMe, register, signIn } from "@/lib/neuropal/account";
import { ApiError } from "@/lib/neuropal/client";
import { normalizePal } from "@/lib/neuropal/look";
import { useStored } from "@/lib/store";
import { useAppearance } from "@/components/AppearanceProvider";
import { announce } from "./announce";
import { LeafIcon } from "./icons";
import { PalAvatar } from "./PalAvatar";
import { useNow } from "./useNow";
import styles from "./signin.module.css";

type ConfigState =
  | { state: "checking" }
  | { state: "ok"; localMode: boolean; signup: "invite" | "open" | "closed" }
  | { state: "down"; message: string };

type Field = "base" | "email" | "password" | "invite";

interface Problem {
  text: string;
  fields: Field[];
}

const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const sentence = (s: string) => {
  const t = capitalise(s.trim());
  return /[.?!…]$/.test(t) ? t : `${t}.`;
};

function offline() {
  try {
    return navigator.onLine === false;
  } catch {
    return false;
  }
}

/** Plain words for a failed sign-in or sign-up. */
function describe(e: unknown, host: string, signingUp: boolean): Problem {
  if (!(e instanceof ApiError)) return { text: "Something went wrong. Try again.", fields: [] };
  if (e.status === 0) {
    if (offline()) return { text: "You’re offline. Connect to the internet or your home network, then try again.", fields: [] };
    if (/took too long/.test(e.message)) return { text: "The server took too long to answer. Try again in a moment.", fields: [] };
    if (/HTTPS/.test(e.message)) return { text: e.message, fields: ["base"] };
    return {
      text: `Can’t reach the server at ${host}. Check the address, that the server is running, and that this device can reach it.`,
      fields: ["base"],
    };
  }
  if (e.status === 429) {
    const s = e.retryAfter;
    return { text: s ? `Too many tries. Wait ${s} ${s === 1 ? "second" : "seconds"}, then try again.` : "Too many tries. Wait a minute, then try again.", fields: [] };
  }
  if (!signingUp && e.status === 401) return { text: "That email and password don’t match an account on this server.", fields: ["email", "password"] };
  if (signingUp && e.status === 403) {
    if (/invite/i.test(e.message)) return { text: "That invite code isn’t right. Check it with whoever runs this server.", fields: ["invite"] };
    return { text: "New accounts are closed on this server.", fields: [] };
  }
  if (signingUp && e.status === 409) return { text: "There’s already an account with that email. Sign in instead.", fields: ["email"] };
  if (e.status === 400 || e.status === 422) return { text: sentence(e.message), fields: [] };
  return { text: `The server couldn’t do that just now (${e.status}). Try again in a moment.`, fields: [] };
}

export function SignIn() {
  const id = useId();
  const storedBase = useStored(apiBaseStore);
  const { appearance } = useAppearance();
  const pal = normalizePal(appearance.pal);
  const now = useNow(1000);

  const [draftBase, setDraftBase] = useState<string | null>(null);
  const [editServer, setEditServer] = useState(!storedBase);
  const [configs, setConfigs] = useState<Record<string, ConfigState>>({});
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [retryUntil, setRetryUntil] = useState(0);

  const base = storedBase;
  const host = base ? hostOf(base) : "";
  const config: ConfigState = base ? (configs[`${base}#${reload}`] ?? { state: "checking" }) : { state: "down", message: "" };

  // What this server offers. Results are kept per address (and per retry).
  useEffect(() => {
    if (!base) return;
    const key = `${base}#${reload}`;
    const ctrl = new AbortController();
    authConfig(ctrl.signal)
      .then((c) => {
        const signup = c?.signup === "open" || c?.signup === "closed" ? c.signup : "invite";
        setConfigs((m) => ({ ...m, [key]: { state: "ok", localMode: Boolean(c?.localMode), signup } }));
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        // An older server without /config: assume accounts with an invite.
        if (e instanceof ApiError && e.status === 404) {
          setConfigs((m) => ({ ...m, [key]: { state: "ok", localMode: false, signup: "invite" } }));
          return;
        }
        setConfigs((m) => ({ ...m, [key]: { state: "down", message: e instanceof ApiError ? e.message : "" } }));
      });
    return () => ctrl.abort();
  }, [base, reload]);

  const ok = config.state === "ok" ? config : null;
  const signupOpen = ok ? ok.signup !== "closed" : true;
  const needsInvite = ok ? ok.signup === "invite" : true;
  const signingUp = mode === "signup" && signupOpen;
  const waitLeft = retryUntil > now ? Math.ceil((retryUntil - now) / 1000) : 0;
  const invalid = (f: Field) => Boolean(problem?.fields.includes(f));

  const fail = (p: Problem) => {
    setProblem(p);
    // The error line is a live region; the same words twice don't change it.
    if (problem?.text === p.text) announce(p.text, { assertive: true });
  };

  const applyAddress = (e?: FormEvent) => {
    e?.preventDefault();
    const r = parseBase(draftBase ?? base);
    if (!r.ok) {
      fail({ text: r.error, fields: ["base"] });
      return;
    }
    const mixed = mixedContentProblem(r.base);
    if (mixed) {
      fail({ text: mixed, fields: ["base"] });
      return;
    }
    setProblem(null);
    setDraftBase(null);
    if (r.base !== base) apiBaseStore.set(r.base);
    else setReload((n) => n + 1);
    setEditServer(false);
  };

  const finish = (token: string, user: PublicUser | null, local = false) => {
    saveSession(local ? { token, base, user, local: true } : { token, base, user }, { keep });
    setPassword("");
    announce(local ? "Connected to your NeuroPal." : `Signed in as ${userLabel(user)}.`);
    // The page takes over: start screen readers at its content.
    window.setTimeout(() => document.getElementById("app-main")?.focus(), 50);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || waitLeft) return;
    if (!base) {
      setEditServer(true);
      fail({ text: "Enter your server’s address first, for example http://192.168.1.20:4000.", fields: ["base"] });
      return;
    }
    const mixed = mixedContentProblem(base);
    if (mixed) {
      fail({ text: mixed, fields: ["base"] });
      return;
    }
    if (!email.trim() || !password) {
      fail({ text: "Enter both your email and your password.", fields: [!email.trim() ? "email" : null, !password ? "password" : null].filter(Boolean) as Field[] });
      return;
    }
    if (signingUp && password.length < 8) {
      fail({ text: "Use at least 8 characters for the password.", fields: ["password"] });
      return;
    }
    if (signingUp && needsInvite && !invite.trim()) {
      fail({ text: "This server needs an invite code to create an account.", fields: ["invite"] });
      return;
    }
    if (offline()) {
      fail({ text: "You’re offline. Connect to the internet or your home network, then try again.", fields: [] });
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const r = signingUp
        ? await register(email.trim(), password, name.trim() || undefined, needsInvite ? invite.trim() : undefined)
        : await signIn(email.trim(), password);
      if (!r?.token) {
        fail({ text: "The server answered, but without a sign-in. Try again.", fields: [] });
        return;
      }
      finish(r.token, r.user ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setRetryUntil(Date.now() + (err.retryAfter ?? 60) * 1000);
      setPassword("");
      fail(describe(err, host, signingUp));
    } finally {
      setBusy(false);
    }
  };

  // A single-user server: nothing to sign in to; the placeholder token is
  // ignored there (and a server that later wants accounts answers 401).
  const continueLocal = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const me = await fetchMe();
      finish("local-mode", { id: me.id, email: me.email, name: me.name, displayName: me.displayName }, true);
    } catch (err) {
      fail(describe(err, host, false));
    } finally {
      setBusy(false);
    }
  };

  const errId = `${id}-error`;
  const describedBy = (f: Field, help?: string) => [invalid(f) ? errId : null, help].filter(Boolean).join(" ") || undefined;
  const serverLine =
    !base
      ? "No server address yet"
      : config.state === "checking"
        ? `Checking ${host}…`
        : config.state === "down"
          ? `Can’t reach ${host}`
          : config.localMode
            ? `${host} · single-user server`
            : host;

  return (
    <div className={styles.gate}>
      <aside className={styles.intro} aria-label="About NeuroPal">
        <PalAvatar pal={pal} size={150} />
        <p className={`np-label ${styles.introLabel}`}>NeuroPal</p>
        <p className={styles.introLine}>
          <b>{pal.name}:</b> Hi. I’m here when you need me.
        </p>
        <p className={styles.introText}>
          Your papers read aloud with each word highlighted, answers from the document itself, and a calm plan for today.
          It all lives on your own NeuroPal server.
        </p>
        <Link href="/app/calm/" className={`np-btn np-btn--ghost ${styles.calmLink}`}>
          <LeafIcon />
          Need help right now? Calming steps
        </Link>
      </aside>

      <section className={`np-panel ${styles.card}`} aria-labelledby={`${id}-title`}>
        <h1 id={`${id}-title`} className={`np-display ${styles.title}`}>
          {ok?.localMode ? "Open your NeuroPal" : signingUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className={styles.subtitle}>
          {ok?.localMode
            ? "This server runs in single-user mode, so there’s no password to type."
            : signingUp
              ? "No marketing emails. Your library stays on your NeuroPal server."
              : "Sign in to pick up where you left off."}
        </p>

        {ok?.localMode ? (
          <div className={styles.form}>
            <KeepMe id={id} keep={keep} setKeep={setKeep} />
            <button type="button" className="np-btn" onClick={continueLocal} aria-disabled={busy}>
              {busy ? "Connecting…" : "Continue"}
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            {signingUp ? (
              <div>
                <label htmlFor={`${id}-name`} className="np-field-label">
                  Name <span className={styles.optional}>(optional)</span>
                </label>
                <input
                  id={`${id}-name`}
                  className="np-input"
                  type="text"
                  autoComplete="name"
                  value={name}
                  maxLength={80}
                  aria-describedby={`${id}-name-help`}
                  onChange={(e) => setName(e.target.value)}
                />
                <p id={`${id}-name-help`} className="np-help">
                  What {pal.name} calls you.
                </p>
              </div>
            ) : null}
            <div>
              <label htmlFor={`${id}-email`} className="np-field-label">
                Email
              </label>
              <input
                id={`${id}-email`}
                className="np-input"
                type="email"
                inputMode="email"
                autoComplete={signingUp ? "email" : "username"}
                spellCheck={false}
                value={email}
                aria-invalid={invalid("email") || undefined}
                aria-describedby={describedBy("email")}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${id}-password`} className="np-field-label">
                Password
              </label>
              <div className={styles.passwordRow}>
                <input
                  id={`${id}-password`}
                  className="np-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete={signingUp ? "new-password" : "current-password"}
                  value={password}
                  aria-invalid={invalid("password") || undefined}
                  aria-describedby={describedBy("password", signingUp ? `${id}-password-help` : undefined)}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="np-btn np-btn--ghost np-btn--small"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  Show password
                </button>
              </div>
              {signingUp ? (
                <p id={`${id}-password-help`} className="np-help">
                  At least 8 characters.
                </p>
              ) : null}
            </div>
            {signingUp && needsInvite ? (
              <div>
                <label htmlFor={`${id}-invite`} className="np-field-label">
                  Invite code
                </label>
                <input
                  id={`${id}-invite`}
                  className="np-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={invite}
                  aria-invalid={invalid("invite") || undefined}
                  aria-describedby={describedBy("invite", `${id}-invite-help`)}
                  onChange={(e) => setInvite(e.target.value)}
                />
                <p id={`${id}-invite-help`} className="np-help">
                  From whoever runs this server.
                </p>
              </div>
            ) : null}

            <KeepMe id={id} keep={keep} setKeep={setKeep} />

            <p id={errId} className={styles.error} aria-live="assertive" aria-atomic="true">
              {problem ? problem.text : ""}
            </p>
            {waitLeft ? (
              <p className={styles.wait}>
                You can try again in <span className="np-mono">{waitLeft} s</span>.
              </p>
            ) : null}

            <button type="submit" className={`np-btn ${styles.submit}`} aria-disabled={busy || waitLeft > 0}>
              {busy ? (signingUp ? "Creating your account…" : "Signing in…") : signingUp ? "Create account" : "Sign in"}
            </button>

            {signupOpen ? (
              <button
                type="button"
                className={styles.switchMode}
                onClick={() => {
                  setProblem(null);
                  setMode((m) => (m === "login" ? "signup" : "login"));
                }}
              >
                {signingUp ? "Already have an account? Sign in" : "No account yet? Create one"}
              </button>
            ) : (
              <p className={styles.closed}>New accounts are closed on this server.</p>
            )}
          </form>
        )}

        {ok?.localMode ? (
          <p id={errId} className={styles.error} aria-live="assertive" aria-atomic="true">
            {problem ? problem.text : ""}
          </p>
        ) : null}

        <div className={styles.server}>
          <div className={styles.serverRow}>
            <span className={`np-led ${config.state === "down" || !base ? styles.ledOff : ""}`} aria-hidden="true" />
            <p className={styles.serverLine} role="status">
              <span className="np-label">Server</span> {serverLine}
            </p>
            <button
              type="button"
              className="np-btn np-btn--ghost np-btn--small"
              aria-expanded={editServer}
              aria-controls={`${id}-server`}
              onClick={() => setEditServer((v) => !v)}
            >
              {editServer ? "Done" : "Change"}
            </button>
          </div>
          {config.state === "down" && base && !editServer ? (
            <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => setReload((n) => n + 1)}>
              Try again
            </button>
          ) : null}
          <form id={`${id}-server`} className={styles.serverForm} hidden={!editServer} onSubmit={applyAddress} noValidate>
            <label htmlFor={`${id}-base`} className="np-field-label">
              Server address
            </label>
            <div className={styles.passwordRow}>
              <input
                id={`${id}-base`}
                className="np-input"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="http://192.168.1.20:4000"
                value={draftBase ?? base}
                aria-invalid={invalid("base") || undefined}
                aria-describedby={[invalid("base") ? errId : null, `${id}-base-help`].filter(Boolean).join(" ")}
                onChange={(e) => setDraftBase(e.target.value)}
              />
              <button type="submit" className="np-btn np-btn--small">
                Use this address
              </button>
            </div>
            <p id={`${id}-base-help`} className="np-help">
              Where your NeuroPal server listens, for example http://192.168.1.20:4000 or your Tailscale name with :4000.
              Saved in this browser.
            </p>
          </form>
        </div>

        <p className={styles.privacy}>
          Your password goes only to the server above and is never stored here. Your documents and notes live on that
          server and are never sold.
        </p>
      </section>
    </div>
  );
}

function KeepMe({ id, keep, setKeep }: { id: string; keep: boolean; setKeep: (v: boolean) => void }) {
  return (
    <div className={styles.keep}>
      <input id={`${id}-keep`} type="checkbox" className={styles.checkbox} checked={keep} aria-describedby={`${id}-keep-help`} onChange={(e) => setKeep(e.target.checked)} />
      <div>
        <label htmlFor={`${id}-keep`} className={styles.keepLabel}>
          Keep me signed in on this device
        </label>
        <p id={`${id}-keep-help`} className="np-help">
          {keep ? "You stay signed in here until you sign out. Only on a device you trust." : "Off: you’re signed out when this tab closes."}
        </p>
      </div>
    </div>
  );
}
