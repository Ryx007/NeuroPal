"use client";
// A full-height sheet for narrow screens (Ask, Chapters), on the native
// <dialog>: focus stays inside, the page behind is inert, Escape closes it,
// and focus goes back to whatever opened it. On wider screens it is a tall
// centred panel. The content keeps its own scrolling and pinned parts.
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./reader.module.css";

export function Sheet({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
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
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
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
      className={styles.sheet}
      aria-labelledby={labelledBy}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? <div className={styles.sheetBody}>{children}</div> : null}
    </dialog>
  );
}
