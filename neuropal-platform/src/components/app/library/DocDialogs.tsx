"use client";
// Rename and delete, each in the shell's dialog (focus kept inside, Escape
// closes, focus goes back to the card's menu).
import { useId, useState, type FormEvent } from "react";
import { Dialog } from "@/components/app/common/Dialog";
import { errorText } from "@/lib/neuropal/client";
import { deleteDocument, renameDocument } from "@/lib/neuropal/documents";
import { docId, type NPDocument } from "@/lib/neuropal/types";
import styles from "./library.module.css";

export function RenameDialog({ doc, onClose, onDone }: { doc: NPDocument | null; onClose: () => void; onDone: (d: NPDocument) => void }) {
  const id = useId();
  return (
    <Dialog open={!!doc} onClose={onClose} labelledBy={`${id}-t`} describedBy={`${id}-d`}>
      {doc ? <RenameForm key={docId(doc)} id={id} doc={doc} onClose={onClose} onDone={onDone} /> : null}
    </Dialog>
  );
}

function RenameForm({ id, doc, onClose, onDone }: { id: string; doc: NPDocument; onClose: () => void; onDone: (d: NPDocument) => void }) {
  const [title, setTitle] = useState(doc.title || "");
  const [subtitle, setSubtitle] = useState(doc.subtitle || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      setError("A title can’t be empty.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await renameDocument(docId(doc), t, subtitle.trim());
      onDone({ ...doc, ...updated });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className={styles.dialogForm}>
      <h2 id={`${id}-t`} className={`np-display ${styles.dialogTitle}`}>
        Rename
      </h2>
      <p id={`${id}-d`} className="np-muted">
        The new name shows everywhere you use NeuroPal.
      </p>
      <div>
        <label htmlFor={`${id}-title`} className="np-field-label">
          Title
        </label>
        <input
          id={`${id}-title`}
          className="np-input"
          value={title}
          maxLength={500}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={error && !title.trim() ? true : undefined}
          data-autofocus
        />
      </div>
      <div>
        <label htmlFor={`${id}-sub`} className="np-field-label">
          Subtitle <span className="np-muted">(optional)</span>
        </label>
        <input id={`${id}-sub`} className="np-input" value={subtitle} maxLength={500} onChange={(e) => setSubtitle(e.target.value)} />
      </div>
      <div role="alert">
        {error ? (
          <p className="np-hazard">
            <span>
              <b>Problem: </b>
              {error}
            </span>
          </p>
        ) : null}
      </div>
      <div className={styles.dialogActions}>
        <button type="submit" className="np-btn" aria-disabled={busy || undefined}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="np-btn np-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DeleteDialog({ doc, onClose, onDone }: { doc: NPDocument | null; onClose: () => void; onDone: (id: string) => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!doc || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDocument(docId(doc));
      onDone(docId(doc));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!doc}
      onClose={() => {
        setError(null);
        onClose();
      }}
      labelledBy={`${id}-t`}
      describedBy={`${id}-d`}
    >
      {doc ? (
        <>
          <h2 id={`${id}-t`} className={`np-display ${styles.dialogTitle}`}>
            Delete “{doc.title}”?
          </h2>
          <p id={`${id}-d`}>
            It leaves your library on every device, along with your place in it.
          </p>
          <div role="alert">
            {error ? (
              <p className="np-hazard">
                <span>
                  <b>Problem: </b>
                  {error}
                </span>
              </p>
            ) : null}
          </div>
          <div className={styles.dialogActions}>
            <button type="button" className="np-btn" onClick={() => void confirm()} aria-disabled={busy || undefined}>
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button type="button" className="np-btn np-btn--ghost" onClick={onClose} data-autofocus>
              Keep it
            </button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
