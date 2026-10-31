"use client";
// "Break it down": a big task in, three to seven tiny steps out, from the
// server's AI (POST /api/pal/breakdown). Without the server (offline, busy,
// or an answer that doesn't work) Pal's offline steps take over and the panel
// says so. The steps become a checklist; any step can go on today's
// minimum day; "Do step 1 with me" starts a sit.
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { addTask } from "@/lib/neuropal/day";
import { ApiError } from "@/lib/neuropal/client";
import { palSay, type PalLook } from "@/lib/neuropal/look";
import { palBreakdown } from "@/lib/neuropal/pal";
import {
  cleanSteps,
  CRISIS_REPLY,
  localBreakdown,
  looksLikeCrisis,
  OFFLINE_STEPS_NOTE,
  TASK_MAX_CHARS,
  type OfflineReason,
} from "@/lib/neuropal/palLogic";
import { startSit } from "@/lib/neuropal/palState";
import { ROUTES } from "../common/appNav";
import { announce } from "../common/announce";
import { HelpLines } from "../common/HelpLines";
import { CheckIcon, PlusIcon, SitIcon, SplitIcon } from "../common/icons";
import styles from "./pal.module.css";

const SLOW_LINE = "Still thinking. Quick steps are ready if you’d rather not wait.";
const stepsLine = (n: number) => `${n} small ${n === 1 ? "step" : "steps"}`;

interface Result {
  task: string;
  steps: string[];
  offline: OfflineReason | null;
}

function reasonFor(e: unknown): OfflineReason {
  if (e instanceof ApiError) {
    if (e.status === 0) return "offline";
    if (e.status === 429) return "limited";
  }
  return "error";
}

export function BreakdownPanel({ pal, onSit }: { pal: PalLook; onSit: () => void }) {
  const id = useId();
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [problem, setProblem] = useState("");
  // A task that sounds like a crisis never becomes steps (and is never sent).
  const [crisis, setCrisis] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const slowTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      request.current?.abort(); // a reply after the page closed is ignored
      window.clearTimeout(slowTimer.current);
    },
    [],
  );

  const showCrisis = (reply: string) => {
    setResult(null);
    setLoading(false);
    setSlow(false);
    setCrisis(reply);
    announce(reply);
  };

  const show = (r: Result) => {
    setCrisis(null);
    setResult(r);
    setTicked({});
    setAdded({});
    setLoading(false);
    setSlow(false);
    announce(`${stepsLine(r.steps.length)}.${r.offline ? ` ${OFFLINE_STEPS_NOTE[r.offline]}` : ""}`);
  };

  const run = async (e: FormEvent) => {
    e.preventDefault();
    const t = task.trim();
    if (!t) {
      setProblem("Type the task first. Anything goes, big or small.");
      return;
    }
    if (loading) return;
    setProblem("");
    if (looksLikeCrisis(t)) {
      showCrisis(CRISIS_REPLY);
      return;
    }
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    setLoading(true);
    setSlow(false);
    setResult(null);
    announce("Making the steps…");
    window.clearTimeout(slowTimer.current);
    slowTimer.current = window.setTimeout(() => {
      if (request.current !== ctrl) return;
      setSlow(true);
      announce(SLOW_LINE);
    }, 6000);
    try {
      const r = await palBreakdown(t, ctrl.signal);
      if (request.current !== ctrl) return;
      if (r?.crisis) {
        showCrisis(typeof r.reply === "string" && r.reply.trim() ? r.reply : CRISIS_REPLY);
        return;
      }
      const steps = cleanSteps(r?.steps);
      show(steps ? { task: t, steps, offline: null } : { task: t, steps: localBreakdown(t), offline: "error" });
    } catch (err) {
      if (ctrl.signal.aborted || request.current !== ctrl) return;
      show({ task: t, steps: localBreakdown(t), offline: reasonFor(err) });
    } finally {
      window.clearTimeout(slowTimer.current);
      if (request.current === ctrl) request.current = null;
    }
  };

  const quick = () => {
    request.current?.abort();
    request.current = null;
    window.clearTimeout(slowTimer.current);
    if (looksLikeCrisis(task)) {
      showCrisis(CRISIS_REPLY);
      return;
    }
    show({ task: task.trim(), steps: localBreakdown(task), offline: "quick" });
  };

  const done = result ? result.steps.filter((_, i) => ticked[i]).length : 0;

  return (
    <div className={styles.tool}>
      <h2 className={`np-display ${styles.toolTitle}`}>Break it down</h2>
      <p className={styles.intro}>{palSay(pal, "breakdown")}</p>
      <form className={styles.fieldRow} onSubmit={run} noValidate>
        <div className={styles.grow}>
          <label htmlFor={`${id}-task`} className="np-field-label">
            The task
          </label>
          <input
            id={`${id}-task`}
            className="np-input"
            type="text"
            maxLength={TASK_MAX_CHARS}
            placeholder="e.g. write the intro of my thesis"
            value={task}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${id}-problem` : undefined}
            onChange={(e) => setTask(e.target.value.slice(0, TASK_MAX_CHARS))}
          />
        </div>
        <button type="submit" className={`np-btn ${styles.fieldButton}`} aria-disabled={loading}>
          <SplitIcon />
          Break it down
        </button>
      </form>
      <p id={`${id}-problem`} className={styles.problem} aria-live="assertive">
        {problem}
      </p>

      {loading ? (
        <div className={styles.loading}>
          <p>{slow ? SLOW_LINE : "Making the steps…"}</p>
          {slow ? (
            <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={quick}>
              Use quick steps now
            </button>
          ) : null}
        </div>
      ) : null}

      {crisis ? (
        <section className={styles.card} aria-label={`${pal.name}’s answer`}>
          <p>{crisis}</p>
          <div className={styles.crisis}>
            <Link href={ROUTES.calm} className="np-btn">
              Open the calming steps
            </Link>
            <HelpLines level={3} />
          </div>
        </section>
      ) : null}

      {result ? (
        <section className={styles.card} aria-labelledby={`${id}-steps`}>
          <div className={styles.cardHead}>
            <h3 id={`${id}-steps`} className={styles.cardTitle}>
              {stepsLine(result.steps.length)}
            </h3>
            <span className={styles.mono}>
              {done} of {result.steps.length} done
            </span>
          </div>
          <p className={styles.small}>Tick steps off as you go. The plus adds a step to today’s minimum day.</p>
          <ol className={styles.steps}>
            {result.steps.map((step, i) => (
              <li key={`${i}-${step}`} className={styles.stepRow}>
                <input
                  id={`${id}-s${i}`}
                  type="checkbox"
                  className={styles.stepCheck}
                  checked={Boolean(ticked[i])}
                  onChange={(e) => setTicked((m) => ({ ...m, [i]: e.target.checked }))}
                />
                <label htmlFor={`${id}-s${i}`} className={styles.stepLabel}>
                  <span className={styles.stepBox} aria-hidden="true">
                    {ticked[i] ? <CheckIcon /> : <span className={styles.stepNum}>{i + 1}</span>}
                  </span>
                  <span className={styles.stepText}>{step}</span>
                </label>
                <button
                  type="button"
                  className={`np-btn np-btn--ghost np-btn--small ${styles.iconButton}`}
                  aria-disabled={Boolean(added[i])}
                  onClick={() => {
                    if (added[i]) return;
                    addTask(step);
                    setAdded((m) => ({ ...m, [i]: true }));
                    announce(`Added “${step}” to your minimum day.`);
                  }}
                >
                  {added[i] ? <CheckIcon /> : <PlusIcon />}
                  <span className="np-sr-only">{added[i] ? `“${step}” is on your minimum day` : `Add “${step}” to your minimum day`}</span>
                </button>
              </li>
            ))}
          </ol>
          {result.offline ? <p className={styles.small}>{OFFLINE_STEPS_NOTE[result.offline]}</p> : null}
          <div className={styles.actions}>
            <button
              type="button"
              className="np-btn np-btn--ghost"
              onClick={() => {
                startSit({ minutes: 10, label: result.steps[0] });
                announce(`${pal.name}: ${palSay(pal, "sitStart")}`);
                onSit();
              }}
            >
              <SitIcon />
              Do step 1 with me
              <span className="np-sr-only">: {result.steps[0]}, for 10 minutes</span>
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
