"use client";

import { useId, useState, type FormEvent } from "react";
import {
  apiBaseStore,
  checkHealth,
  fetchMe,
  formatUptime,
  hostOf,
  login,
  mixedContentProblem,
  parseBase,
  sessionStore,
  userLabel,
} from "@/lib/api";
import { endSession } from "@/lib/neuropal/localData";
import { useStored } from "@/lib/store";
import styles from "./signin.module.css";

type Tone = "ok" | "error" | "info";
interface Note {
  tone: Tone;
  message: string;
}

function Message({ note }: { note: Note | null }) {
  return (
    <div role="status" className={styles.messageSlot}>
      {note ? (
        note.tone === "error" ? (
          <div className={`np-hazard ${styles.message}`}>
            <p>
              <b>Problem: </b>
              {note.message}
            </p>
          </div>
        ) : (
          <p className={`${styles.message} ${styles.messageOk}`}>
            <span className="np-led" aria-hidden="true" />
            <span>{note.message}</span>
          </p>
        )
      ) : null}
    </div>
  );
}

export function SignInPanel() {
  const storedBase = useStored(apiBaseStore);
  const session = useStored(sessionStore);
  const [draft, setDraft] = useState<string | null>(null);
  const [conn, setConn] = useState<Note | null>(null);
  const [connBusy, setConnBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [auth, setAuth] = useState<Note | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const id = useId();
  const base = draft ?? storedBase;

  // Validate and remember the address; returns null (with a message) if unusable.
  const resolveBase = (report: (n: Note) => void): string | null => {
    const r = parseBase(base);
    if (!r.ok) {
      report({ tone: "error", message: r.error });
      return null;
    }
    if (r.base !== storedBase) apiBaseStore.set(r.base);
    setDraft(null);
    const mixed = mixedContentProblem(r.base);
    if (mixed) {
      report({ tone: "error", message: mixed });
      return null;
    }
    return r.base;
  };

  const checkConnection = async (e: FormEvent) => {
    e.preventDefault();
    if (connBusy) return;
    const b = resolveBase(setConn);
    if (!b) return;
    setConnBusy(true);
    setConn({ tone: "info", message: `Checking ${hostOf(b)}…` });
    const r = await checkHealth(b);
    setConnBusy(false);
    if (r.ok) {
      const up = r.data?.uptime;
      const uptime = typeof up === "number" ? `, running for ${formatUptime(up)}` : "";
      setConn({ tone: "ok", message: `Connected to ${hostOf(b)}. The server reports “${r.data?.status ?? "ok"}”${uptime}.` });
    } else {
      setConn({ tone: "error", message: r.error ?? "Something went wrong." });
    }
  };

  const whoAmI = async () => {
    if (connBusy) return;
    const b = resolveBase(setConn);
    if (!b) return;
    setConnBusy(true);
    setConn({ tone: "info", message: `Asking ${hostOf(b)} who you are…` });
    const r = await fetchMe(b, session && session.base === b ? session.token : null);
    setConnBusy(false);
    if (r.ok) {
      const u = r.data?.user ?? r.data;
      setConn({ tone: "ok", message: `${hostOf(b)} knows you as ${userLabel(u)}.` });
    } else if (r.status === 401) {
      setConn({ tone: "error", message: "This server has accounts turned on, so it needs you to sign in first." });
    } else {
      setConn({ tone: "error", message: r.error ?? "Something went wrong." });
    }
  };

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    if (authBusy) return;
    const b = resolveBase(setAuth);
    if (!b) return;
    if (!email.trim() || !password) {
      setAuth({ tone: "error", message: "Enter both your email and your password." });
      return;
    }
    setAuthBusy(true);
    setAuth({ tone: "info", message: `Signing in to ${hostOf(b)}…` });
    const r = await login(b, email.trim(), password);
    // The password is never kept: not in state, not in storage.
    setPassword("");
    setAuthBusy(false);
    if (r.ok && r.data?.token) {
      // Only the public fields: the full user (with its look) never sits in storage.
      const u = r.data.user;
      sessionStore.set({
        token: r.data.token,
        base: b,
        user: u ? { id: u.id, email: u.email, name: u.name, displayName: u.displayName } : null,
      });
      setAuth({ tone: "ok", message: `Signed in as ${userLabel(r.data.user)}. This tab stays signed in until you close it.` });
    } else if (r.ok) {
      setAuth({ tone: "error", message: "The server answered, but without a sign-in token." });
    } else if (r.status === 401) {
      setAuth({ tone: "error", message: "That email and password didn’t match an account on this server." });
    } else {
      setAuth({ tone: "error", message: r.error ?? "Something went wrong." });
    }
  };

  const signOut = () => {
    // The same exit as the app: the account's local data goes with the session.
    endSession("signed-out");
    setAuth({ tone: "info", message: "Signed out. The token and this account’s data are gone from this browser." });
  };

  const baseId = `${id}-base`;
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;

  return (
    <div className={styles.grid}>
      <section className={`np-panel ${styles.card}`} aria-labelledby="server-title">
        <h2 id="server-title" className={`np-display ${styles.cardTitle}`}>
          Your server
        </h2>
        <form onSubmit={checkConnection} className={styles.form} noValidate>
          <div>
            <label htmlFor={baseId} className="np-field-label">
              Server address
            </label>
            <input
              id={baseId}
              className="np-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="http://192.168.1.20:4000"
              aria-describedby={`${baseId}-help`}
              value={base}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p id={`${baseId}-help`} className="np-help">
              Where your NeuroPal backend listens, for example a home address like http://192.168.1.20:4000 or your
              Tailscale name with :4000. Saved in this browser.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="submit" className="np-btn" aria-disabled={connBusy}>
              Check connection
            </button>
            <button type="button" className="np-btn np-btn--ghost" onClick={whoAmI} aria-disabled={connBusy}>
              Who am I?
            </button>
          </div>
        </form>
        <Message note={conn} />
      </section>

      <aside className={`np-panel ${styles.card} ${styles.info}`} aria-labelledby="local-title">
        <h2 id="local-title" className={`np-display ${styles.cardTitle}`}>
          Single-user local mode
        </h2>
        <p>
          The owner’s server runs in single-user local mode: it treats every request as the owner’s, so there is nothing
          to sign in to there. <b>Who am I?</b> works without a password.
        </p>
        <p className="np-muted">
          Sign-in below is only for servers that have accounts turned on. Either way, this site only ever talks to the
          address you enter.
        </p>
      </aside>

      <section className={`np-panel ${styles.card}`} aria-labelledby="signin-title">
        <h2 id="signin-title" className={`np-display ${styles.cardTitle}`}>
          Sign in
        </h2>
        {session ? (
          <div className={styles.signedIn}>
            <p>
              <span className="np-led" aria-hidden="true" /> Signed in to <span className="np-mono">{hostOf(session.base)}</span>{" "}
              as {userLabel(session.user)}.
            </p>
            <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={signOut}>
              Sign out
            </button>
          </div>
        ) : null}
        <form onSubmit={signIn} className={styles.form} noValidate>
          <div>
            <label htmlFor={emailId} className="np-field-label">
              Email
            </label>
            <input
              id={emailId}
              className="np-input"
              type="email"
              autoComplete="username"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={passwordId} className="np-field-label">
              Password
            </label>
            <div className={styles.passwordRow}>
              <input
                id={passwordId}
                className="np-input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="np-btn np-btn--ghost np-btn--small"
                aria-pressed={showPassword}
                aria-label="Show password"
                onClick={() => setShowPassword((s) => !s)}
              >
                Show
              </button>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="submit" className="np-btn" aria-disabled={authBusy}>
              Sign in
            </button>
          </div>
          <p className="np-help">
            Your password goes only to the server above and is never stored. The sign-in token stays in this tab and is
            gone when you close it.
          </p>
        </form>
        <Message note={auth} />
      </section>
    </div>
  );
}
