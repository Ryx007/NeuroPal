"use client";
// The minimum viable day: three to five small things that make today count.
// Ticks reset each morning. Edit adds and removes (with Undo).
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { addTask, removeTask, restoreTask, toggleTask, type DayTask } from "@/lib/neuropal/day";
import type { TileSize } from "@/lib/neuropal/look";
import { CheckIcon, ListCheckIcon, PlusIcon, TrashIcon, UndoIcon } from "../common/icons";
import styles from "./home.module.css";

export function MvdTile({ size, tasks }: { size: TileSize; tasks: DayTask[] }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<{ text: string; undo?: { task: DayTask; index: number } } | null>(null);
  const focusAfter = useRef<string | null>(null);
  const remaining = tasks.filter((t) => !t.done).length;

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    document.getElementById(target)?.focus();
  });

  const compact = size === "S" && !expanded && !editing;
  const shown = size === "M" && !expanded && !editing ? tasks.slice(0, 3) : tasks;
  const hidden = tasks.length - shown.length;
  const leftWords = remaining ? `${remaining} ${remaining === 1 ? "task" : "tasks"} left` : "All done";

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (addTask(draft)) {
      setStatus({ text: `Added “${draft.trim()}”.` });
      setDraft("");
    }
  };

  const remove = (t: DayTask) => {
    const gone = removeTask(t.id);
    if (!gone) return;
    setStatus({ text: `Removed “${t.title}”.`, undo: gone });
    focusAfter.current = `${id}-undo`;
  };

  return (
    <section className={`np-panel ${styles.tile} ${styles.mvdTile}`} aria-labelledby={`${id}-title`} data-size={size}>
      <div className={styles.tileHead}>
        <h2 id={`${id}-title`} className="np-label">
          Minimum viable day
        </h2>
        <span className={`${styles.leftTag} ${remaining ? "" : styles.leftTagDone}`}>
          <span aria-hidden="true">{remaining ? `${remaining} left` : "Done"}</span>
          <span className="np-sr-only">{leftWords}</span>
        </span>
        <button
          type="button"
          className={`np-btn np-btn--ghost np-btn--small ${styles.headButton}`}
          aria-pressed={editing}
          onClick={() => {
            setEditing((v) => !v);
            setStatus(null);
          }}
        >
          {editing ? "Done editing" : "Edit"}
          <span className="np-sr-only"> tasks</span>
        </button>
      </div>

      {compact ? (
        <button type="button" className={styles.oneLineButton} aria-expanded={false} onClick={() => setExpanded(true)}>
          <span className={styles.oneLineIcon} aria-hidden="true">
            <ListCheckIcon />
          </span>
          <span className={styles.oneLineValue}>
            {remaining ? `${remaining} small ${remaining === 1 ? "thing" : "things"} left today` : "Everything for today is done"}
          </span>
          <span className={styles.linkish}>Show</span>
        </button>
      ) : (
        <ul className={styles.checkList}>
          {shown.map((t) => (
            <li key={t.id} className={styles.checkRow}>
              <input id={`${id}-${t.id}`} type="checkbox" className={styles.checkInput} checked={t.done} onChange={() => toggleTask(t.id)} />
              <label htmlFor={`${id}-${t.id}`} className={styles.checkLabel}>
                <span className={styles.checkBox} aria-hidden="true">
                  {t.done ? <CheckIcon /> : null}
                </span>
                <span className={styles.checkText}>
                  <span className={styles.checkTitle}>{t.title}</span>
                  {t.subtitle ? <span className={styles.checkSub}>{t.subtitle}</span> : null}
                </span>
              </label>
              {editing ? (
                <button type="button" className={`np-btn np-btn--ghost np-btn--small ${styles.iconButton}`} onClick={() => remove(t)}>
                  <TrashIcon />
                  <span className="np-sr-only">Remove {t.title}</span>
                </button>
              ) : null}
            </li>
          ))}
          {!tasks.length ? <li className={styles.tileText}>Nothing here yet. Add one small thing that would make today count.</li> : null}
        </ul>
      )}

      {hidden > 0 ? (
        <button type="button" className={styles.moreButton} aria-expanded={false} onClick={() => setExpanded(true)}>
          + {hidden} more
        </button>
      ) : null}
      {expanded && size !== "L" && !editing ? (
        <button type="button" className={styles.moreButton} aria-expanded onClick={() => setExpanded(false)}>
          Show fewer
        </button>
      ) : null}

      {editing ? (
        <form className={styles.addRow} onSubmit={add}>
          <label htmlFor={`${id}-new`} className="np-sr-only">
            New task for today
          </label>
          <input
            id={`${id}-new`}
            className="np-input"
            type="text"
            maxLength={120}
            placeholder="Add a task for today…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="np-btn np-btn--small" aria-disabled={!draft.trim()}>
            <PlusIcon />
            Add
          </button>
        </form>
      ) : null}

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
                  restoreTask(status.undo.task, status.undo.index);
                  setStatus({ text: `“${status.undo.task.title}” is back.` });
                }}
              >
                <UndoIcon />
                Undo
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
