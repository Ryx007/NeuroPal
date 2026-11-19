"use client";
// The anchors editor: every anchor of the day on the left, the one being
// added or changed on the right (stacked on phones). Time, a window it may
// move in, and a kind. Delete has Undo. Stored on this device.
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  addAnchor,
  ANCHOR_CATEGORIES,
  DEFAULT_FLEX,
  FLEX_CHOICES,
  hhmm,
  removeAnchor,
  restoreAnchor,
  setAnchorStatus,
  time12,
  updateAnchor,
  type Anchor,
  type AnchorCategory,
} from "@/lib/neuropal/day";
import { ChoiceChips } from "../common/bits";
import { Dialog } from "../common/Dialog";
import { CheckIcon, EditIcon, PlusIcon, TrashIcon, UndoIcon } from "../common/icons";
import { CategoryIcon, windowLabel } from "./anchorBits";
import styles from "./home.module.css";

export type AnchorsTarget = { edit: string } | { add: true } | null;

interface Draft {
  title: string;
  subtitle: string;
  time: string;
  flex: number;
  category: AnchorCategory;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function draftFor(a: Anchor | null, now: Date): Draft {
  if (a) return { title: a.title, subtitle: a.subtitle, time: hhmm(a.time), flex: a.flexMinutes, category: a.category };
  return { title: "", subtitle: "", time: `${pad2((now.getHours() + 1) % 24)}:00`, flex: DEFAULT_FLEX, category: "other" };
}

const flexText = (m: number) => (m === 0 ? "Exact time" : m >= 60 && m % 60 === 0 ? `± ${m / 60} hour` : `± ${m} min`);

export function AnchorsDialog({
  open,
  onClose,
  target,
  anchors,
  signal,
  now,
}: {
  open: boolean;
  onClose: () => void;
  target: AnchorsTarget;
  anchors: Anchor[];
  signal: boolean;
  now: Date;
}) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={`${id}-title`} describedBy={`${id}-desc`} wide closeLabel="Close anchors">
      <AnchorsEditor id={id} target={target} anchors={anchors} signal={signal} now={now} />
    </Dialog>
  );
}

function AnchorsEditor({ id, target, anchors, signal, now }: { id: string; target: AnchorsTarget; anchors: Anchor[]; signal: boolean; now: Date }) {
  const initial = target && "edit" in target ? (anchors.find((a) => a.id === target.edit) ?? null) : null;
  const [editing, setEditing] = useState<string | "new" | null>(target ? (initial ? initial.id : "new") : null);
  const [draft, setDraft] = useState<Draft>(() => draftFor(initial, now));
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; undo?: Anchor } | null>(null);
  const focusAfter = useRef<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const clock = (a: Anchor) => (signal ? hhmm(a.time) : time12(a.time));

  // Move focus once the list has re-rendered (a saved row, the Undo button…).
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    document.getElementById(target)?.focus();
  });

  const startEdit = (a: Anchor | null) => {
    setEditing(a ? a.id : "new");
    setDraft(draftFor(a, now));
    setProblem(null);
    window.setTimeout(() => titleRef.current?.focus(), 0);
  };

  const cancel = () => {
    const was = editing;
    setEditing(null);
    setProblem(null);
    focusAfter.current = was && was !== "new" ? `${id}-edit-${was}` : `${id}-add`;
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setProblem("Give the anchor a name.");
      titleRef.current?.focus();
      return;
    }
    const m = /^(\d{1,2}):(\d{2})/.exec(draft.time);
    if (!m) {
      setProblem("Pick a time for it.");
      return;
    }
    const input = { title, subtitle: draft.subtitle.trim(), hour: Number(m[1]), minute: Number(m[2]), flexMinutes: draft.flex, category: draft.category };
    let savedId = editing && editing !== "new" ? editing : null;
    if (savedId) updateAnchor(savedId, input);
    else savedId = addAnchor(input);
    setEditing(null);
    setProblem(null);
    setStatus({ text: `Saved “${title}” at ${signal ? draft.time : time12({ hour: input.hour, minute: input.minute })}.` });
    focusAfter.current = savedId ? `${id}-edit-${savedId}` : `${id}-add`;
  };

  const remove = (a: Anchor) => {
    const gone = removeAnchor(a.id);
    if (!gone) return;
    if (editing === a.id) setEditing(null);
    setStatus({ text: `Deleted “${a.title}”.`, undo: gone });
    focusAfter.current = `${id}-undo`;
  };

  const undo = () => {
    if (!status?.undo) return;
    restoreAnchor(status.undo);
    const back = status.undo;
    setStatus({ text: `“${back.title}” is back.` });
    focusAfter.current = `${id}-edit-${back.id}`;
  };

  const editingAnchor = editing && editing !== "new" ? anchors.find((a) => a.id === editing) ?? null : null;

  return (
    <>
      <h2 id={`${id}-title`} className={`np-display ${styles.dialogTitle}`}>
        Anchors
      </h2>
      <p id={`${id}-desc`} className={styles.dialogLead}>
        Fixed points in your day: meds, breaks, study blocks. Each one has a window, so it never has to be exact.
        They stay on this device.
      </p>

      <div className={styles.anchorsGrid}>
        <section className={styles.anchorsListCol} aria-labelledby={`${id}-list`}>
          <div className={styles.anchorsListHead}>
            <h3 id={`${id}-list`} className="np-label">
              Today · {anchors.length} {anchors.length === 1 ? "anchor" : "anchors"}
            </h3>
            <button id={`${id}-add`} type="button" className="np-btn np-btn--small" data-autofocus={editing === null ? "" : undefined} onClick={() => startEdit(null)}>
              <PlusIcon />
              Add anchor
            </button>
          </div>
          {anchors.length ? (
            <ul className={styles.anchorsList}>
              {anchors.map((a) => (
                <li key={a.id} className={`${styles.anchorRow} ${editing === a.id ? styles.anchorRowOn : ""}`}>
                  <span className={styles.anchorRowTime}>{clock(a)}</span>
                  <span className={styles.anchorRowIcon} aria-hidden="true">
                    <CategoryIcon category={a.category} />
                  </span>
                  <span className={styles.anchorRowText}>
                    <span className={styles.anchorRowTitle}>{a.title}</span>
                    <span className={styles.anchorRowMeta}>
                      {ANCHOR_CATEGORIES.find((c) => c.id === a.category)?.label} · {windowLabel(a)}
                      {a.status === "done" ? " · done today" : ""}
                    </span>
                  </span>
                  <span className={styles.anchorRowActions}>
                    <button
                      type="button"
                      className="np-btn np-btn--ghost np-btn--small"
                      aria-pressed={a.status === "done"}
                      onClick={() => setAnchorStatus(a.id, a.status === "done" ? "upcoming" : "done")}
                    >
                      <CheckIcon />
                      <span className="np-sr-only">Done today: {a.title}</span>
                    </button>
                    <button id={`${id}-edit-${a.id}`} type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => startEdit(a)}>
                      <EditIcon />
                      <span className="np-sr-only">Edit {a.title}</span>
                    </button>
                    <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => remove(a)}>
                      <TrashIcon />
                      <span className="np-sr-only">Delete {a.title}</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.tileText}>No anchors yet. Add one for meds, a break or a study block.</p>
          )}
          <div className={styles.statusRow} role="status">
            {status ? (
              <>
                <span>{status.text}</span>
                {status.undo ? (
                  <button id={`${id}-undo`} type="button" className="np-btn np-btn--ghost np-btn--small" onClick={undo}>
                    <UndoIcon />
                    Undo
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </section>

        <section className={styles.anchorEditor} aria-labelledby={`${id}-editor`}>
          <h3 id={`${id}-editor`} className="np-label">
            {editing === "new" ? "New anchor" : editingAnchor ? `Edit · ${editingAnchor.title}` : "Add or edit"}
          </h3>
          {editing ? (
            <form className={styles.anchorForm} onSubmit={save} noValidate>
              <div>
                <label htmlFor={`${id}-name`} className="np-field-label">
                  Name
                </label>
                <input
                  ref={titleRef}
                  id={`${id}-name`}
                  className="np-input"
                  type="text"
                  maxLength={120}
                  placeholder="e.g. Evening meds"
                  value={draft.title}
                  data-autofocus=""
                  aria-invalid={problem === "Give the anchor a name." || undefined}
                  aria-describedby={problem ? `${id}-problem` : undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor={`${id}-details`} className="np-field-label">
                  Details <span className={styles.optional}>(optional)</span>
                </label>
                <input
                  id={`${id}-details`}
                  className="np-input"
                  type="text"
                  maxLength={200}
                  placeholder="e.g. with water"
                  value={draft.subtitle}
                  onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))}
                />
              </div>
              <div className={styles.formPair}>
                <div>
                  <label htmlFor={`${id}-time`} className="np-field-label">
                    Time
                  </label>
                  <input
                    id={`${id}-time`}
                    className={`np-input ${styles.timeInput}`}
                    type="time"
                    step={60}
                    value={draft.time}
                    aria-invalid={problem === "Pick a time for it." || undefined}
                    onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-flex`} className="np-field-label">
                    Window
                  </label>
                  <select
                    id={`${id}-flex`}
                    className={`np-input ${styles.select}`}
                    value={draft.flex}
                    aria-describedby={`${id}-flex-help`}
                    onChange={(e) => setDraft((d) => ({ ...d, flex: Number(e.target.value) }))}
                  >
                    {FLEX_CHOICES.map((m) => (
                      <option key={m} value={m}>
                        {flexText(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p id={`${id}-flex-help`} className="np-help">
                How far it may move. Anywhere inside the window counts.
              </p>
              <ChoiceChips
                label="Kind"
                value={draft.category}
                choices={ANCHOR_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
                onChange={(category) => setDraft((d) => ({ ...d, category }))}
              />
              <p id={`${id}-problem`} className={styles.formProblem} aria-live="assertive">
                {problem ?? ""}
              </p>
              <div className={styles.tileActions}>
                <button type="submit" className="np-btn">
                  Save
                </button>
                <button type="button" className="np-btn np-btn--ghost" onClick={cancel}>
                  Cancel
                </button>
                {editingAnchor ? (
                  <button type="button" className={`np-btn np-btn--ghost ${styles.pushRight}`} onClick={() => remove(editingAnchor)}>
                    <TrashIcon />
                    Delete
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <p className={styles.tileText}>Pick an anchor to change it, or add a new one.</p>
          )}
        </section>
      </div>
    </>
  );
}
