import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import styles from "./learn.module.css";

export const metadata: Metadata = {
  title: "The learning space",
  description:
    "Science explained for every kind of mind: the same physics at three depths, examples from what you love, and the same calm structure in every lesson.",
};

const HOW = [
  { n: "1", title: "See it", body: "A live picture you control. It moves only when you press Play." },
  { n: "2", title: "Understand it", body: "The idea at your depth: Simple, Standard or Technical. All three are correct." },
  { n: "3", title: "Through your interests", body: "The same idea told through music, video games or cooking." },
  { n: "4", title: "Check yourself", body: "You try first. A hint next, and the answer when you ask. Nothing is scored." },
];

const SOON = [
  {
    title: "Standing waves and Chladni plates",
    topic: "Physics · Sound",
    body: "Why sand on a vibrating plate gathers into lines, and what those lines say about the plate.",
  },
  {
    title: "Light through a prism",
    topic: "Physics · Light",
    body: "Why white light fans out into colours, and why violet bends more than red.",
  },
  {
    title: "Seeing with correlations",
    topic: "Physics · Quantum optics",
    body: "How pairs of entangled photons can form an image that neither photon could make alone.",
  },
];

export default function LearnPage() {
  return (
    <div className={`np-container ${styles.page}`}>
      <header className={styles.head}>
        <p className="np-label">The learning space</p>
        <h1 className="np-display np-h1">Science, for every kind of mind</h1>
        <p className="np-lead">
          Short interactive lessons for neurodivergent and neurotypical learners alike. The same physics at the depth you
          choose, examples drawn from what you already love, and the same calm structure every time. No account needed.
        </p>
      </header>

      <section aria-labelledby="how-title" className={styles.section}>
        <h2 id="how-title" className="np-display np-h3">
          How every lesson works
        </h2>
        <ol className={styles.how}>
          {HOW.map((h) => (
            <li key={h.n} className={`np-panel ${styles.howItem}`}>
              <span className={`np-mono ${styles.howNum}`} aria-hidden="true">
                {h.n}
              </span>
              <div>
                <h3 className={styles.howTitle}>{h.title}</h3>
                <p className="np-muted">{h.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="lessons-title" className={styles.section}>
        <h2 id="lessons-title" className="np-display np-h3">
          Lessons
        </h2>
        <ul className={styles.lessons}>
          <li className={`np-panel ${styles.card} ${styles.cardLive}`}>
            <div className={styles.cardTop}>
              <span className="np-tag np-tag--accent">Ready</span>
              <span className={`np-mono ${styles.cardTopic}`}>Physics · Waves · about 10 min</span>
            </div>
            <h3 className={styles.cardTitle}>
              <Link href="/learn/interference/" className={styles.cardLink}>
                Two-source interference
              </Link>
            </h3>
            <p className="np-muted">
              Why two sets of ripples make stripes. A live ripple tank, three depths of explanation, and one question to
              check yourself.
            </p>
            <span className={styles.cardCta} aria-hidden="true">
              Start the lesson
              <ArrowRight />
            </span>
          </li>
          {SOON.map((s) => (
            <li key={s.title} className={`np-panel ${styles.card} ${styles.cardSoon}`}>
              <div className={styles.cardTop}>
                <span className="np-tag np-tag--outline">Coming soon</span>
                <span className={`np-mono ${styles.cardTopic}`}>{s.topic}</span>
              </div>
              <h3 className={styles.cardTitle}>{s.title}</h3>
              <p className="np-muted">{s.body}</p>
              <p className={styles.cardSoonNote}>Not available yet.</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
