"use client";
// "Brain dump": get it out of your head. Sort it later, or never. Anything can
// move to today's minimum day; Delete has Undo. Stored on this device.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { addDump, addTask, removeDump, restoreDump, type DumpItem } from "@/lib/neuropal/day";
import { palSay, type PalLook } from "@/lib/neuropal/look";
import { ListCheckIcon, PlusIcon, TrashIcon, UndoIcon } from "../common/icons";
import styles from "./pal.module.css";

export function DumpPanel({ pal, items }: { pal: PalLook; items: DumpItem[] }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<{ text: string; undo?: DumpItem } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const focusAfter = useRef<string | null>(null);

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    if (target === "input") input.current?.focus();
    else document.getElementById(target)?.focus();
  });

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!addDump(draft)) return;
    setDraft("");
    setStatus({ text: "Saved." });
    input.current?.focus();
  };

  const toDay = (d: DumpItem) => {
    addTask(d.text);
    removeDump(d.id);
    setStatus({ text: `Added “${d.text}” to your minimum day.` });
    focusAfter.current = "input";
  };

  const remove = (d: DumpItem) => {
    const gone = removeDump(d.id);
    if (!gone) return;
    setStatus({ text: "Deleted.", undo: gone });
    focusAfter.current = `${id}-undo`;
  };

  return (
    <div className={styles.tool}>
      <h2 className={`np-display ${styles.toolTitle}`}>Brain dump</h2>
      <p className={styles.intro}>{palSay(pal, "dump")}</p>
      <form className={styles.fieldRow} onSubmit={save}>
        <div className={styles.grow}>
          <label htmlFor={`${id}-new`} className="np-field-label">
            A thought, a worry, a to-do
          </label>
          <input
            ref={input}
            id={`${id}-new`}
            className="np-input"
            type="text"
            maxLength={2000}
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <button type="submit" className={`np-btn ${styles.fieldButton}`} aria-disabled={!draft.trim()}>
          <PlusIcon />
          Save
        </button>
      </form>
      <div className={styles.statusRow} role="status">
        {status ? (
          <>
            <span>{status.text}</span>
            {status.undo ? (
              <button
                id={`${id}-undo`}
                type="button"
                className="np-btn np-btn--ghost np-btn--small"
                onClick={() => {
                  if (!status.undo) return;
                  restoreDump(status.undo);
                  setStatus({ text: "Back in the dump." });
                  focusAfter.current = "input";
                }}
              >
                <UndoIcon />
                Undo
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className={styles.intro}>{palSay(pal, "dumpEmpty")}</p>
      ) : (
        <ul className={styles.dumpList} aria-label={`Brain dump, ${items.length} ${items.length === 1 ? "item" : "items"}`}>
          {items.map((d) => (
            <li key={d.id} className={styles.dumpItem}>
              <p className={styles.dumpText}>{d.text}</p>
              <div className={styles.dumpActions}>
                <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => toDay(d)}>
                  <ListCheckIcon />
                  Minimum day
                  <span className="np-sr-only">: add “{d.text}”</span>
                </button>
                <button type="button" className={`np-btn np-btn--ghost np-btn--small ${styles.iconButton}`} onClick={() => remove(d)}>
                  <TrashIcon />
                  <span className="np-sr-only">Delete “{d.text}”</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
