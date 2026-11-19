"use client";
// "What now?": ONE next step for this moment, with a reason (Pal's local
// brain, palLogic.suggestionsFor). "Something else" moves on; a new
// check-in starts the list over. In red there is no chatter: just the step.
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { recordCheckin, type DayData, type NervousState } from "@/lib/neuropal/day";
import { listDocuments } from "@/lib/neuropal/documents";
import { palSay, type PalLook } from "@/lib/neuropal/look";
import { suggestionsFor, unfinishedReading, type PalTool, type Suggestion } from "@/lib/neuropal/palLogic";
import { startSit } from "@/lib/neuropal/palState";
import type { NPDocument } from "@/lib/neuropal/types";
import { announce } from "../common/announce";
import { readerHref, ROUTES } from "../common/appNav";
import { STATE_INFO, STATE_ORDER, StateGlyph } from "../common/bits";
import { ArrowRightIcon, LeafIcon } from "../common/icons";
import { useNow } from "../common/useNow";
import { middleOfState } from "../home/CheckInSlider";
import styles from "./pal.module.css";

export function NowPanel({ pal, day, active, onTool }: { pal: PalLook; day: DayData; active: boolean; onTool: (t: PalTool) => void }) {
  const id = useId();
  const router = useRouter();
  const nowMs = useNow(60_000);
  const [docs, setDocs] = useState<NPDocument[]>([]);
  const [cursor, setCursor] = useState<{ state: NervousState | null; index: number }>({ state: day.state, index: 0 });
  const [acked, setAcked] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    listDocuments(undefined, ctrl.signal)
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .catch(() => undefined); // offline: no reading suggestion, everything else works
    return () => ctrl.abort();
  }, [active]);

  const list = suggestionsFor({ state: day.state, now: new Date(nowMs), anchors: day.anchors, tasks: day.tasks, reading: unfinishedReading(docs), pal });
  // A new check-in starts the list over.
  const index = cursor.state === day.state ? cursor.index : 0;
  const s: Suggestion = list[index % list.length];

  const doIt = () => {
    const a = s.action;
    if (a.type === "calm") return router.push(ROUTES.calm);
    if (a.type === "open") return onTool(a.tool);
    if (a.type === "ack") {
      setAcked(s.id);
      // The pressed button goes away: focus moves on to "Something else".
      window.setTimeout(() => document.getElementById(`${id}-else`)?.focus(), 0);
      return announce(`${pal.name}: ${palSay(pal, "ack")}`);
    }
    if (a.type === "sit") {
      startSit({ minutes: a.minutes, label: a.label, taskId: a.taskId ?? null, anchorId: a.anchorId ?? null });
      announce(`${pal.name}: ${palSay(pal, "sitStart")}`);
      return onTool("sit");
    }
    if (a.type === "read") {
      startSit({ minutes: a.minutes, label: a.label });
      return router.push(readerHref(a.docId));
    }
    return undefined;
  };

  const what =
    s.action.type === "calm"
      ? "open the calming steps"
      : s.action.type === "open"
        ? s.action.tool === "dump"
          ? "open the brain dump"
          : "open Break it down"
        : s.action.type === "ack"
          ? "okay"
          : s.action.type === "sit"
            ? `start ${s.action.minutes} minutes with ${pal.name}`
            : `open the reader and start ${s.action.minutes} minutes with ${pal.name}`;

  return (
    <div className={styles.tool}>
      <h2 className={`np-display ${styles.toolTitle}`}>What now?</h2>
      {day.state !== "red" ? <p className={styles.intro}>{palSay(pal, "now")}</p> : null}

      {!day.state ? (
        <div className={styles.checkIn}>
          <p id={`${id}-ask`} className={styles.checkInAsk}>
            You haven’t checked in. How are you right now?
          </p>
          <div role="group" aria-labelledby={`${id}-ask`} className={styles.checkRow}>
            {STATE_ORDER.map((st) => (
              <button
                key={st}
                type="button"
                className={styles.checkButton}
                data-state={st}
                aria-pressed={false}
                onClick={() => {
                  recordCheckin(st, middleOfState(st));
                  announce(`Checked in: ${STATE_INFO[st].word}.`);
                }}
              >
                <StateGlyph shape={STATE_INFO[st].shape} size={13} className={styles.checkGlyph} />
                {STATE_INFO[st].word}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className={`${styles.card} ${styles.cardAccent}`}>
        <div aria-live="polite" aria-atomic="true">
          <p className={styles.suggestTitle}>{s.title}</p>
          <p className={styles.suggestWhy}>{s.why}</p>
        </div>
        {acked === s.id ? <p className={styles.ack}>{palSay(pal, "ack")}</p> : null}
        <div className={styles.actions}>
          {acked !== s.id ? (
            <button type="button" className="np-btn" onClick={doIt}>
              {s.action.type === "calm" ? <LeafIcon /> : null}
              {s.action.type === "calm" ? "Open the calming steps" : "Do it"}
              {s.action.type !== "calm" ? <ArrowRightIcon /> : null}
              <span className="np-sr-only">: {what}</span>
            </button>
          ) : null}
          <button
            id={`${id}-else`}
            type="button"
            className="np-btn np-btn--ghost"
            onClick={() => {
              setAcked(null);
              setCursor({ state: day.state, index: index + 1 });
            }}
          >
            Something else
          </button>
        </div>
      </div>
      {day.state === "red" ? <p className={styles.note}>Nothing else is needed from you right now.</p> : null}
    </div>
  );
}
