import Link from "next/link";
import type { CSSProperties } from "react";
import { Hero } from "@/components/home/Hero";
import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { accentName, SIGNAL_BASES, SIGNAL_PRESETS } from "@/lib/appearance";
import { PRINCIPLES, RESEARCH } from "@/content/home";
import styles from "./home.module.css";

const CORNER_PX = { Sharp: 3, Soft: 14, Round: 26 } as const;

const VIBES = Object.entries(SIGNAL_PRESETS).map(([name, s]) => {
  const b = SIGNAL_BASES[s.base];
  return {
    name,
    meta: `${s.base} · ${accentName(s.acc)} · ${s.motion}`,
    style: {
      "--v-bg": b.surface,
      "--v-panel": b.surfaceContainer,
      "--v-line": b.line,
      "--v-shadow": b.shadow,
      "--v-acc": s.acc,
      "--v-r": `${Math.round(CORNER_PX[s.corners] * 0.5)}px`,
      "--v-sh": `${[0, 2, 3, 4][s.brutality]}px`,
    } as CSSProperties,
  };
});

export default function HomePage() {
  return (
    <>
      <Hero />

      <section className="np-section" aria-labelledby="platform-title">
        <div className="np-container">
          <div className="np-section-head">
            <p className="np-label">Two apps · one platform</p>
            <h2 id="platform-title" className="np-display np-h2">
              One place to read, one place to learn
            </h2>
            <p className="np-lead">
              NeuroPal is a study app that runs on a server you control. The learning space is open to anyone, with no
              account. Both follow the same rules, and both wear the look you choose.
            </p>
          </div>

          <div className={styles.apps}>
            <article className={`np-panel ${styles.app}`} aria-labelledby="app-reader-title">
              <p className={`np-mono ${styles.index}`}>01 · The app</p>
              <h3 id="app-reader-title" className="np-display np-h3">
                NeuroPal, your reading room
              </h3>
              <div className={styles.karaoke} aria-hidden="true">
                <p className={styles.karaokeLine}>
                  The correlation term <span className={styles.karaokeWord}>survives</span> even when each arm is
                  incoherent.
                </p>
                <div className={styles.player}>
                  <span className={styles.playerButton}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <path d="M7 5v14l12-7z" />
                    </svg>
                  </span>
                  <span className={styles.playerTrack}>
                    <span />
                  </span>
                  <span className="np-mono">180 wpm</span>
                </div>
              </div>
              <ul className={styles.features}>
                <li>
                  <span className="np-tag">Read</span>
                  <span>
                    Bring papers, books and notes: PDF, EPUB, Word, Markdown or plain text, or import a paper from arXiv.
                  </span>
                </li>
                <li>
                  <span className="np-tag">Listen</span>
                  <span>
                    Hear them read aloud, with each word highlighted as it is spoken. You set the pace in words per
                    minute, the voice and the pitch.
                  </span>
                </li>
                <li>
                  <span className="np-tag">Ask</span>
                  <span>
                    Ask a question and get an answer drawn from the document, with the page it came from. Or turn a
                    chapter into a summary, a quiz or flashcards.
                  </span>
                </li>
                <li>
                  <span className="np-tag">Steady</span>
                  <span>
                    Regulation tools stay one tap away: a quick check-in on how you feel, and a guided TIPP protocol for
                    overwhelming moments.
                  </span>
                </li>
              </ul>
              <p className={styles.appFoot}>
                Runs on Android, iOS and the web. <Link href="/sign-in/">Connect to your NeuroPal</Link>
              </p>
            </article>

            <article className={`np-panel ${styles.app}`} aria-labelledby="app-learn-title">
              <p className={`np-mono ${styles.index}`}>02 · The learning space</p>
              <h3 id="app-learn-title" className="np-display np-h3">
                Science for anyone
              </h3>
              <dl className={styles.depths}>
                <div>
                  <dt className="np-label">Simple</dt>
                  <dd>Crest meets crest: a bigger wave. Crest meets trough: they cancel.</dd>
                </div>
                <div>
                  <dt className="np-label">Standard</dt>
                  <dd>
                    Bright where the path difference is a whole number of wavelengths: Δ = <i>m</i>λ.
                  </dd>
                </div>
                <div>
                  <dt className="np-label">Technical</dt>
                  <dd>
                    <i>I</i> ∝ cos²(πΔ/λ), with Δ = <i>r</i>
                    <sub>2</sub> − <i>r</i>
                    <sub>1</sub>.
                  </dd>
                </div>
              </dl>
              <ul className={styles.features}>
                <li>
                  <span className="np-tag">Depth</span>
                  <span>The same physics at three depths. All three are correct; they just go further.</span>
                </li>
                <li>
                  <span className="np-tag">Interests</span>
                  <span>Examples drawn from what you already love: music, video games, cooking.</span>
                </li>
                <li>
                  <span className="np-tag">Structure</span>
                  <span>Every lesson has the same four steps, so you always know what comes next.</span>
                </li>
                <li>
                  <span className="np-tag">Hints</span>
                  <span>You try first. A hint comes next, and the answer only when you ask. Nothing is scored.</span>
                </li>
              </ul>
              <p className={styles.appFoot}>
                <Link href="/learn/interference/" className="np-btn">
                  Start the interference lesson
                  <ArrowRight />
                </Link>
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="np-section" aria-labelledby="yours-title">
        <div className="np-container">
          <div className={`np-panel ${styles.yours}`}>
            <div className={styles.yoursCopy}>
              <p className="np-label">Make it yours</p>
              <h2 id="yours-title" className="np-display np-h2">
                Two skins, one system
              </h2>
              <p className="np-lead">
                Classic is calm glass, the original look. Signal is brutal glass: red on graphite by default, with every
                setting yours to change. Start from a vibe, fine-tune eight settings, or describe what you want and Pal
                shows you a preview first.
              </p>
              <p>
                <Link href="/appearance/" className="np-btn">
                  Open Make it yours
                  <ArrowRight />
                </Link>
              </p>
            </div>
            <ul className={styles.vibes} aria-label="The five Signal vibes">
              {VIBES.map((v) => (
                <li key={v.name} className={styles.vibe} style={v.style}>
                  <span className={styles.vibeSwatch} aria-hidden="true">
                    <span className={styles.vibePanel} />
                    <span className={styles.vibeBar} />
                  </span>
                  <span className={styles.vibeName}>{v.name}</span>
                  <span className={`np-mono ${styles.vibeMeta}`}>{v.meta}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="np-section" aria-labelledby="principles-title">
        <div className="np-container">
          <div className="np-section-head">
            <p className="np-label">Principles</p>
            <h2 id="principles-title" className="np-display np-h2">
              Rules that don’t bend
            </h2>
            <p className="np-lead">
              These are permanent. They are not business decisions we revisit later.{" "}
              <Link href="/privacy/">Read them in plain words</Link>.
            </p>
          </div>
          <ul className={styles.principles}>
            {PRINCIPLES.map((p, i) => (
              <li key={p.title} className={`np-panel ${styles.principle}`}>
                <span className={`np-mono ${styles.index}`} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className={styles.principleTitle}>{p.title}</h3>
                <p className="np-muted">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="np-section" aria-labelledby="research-title">
        <div className="np-container">
          <div className="np-section-head">
            <p className="np-label">Science-first</p>
            <h2 id="research-title" className="np-display np-h2">
              Research behind the design
            </h2>
            <p className="np-lead">
              Each choice below points to the work it rests on. Some studies are large, some are small and early; the
              links let you judge for yourself.
            </p>
          </div>
          <ol className={styles.research}>
            {RESEARCH.map((r, i) => (
              <li key={r.title} className={styles.researchItem}>
                <span className={`np-mono ${styles.researchNum}`} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className={styles.researchBody}>
                  <h3 className={styles.researchTitle}>{r.title}</h3>
                  <p>{r.finding}</p>
                  <p className={styles.researchUse}>
                    <span className="np-tag np-tag--outline">{r.status}</span> <span>{r.use}</span>
                  </p>
                  <ul className={styles.sources}>
                    {r.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} className={styles.source}>
                          <span>{s.cite}</span>
                          <ArrowUpRight />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="np-section" aria-labelledby="start-title">
        <div className="np-container">
          <div className={`np-panel ${styles.start}`}>
            <h2 id="start-title" className="np-display np-h2">
              Start where you like
            </h2>
            <p className="np-lead">
              Ten minutes with a lesson, a new look for the site, or your own NeuroPal on your own server.
            </p>
            <div className={styles.startActions}>
              <Link href="/learn/interference/" className="np-btn">
                Try the interference lesson
                <ArrowRight />
              </Link>
              <Link href="/appearance/" className="np-btn np-btn--ghost">
                Make it yours
              </Link>
              <Link href="/sign-in/" className="np-btn np-btn--ghost">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
