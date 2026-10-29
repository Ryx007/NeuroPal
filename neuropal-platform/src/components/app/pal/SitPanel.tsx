"use client";
// "Sit with me": body doubling. Pick 10, 25 or 45 minutes; Pal stays on
// screen with a calm timer (minutes, not ticking seconds), asks once at
// halfway ("Still with it? Either answer is fine."), and at the end offers to
// note what you did. The shell watches the clock on every page.
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { toggleTask, type DayTask } from "@/lib/neuropal/day";
import { palSay, type PalLook, type PalMood } from "@/lib/neuropal/look";
import { leftLabel, SIT_LENGTHS } from "@/lib/neuropal/palLogic";
import { answerSitCheck, clearSit, endSit, saveSitNote, startSit, type PalSit, type PalSitNote } from "@/lib/neuropal/palState";
import { announce } from "../common/announce";
import { CheckIcon, StopIcon } from "../common/icons";
import { PalAvatar } from "../common/PalAvatar";
import { useNow } from "../common/useNow";
import styles from "./pal.module.css";

const NOT_REALLY = "That’s okay. Stop here, or keep going?";

export function SitPanel({ pal, sit, notes, tasks, mood }: { pal: PalLook; sit: PalSit | null; notes: PalSitNote[]; tasks: DayTask[]; mood: PalMood }) {
  const phase = !sit ? "pick" : sit.endedAt ? "ended" : "running";
  const headRef = useRef<HTMLHeadingElement>(null);
  const lastPhase = useRef(phase);

  // The pressed button goes away when the phase changes: focus moves to the
  // new view's heading (only if focus was in this panel).
  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    const panel = headRef.current?.closest("[role=tabpanel]");
    const active = document.activeElement;
    if (panel && (!active || active === document.body || panel.contains(active))) headRef.current?.focus();
  }, [phase]);

  if (phase === "ended" && sit) return <SitEnded pal={pal} sit={sit} tasks={tasks} headRef={headRef} />;
  if (phase === "running" && sit) return <SitRunning pal={pal} sit={sit} mood={mood} headRef={headRef} />;
  return <SitPicker pal={pal} last={notes[0] ?? null} headRef={headRef} />;
}

type HeadRef = RefObject<HTMLHeadingElement | null>;

function SitPicker({ pal, last, headRef }: { pal: PalLook; last: PalSitNote | null; headRef: HeadRef }) {
  const id = useId();
  const [label, setLabel] = useState("");
  return (
    <div className={styles.tool}>
      <h2 ref={headRef} tabIndex={-1} className={`np-display ${styles.toolTitle}`}>
        Sit with me
      </h2>
      <p className={styles.intro}>{palSay(pal, "sit")}</p>
      <div>
        <label htmlFor={`${id}-label`} className="np-field-label">
          What are you working on? <span className={styles.optional}>(optional)</span>
        </label>
        <input id={`${id}-label`} className="np-input" type="text" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className={styles.lengths} role="group" aria-label="How long">
        {SIT_LENGTHS.map((m) => (
          <button
            key={m}
            type="button"
            className={styles.length}
            onClick={() => {
              startSit({ minutes: m, label });
              announce(`${pal.name}: ${palSay(pal, "sitStart")}`);
            }}
          >
            <span className={styles.lengthNum}>{m}</span>
            <span className={styles.lengthUnit}>min</span>
            <span className="np-sr-only">: sit with {pal.name} for {m} minutes</span>
          </button>
        ))}
      </div>
      <p className={styles.small}>Quiet company can make starting easier. You can stop any time.</p>
      {last ? (
        <p className={styles.small}>
          Last time: {last.minutes} min{last.note ? ` · ${last.note}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function SitRunning({ pal, sit, mood, headRef }: { pal: PalLook; sit: PalSit; mood: PalMood; headRef: HeadRef }) {
  const now = useNow(1000);
  const [notReally, setNotReally] = useState(false);
  const total = Math.max(1, sit.endsAt - sit.startedAt);
  const done = Math.max(0, Math.min(1, (now - sit.startedAt) / total));
  const left = leftLabel(sit.endsAt, now);

  return (
    <div className={`${styles.tool} ${styles.sitRunning}`}>
      <PalAvatar pal={pal} size={136} mood={mood} />
      <h2 ref={headRef} tabIndex={-1} className={`np-display ${styles.timer}`}>
        {left}
        <span className="np-sr-only">. {pal.name} is sitting with you.</span>
      </h2>
      <p className={styles.sitLabel}>{sit.label ? `Working on: ${sit.label}` : "Just company. No task needed."}</p>
      <progress className={styles.progress} max={100} value={Math.round(done * 100)} aria-label={`${Math.round(done * 100)} percent of this sit done`} />
      {sit.checkIn === "asked" ? (
        <div className={`${styles.card} ${styles.cardAccent}`}>
          <p className={styles.cardLine}>{notReally ? NOT_REALLY : palSay(pal, "sitCheck")}</p>
          <div className={styles.actions}>
            {notReally ? (
              <>
                <button type="button" className="np-btn" onClick={() => endSit()}>
                  Stop here
                </button>
                <button type="button" className="np-btn np-btn--ghost" onClick={() => answerSitCheck("no")}>
                  Keep going
                </button>
              </>
            ) : (
              <>
                <button type="button" className="np-btn" onClick={() => answerSitCheck("yes")}>
                  Still going
                </button>
                <button
                  type="button"
                  className="np-btn np-btn--ghost"
                  onClick={() => {
                    setNotReally(true);
                    announce(`${pal.name}: ${NOT_REALLY}`);
                  }}
                >
                  Not really
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className={styles.intro}>{palSay(pal, "sitStart")}</p>
      )}
      <div className={styles.actions}>
        <button type="button" className="np-btn" onClick={() => endSit()}>
          <CheckIcon />
          I’m done
        </button>
        <button type="button" className="np-btn np-btn--ghost" onClick={() => endSit()}>
          <StopIcon />
          Stop early
        </button>
      </div>
    </div>
  );
}

function SitEnded({ pal, sit, tasks, headRef }: { pal: PalLook; sit: PalSit; tasks: DayTask[]; headRef: HeadRef }) {
  const id = useId();
  const [note, setNote] = useState("");
  const [ticked, setTicked] = useState(false);
  const task = sit.taskId ? (tasks.find((t) => t.id === sit.taskId) ?? null) : null;
  const spent = Math.max(1, Math.round(((sit.endedAt || sit.endsAt) - sit.startedAt) / 60000));
  const summary =
    sit.endReason === "time"
      ? `That was ${sit.minutes} ${sit.minutes === 1 ? "minute" : "minutes"}${sit.label ? ` on ${sit.label}` : ""}.`
      : `You stopped after ${spent} ${spent === 1 ? "minute" : "minutes"}. That counts.`;

  return (
    <div className={styles.tool}>
      <PalAvatar pal={pal} size={104} mood="okay" />
      <h2 ref={headRef} tabIndex={-1} className={`np-display ${styles.toolTitle}`}>
        {palSay(pal, "sitEnd")}
      </h2>
      <p className={styles.intro}>{summary}</p>
      {task && !task.done && !ticked ? (
        <div>
          <button
            type="button"
            className="np-btn np-btn--ghost"
            onClick={() => {
              toggleTask(task.id);
              setTicked(true);
              announce("Ticked off today’s list.");
            }}
          >
            <CheckIcon />
            Tick off “{task.title}”
          </button>
        </div>
      ) : null}
      {ticked ? <p className={styles.ack}>Ticked off today’s list.</p> : null}
      <div>
        <label htmlFor={`${id}-note`} className="np-field-label">
          What did you do? <span className={styles.optional}>(optional)</span>
        </label>
        <textarea id={`${id}-note`} className={`np-input ${styles.textarea}`} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className="np-btn"
          aria-disabled={!note.trim()}
          onClick={() => {
            if (!note.trim()) return;
            saveSitNote(note);
            announce("Saved.");
          }}
        >
          Save note
        </button>
        <button type="button" className="np-btn np-btn--ghost" onClick={() => clearSit()}>
          Not now
        </button>
      </div>
    </div>
  );
}
