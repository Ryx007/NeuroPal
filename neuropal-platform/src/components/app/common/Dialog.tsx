"use client";
// A modal dialog on the native <dialog>: the browser traps focus and makes
// the rest of the page inert; Escape and a click on the backdrop close it;
// focus goes back to whatever opened it. Content mounts only while open, so
// every opening starts fresh.
import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import styles from "./common.module.css";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** id of the dialog's visible heading. */
  labelledBy: string;
  describedBy?: string;
  /** Wider layout for two-column content (e.g. the anchors editor). */
  wide?: boolean;
  /** Label of the corner close button. */
  closeLabel?: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, labelledBy, describedBy, wide, closeLabel = "Close", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
      // Content can name its first stop with data-autofocus (else the browser
      // picks the first focusable element: the close button).
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault(); // Escape: the parent decides (it may want to keep a draft)
      onCloseRef.current();
    };
    const onNativeClose = () => {
      const el = returnTo.current;
      returnTo.current = null;
      if (el && el.isConnected) el.focus();
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onNativeClose);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onNativeClose);
      if (d.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${wide ? styles.dialogWide : ""}`}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={(e) => {
        // Only the backdrop: the dialog box itself has no padding of its own.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className={styles.dialogBody}>
          <button type="button" className={`np-btn np-btn--ghost np-btn--small ${styles.dialogClose}`} onClick={onClose} aria-label={closeLabel}>
            <CloseIcon />
          </button>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
