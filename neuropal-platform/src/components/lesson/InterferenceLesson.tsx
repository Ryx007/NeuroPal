"use client";

import Link from "next/link";
import { CheckQuestion } from "@/components/lesson/CheckQuestion";
import { RippleTank } from "@/components/lesson/RippleTank";
import { EXPLANATIONS, INTEREST_TEXT, INTERESTS, LEVELS, SUMMARY } from "@/content/interference";
import { learnPrefsStore } from "@/lib/learnPrefs";
import { useStored } from "@/lib/store";
import styles from "./lesson.module.css";

const STEPS = [
  { id: "see-it", label: "See it" },
  { id: "understand-it", label: "Understand it" },
  { id: "through-interests", label: "Through your interests" },
  { id: "check-yourself", label: "Check yourself" },
];

export function InterferenceLesson() {
  const prefs = useStored(learnPrefsStore);
  const interest = INTEREST_TEXT[prefs.interest];

  return (
    <article className={`np-container ${styles.lesson}`} aria-labelledby="lesson-title">
      <header className={styles.lessonHead}>
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <ol>
            <li>
              <Link href="/learn/">Learn</Link>
            </li>
            <li aria-current="page">Two-source interference</li>
          </ol>
        </nav>
        <p className="np-label">Physics · Waves · Lesson 1</p>
        <h1 id="lesson-title" className="np-display np-h1">
          Two-source interference
        </h1>
        <p className="np-lead">Why two sets of ripples make stripes, and what the stripes tell you about waves.</p>
        <ul className={styles.meta} aria-label="About this lesson">
          <li>About 10 minutes</li>
          <li>4 steps</li>
          <li>Nothing is scored</li>
          <li>Stop whenever you like</li>
        </ul>
        <nav aria-label="Lesson steps" className={styles.steps}>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>
                  <span className={`np-mono ${styles.stepNum}`} aria-hidden="true">
                    {i + 1}
                  </span>
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <section id="see-it" className={styles.step} aria-labelledby="see-it-title">
        <p className="np-label">Step 1 of 4</p>
        <h2 id="see-it-title" className="np-display np-h2">
          See it
        </h2>
        <p className={styles.stepIntro}>
          Two sources tap the water in a ripple tank, in step with each other. Press Play to set the ripples moving, then
          change the wavelength and the separation and watch the lines.
        </p>
        <RippleTank />
      </section>

      <section id="understand-it" className={styles.step} aria-labelledby="understand-it-title">
        <p className="np-label">Step 2 of 4</p>
        <h2 id="understand-it-title" className="np-display np-h2">
          Understand it
        </h2>
        <fieldset className={styles.seg}>
          <legend className={styles.segLegend}>Explanation level</legend>
          <p className={styles.segNote}>The same physics at three depths. All three are correct.</p>
          <div className={styles.segRow}>
            {LEVELS.map((l) => (
              <label key={l.id} className={styles.segItem}>
                <input
                  type="radio"
                  name="level"
                  value={l.id}
                  checked={prefs.level === l.id}
                  onChange={() => learnPrefsStore.set({ ...prefs, level: l.id })}
                />
                <span className={styles.segText}>
                  <b>{l.label}</b>
                  <span>{l.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className={`np-panel ${styles.explain}`}>{EXPLANATIONS[prefs.level]}</div>
      </section>

      <section id="through-interests" className={styles.step} aria-labelledby="through-interests-title">
        <p className="np-label">Step 3 of 4</p>
        <h2 id="through-interests-title" className="np-display np-h2">
          Through your interests
        </h2>
        <fieldset className={styles.seg}>
          <legend className={styles.segLegend}>Explain it through…</legend>
          <p className={styles.segNote}>Short analogies that are accurate, not just catchy.</p>
          <div className={`${styles.segRow} ${styles.segRowCompact}`}>
            {INTERESTS.map((it) => (
              <label key={it.id} className={styles.segItem}>
                <input
                  type="radio"
                  name="interest"
                  value={it.id}
                  checked={prefs.interest === it.id}
                  onChange={() => learnPrefsStore.set({ ...prefs, interest: it.id })}
                />
                <span className={styles.segText}>
                  <b>{it.label}</b>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className={`np-panel ${styles.explain}`}>
          <h3 className={styles.explainTitle}>{interest.title}</h3>
          {interest.body}
        </div>
      </section>

      <section id="check-yourself" className={styles.step} aria-labelledby="check-yourself-title">
        <p className="np-label">Step 4 of 4</p>
        <h2 id="check-yourself-title" className="np-display np-h2">
          Check yourself
        </h2>
        <p className={styles.stepIntro}>Try first. A hint is there if you want one, and the answer when you ask.</p>
        <CheckQuestion />
      </section>

      <section className={styles.step} aria-labelledby="remember-title">
        <div className={`np-panel ${styles.remember}`}>
          <h2 id="remember-title" className="np-display np-h3">
            What to remember
          </h2>
          <ul>
            {SUMMARY.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <p className={styles.next}>
          That is the whole lesson. <Link href="/learn/">See what is coming next in the learning space</Link>.
        </p>
      </section>
    </article>
  );
}
