"use client";
// Account: who is signed in, to which server; staying signed in on this
// device or not; sign out here or everywhere (with a confirmation); change
// the password. A single-user server has no account: only "Disconnect".
import { useId, useState, type FormEvent } from "react";
import { hostOf, saveSession, userLabel } from "@/lib/api";
import { changePassword, logoutEverywhere } from "@/lib/neuropal/account";
import { ApiError, currentSession, errorText } from "@/lib/neuropal/client";
import { moveChat } from "@/lib/neuropal/palState";
import { signOutHere, useAppSession } from "@/lib/neuropal/session";
import { announce } from "../common/announce";
import { Switch } from "../common/bits";
import { Dialog } from "../common/Dialog";
import { LogOutIcon } from "../common/icons";
import styles from "./settings.module.css";

const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function AccountSection() {
  const id = useId();
  const { user, base, kept, local } = useAppSession();
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allError, setAllError] = useState("");
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [pwProblem, setPwProblem] = useState<{ text: string; field: "current" | "next" | null } | null>(null);
  const [pwDone, setPwDone] = useState("");

  const keep = (v: boolean) => {
    const s = currentSession();
    if (!s) return;
    saveSession(s, { keep: v });
    moveChat(v);
    announce(v ? "You’ll stay signed in on this device." : "Signed in for this tab only now.");
  };

  const everywhere = async () => {
    if (busy) return;
    setBusy(true);
    setAllError("");
    try {
      await logoutEverywhere();
      setConfirmAll(false);
      signOutHere();
      announce("Signed out on every device.");
    } catch (e) {
      setAllError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!current) {
      setPwProblem({ text: "Type your current password first.", field: "current" });
      return;
    }
    if (next.length < 8) {
      setPwProblem({ text: "Use at least 8 characters for the new password.", field: "next" });
      return;
    }
    setPwProblem(null);
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setChanging(false);
      setPwDone("Password changed. Every other device was signed out.");
    } catch (err) {
      setCurrent("");
      if (err instanceof ApiError && err.status === 401) setPwProblem({ text: "That current password isn’t right.", field: "current" });
      else if (err instanceof ApiError && (err.status === 400 || err.status === 422)) setPwProblem({ text: `${capitalise(err.message)}.`, field: "next" });
      else setPwProblem({ text: errorText(err), field: null });
    } finally {
      setBusy(false);
    }
  };

  if (local) {
    return (
      <div className={styles.sectionBody}>
        <p>
          Connected to a single-user NeuroPal at <span className="np-mono">{hostOf(base)}</span>. There’s no account or password on
          that server.
        </p>
        <div className={styles.row}>
          <button type="button" className="np-btn np-btn--ghost" onClick={signOutHere}>
            <LogOutIcon />
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sectionBody}>
      <div className={styles.accountCard}>
        <span className={styles.avatar} aria-hidden="true">
          {(user?.name || user?.email || "N").charAt(0).toUpperCase()}
        </span>
        <div className={styles.accountText}>
          <p className={styles.accountName}>{user?.name || user?.displayName || "Signed in"}</p>
          <p className={styles.accountMeta}>{user?.email ?? userLabel(user)}</p>
          <p className={styles.accountMeta}>
            Server <span className="np-mono">{hostOf(base)}</span>
          </p>
        </div>
      </div>

      <div className={styles.switchRow}>
        <div>
          <p id={`${id}-keep`} className={styles.switchLabel}>
            Keep me signed in on this device
          </p>
          <p id={`${id}-keep-help`} className="np-help">
            {kept ? "You stay signed in here until you sign out. Only on a device you trust." : "Off: closing this tab signs you out."}
          </p>
        </div>
        <Switch checked={kept} labelledBy={`${id}-keep`} describedBy={`${id}-keep-help`} onChange={keep} />
      </div>

      <div className={styles.row}>
        <button type="button" className="np-btn np-btn--ghost" onClick={signOutHere}>
          <LogOutIcon />
          Sign out
        </button>
        <button type="button" className="np-btn np-btn--ghost" onClick={() => setConfirmAll(true)}>
          Sign out everywhere
        </button>
        <button
          type="button"
          className="np-btn np-btn--ghost"
          aria-expanded={changing}
          aria-controls={`${id}-pw`}
          onClick={() => {
            setChanging((v) => !v);
            setPwProblem(null);
            setPwDone("");
          }}
        >
          Change password
        </button>
      </div>
      <p className={styles.note} role="status">
        {pwDone}
      </p>

      <form id={`${id}-pw`} className={styles.pwForm} hidden={!changing} onSubmit={savePassword} noValidate>
        <div>
          <label htmlFor={`${id}-current`} className="np-field-label">
            Current password
          </label>
          <input
            id={`${id}-current`}
            className="np-input"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={current}
            aria-invalid={pwProblem?.field === "current" || undefined}
            aria-describedby={pwProblem?.field === "current" ? `${id}-pw-problem` : undefined}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-next`} className="np-field-label">
            New password
          </label>
          <input
            id={`${id}-next`}
            className="np-input"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={next}
            aria-invalid={pwProblem?.field === "next" || undefined}
            aria-describedby={[pwProblem?.field === "next" ? `${id}-pw-problem` : null, `${id}-next-help`].filter(Boolean).join(" ")}
            onChange={(e) => setNext(e.target.value)}
          />
          <p id={`${id}-next-help`} className="np-help">
            At least 8 characters. Changing it signs out every other device.
          </p>
        </div>
        <p id={`${id}-pw-problem`} className={styles.problem} aria-live="assertive">
          {pwProblem?.text ?? ""}
        </p>
        <div className={styles.row}>
          <button type="submit" className="np-btn" aria-disabled={busy}>
            {busy ? "Saving…" : "Save new password"}
          </button>
          <button type="button" className="np-btn np-btn--ghost" aria-pressed={show} onClick={() => setShow((v) => !v)}>
            Show passwords
          </button>
        </div>
      </form>

      <Dialog open={confirmAll} onClose={() => setConfirmAll(false)} labelledBy={`${id}-all-title`} describedBy={`${id}-all-desc`}>
        <h2 id={`${id}-all-title`} className={`np-display ${styles.dialogTitle}`}>
          Sign out everywhere?
        </h2>
        <p id={`${id}-all-desc`}>
          This signs you out on every device and browser, this one too. You can sign in again with your password.
        </p>
        <p className={styles.problem} aria-live="assertive">
          {allError}
        </p>
        <div className={styles.row}>
          <button type="button" className="np-btn" onClick={everywhere} aria-disabled={busy}>
            {busy ? "Signing out…" : "Sign out everywhere"}
          </button>
          <button type="button" className="np-btn np-btn--ghost" onClick={() => setConfirmAll(false)} data-autofocus="">
            Cancel
          </button>
        </div>
      </Dialog>
    </div>
  );
}
