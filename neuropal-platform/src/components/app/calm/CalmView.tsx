"use client";
// The calming steps (DBT TIPP), after the Expo app's EmergencyScreen: body
// first, one step at a time; a paced-breathing guide (it moves only when
// motion is allowed, otherwise a counted guide in words); people to call;
// "I'm OK for now" goes back to where you were, or Home. Works signed out
// and makes no network calls.
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAppearance } from "@/components/AppearanceProvider";
import { skinAttributes } from "@/lib/appearance";
import { previousAppPath, ROUTES } from "../common/appNav";
import { HelpLines } from "../common/HelpLines";
import { ArrowLeftIcon, ArrowRightIcon, LeafIcon, PhoneIcon, PlayIcon, StopIcon } from "../common/icons";
import styles from "./calm.module.css";

const STEPS = [
  {
    letter: "T",
    title: "Temperature",
    time: "About 1 minute",
    body: "Splash cold water on your face, or hold something cold to your eyes and cheeks. The cold slows your heart rate down.",
  },
  {
    letter: "I",
    title: "Intense movement",
    time: "About 2 minutes",
    body: "Move hard for a short burst: jumping jacks, running on the spot, fast stairs. It uses up the extra energy in your body.",
  },
  {
    letter: "P",
    title: "Paced breathing",
    time: "About 4 minutes",
    body: "Breathe in for 4, hold for 2, breathe out for 6. A longer out-breath tells your body it is safe. The guide is right here.",
  },
  {
    letter: "P",
    title: "Paired relaxation",
    time: "About 3 minutes",
    body: "Tense one group of muscles as hard as you can for 5 seconds, then let go completely. Notice the tension leaving.",
  },
] as const;

export function CalmView() {
  const id = useId();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const done = () => {
    const prev = previousAppPath();
    if (prev && prev !== ROUTES.calm.replace(/\/+$/, "")) router.back();
    else router.push(ROUTES.home);
  };

  return (
    <div className={styles.calm}>
      <header className={styles.head}>
        <p className="np-label">Calming steps · TIPP</p>
        <h1 className={`np-display ${styles.title}`}>Calming steps</h1>
        <p className={styles.lead}>When everything is too much, start with the body. One step at a time. Nothing else is needed from you right now.</p>
        <a href="#calm-help" className={`np-btn np-btn--ghost np-btn--small ${styles.jump}`}>
          <PhoneIcon />
          Talk to someone now
        </a>
      </header>

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          <section className={`np-panel ${styles.stepCard}`} aria-labelledby={`${id}-steps`}>
            <h2 id={`${id}-steps`} className="np-sr-only">
              The four steps
            </h2>
            <div className={styles.stepTop}>
              <p className="np-label">
                Step {step + 1} of {STEPS.length}
              </p>
              <ol className={styles.progress} aria-label="Steps">
                {STEPS.map((s, i) => (
                  <li key={s.title} className={i <= step ? styles.progressOn : undefined} aria-current={i === step ? "step" : undefined}>
                    <span className="np-sr-only">
                      {s.title}
                      {i < step ? ", done" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            {/* Read out when the step changes; focus stays on the buttons. */}
            <div className={styles.stepBody} aria-live="polite" aria-atomic="true">
              <div className={styles.stepHeading}>
                <span className={styles.letter} aria-hidden="true">
                  {current.letter}
                </span>
                <div>
                  <h3 className={`np-display ${styles.stepTitle}`}>{current.title}</h3>
                  <p className={styles.stepTime}>{current.time}</p>
                </div>
              </div>
              <p className={styles.stepText}>{current.body}</p>
              {step === 0 || step === 1 ? (
                <p className={styles.caution}>Skip this one if you have a heart condition or it doesn’t feel safe. Breathing always works.</p>
              ) : null}
            </div>
            <div className={styles.stepActions}>
              <button type="button" className="np-btn np-btn--ghost" aria-disabled={step === 0} onClick={() => step > 0 && setStep(step - 1)}>
                <ArrowLeftIcon />
                Back
              </button>
              <button type="button" className="np-btn" onClick={() => (last ? done() : setStep(step + 1))}>
                {last ? "I’m OK for now" : "Next step"}
                {last ? <LeafIcon /> : <ArrowRightIcon />}
              </button>
            </div>
          </section>

          <div id="calm-help" className={`np-panel ${styles.helpCard}`} tabIndex={-1}>
            <HelpLines />
          </div>
        </div>

        <div className={styles.sideCol}>
          <Breathing />
          <section className={`np-panel ${styles.reassure}`} aria-label="A word">
            <p>This feeling is temporary. Your body knows the way back to calm, and you are already helping it.</p>
            <button type="button" className="np-btn np-btn--ghost" onClick={done}>
              I’m OK for now
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

// ---- paced breathing: in 4, hold 2, out 6 -------------------------------------------------

const PHASES = [
  { name: "Breathe in", seconds: 4 },
  { name: "Hold", seconds: 2 },
  { name: "Breathe out", seconds: 6 },
] as const;
const CYCLE = 12;

function phaseAt(tick: number) {
  let t = tick % CYCLE;
  for (const p of PHASES) {
    if (t < p.seconds) return { name: p.name, count: t + 1, of: p.seconds };
    t -= p.seconds;
  }
  return { name: PHASES[0].name, count: 1, of: 4 };
}

function useMotionAllowed(): boolean {
  const { appearance, palette, reducedMotion, hydrated } = useAppearance();
  if (!hydrated) return false;
  return skinAttributes(appearance, palette, reducedMotion)["data-motion"] !== "Still";
}

function Breathing() {
  const id = useId();
  const motion = useMotionAllowed();
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(timer.current);
  }, [running]);

  const phase = phaseAt(tick);
  const breaths = Math.floor(tick / CYCLE) + 1;

  return (
    <section className={`np-panel ${styles.breathCard}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={`np-display ${styles.breathTitle}`}>
        Breathe with me
      </h2>
      <p className={styles.breathLead}>In for 4, hold for 2, out for 6. Longer out than in.</p>

      {motion ? (
        <>
          <div className={styles.circleBox} aria-hidden="true">
            <div className={`${styles.circle} ${running ? styles.circleRun : ""}`} />
            <p className={styles.circleText}>
              {running ? (
                <>
                  <span className={styles.phaseName}>{phase.name}</span>
                  <span className={styles.phaseCount}>{phase.count}</span>
                </>
              ) : (
                <span className={styles.phaseName}>Ready</span>
              )}
            </p>
          </div>
          <p className="np-sr-only">
            {running ? "The circle grows while you breathe in, rests while you hold, and shrinks while you breathe out." : ""}
          </p>
          <div className={styles.breathActions}>
            <button
              type="button"
              className={running ? "np-btn np-btn--ghost" : "np-btn"}
              onClick={() => {
                setTick(0);
                setRunning((r) => !r);
              }}
            >
              {running ? <StopIcon /> : <PlayIcon />}
              {running ? "Stop" : "Start breathing"}
            </button>
            {running ? <span className={styles.breathCount}>Breath {breaths}</span> : null}
          </div>
        </>
      ) : null}

      <ol className={styles.counted} aria-label="Counted guide">
        <li>
          <b>Breathe in</b> <span className={styles.counts}>1 · 2 · 3 · 4</span>
        </li>
        <li>
          <b>Hold</b> <span className={styles.counts}>1 · 2</span>
        </li>
        <li>
          <b>Breathe out</b> <span className={styles.counts}>1 · 2 · 3 · 4 · 5 · 6</span>
        </li>
      </ol>
      <p className={styles.breathNote}>Repeat for a few minutes, or for as long as it helps.</p>
    </section>
  );
}
