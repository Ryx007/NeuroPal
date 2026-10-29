import type { Metadata } from "next";
import Link from "next/link";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy and principles",
  description: "NeuroPal’s permanent rules in plain words, and exactly what this website and the app keep.",
};

const RULES = [
  { title: "No ads. Ever.", body: "Nothing on NeuroPal is paid for with your attention." },
  {
    title: "We never sell your data.",
    body: "Not your documents, not your notes, not your check-ins, not anything about how you use NeuroPal.",
  },
  {
    title: "Your data never trains AI models.",
    body: "Not ours, not anyone else’s. NeuroPal may only use AI providers on terms that rule this out.",
  },
  {
    title: "No paid placement.",
    body: "The directory of professionals, when it arrives, will never rank anyone because they paid.",
  },
  { title: "No streaks.", body: "Missing a day costs you nothing. There are no points, chains or guilt." },
  {
    title: "Accessibility is a requirement.",
    body: "WCAG 2.1 AA is the minimum: screen readers, full keyboard use, adjustable contrast and reduced motion.",
  },
  {
    title: "Science first.",
    body: "Design choices and lesson claims point to their sources, and weak evidence is labelled as weak.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="np-container np-page">
      <header className="np-section-head">
        <p className="np-label">Privacy</p>
        <h1 className="np-display np-h1">The rules, in plain words</h1>
        <p className="np-lead">
          These rules are permanent. They are not business decisions to revisit later, and they apply to the app, to
          this website and to anything NeuroPal builds next.
        </p>
      </header>

      <div className={styles.layout}>
        <section aria-labelledby="rules-title" className={styles.section}>
          <h2 id="rules-title" className="np-display np-h3">
            The permanent rules
          </h2>
          <ul className={styles.rules}>
            {RULES.map((r) => (
              <li key={r.title} className={`np-panel ${styles.rule}`}>
                <b>{r.title}</b> <span className="np-muted">{r.body}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="site-title" className={styles.section}>
          <h2 id="site-title" className="np-display np-h3">
            What this website keeps
          </h2>
          <ul className={styles.list}>
            <li>
              <b>Your look</b> (skin, colours, motion) and your <b>lesson preferences</b> (explanation level and
              interest) are saved in your browser’s local storage, on this device only. They leave your device only if
              you press <i>Save to my NeuroPal</i>.
            </li>
            <li>
              <b>Your server’s address</b>, if you enter one, is saved the same way.
            </li>
            <li>
              <b>Your sign-in token</b>, if you sign in, is kept in session storage and disappears when you close the
              tab. Your password is never stored.
            </li>
            <li>
              <b>Nothing else.</b> No cookies, no analytics, no trackers and no third-party requests: even the fonts are
              served from this site.
            </li>
          </ul>
          <p className="np-muted">To wipe all of it, clear this site’s data in your browser settings.</p>
        </section>

        <section aria-labelledby="app-title" className={styles.section}>
          <h2 id="app-title" className="np-display np-h3">
            What the NeuroPal app keeps
          </h2>
          <ul className={styles.list}>
            <li>
              Your documents, notes, highlights and reading progress live on the NeuroPal server you connect to, which
              today is a computer you control.
            </li>
            <li>Read-aloud speech is made on your own device.</li>
            <li>The search index that finds the right passages is built on that server.</li>
            <li>
              When you ask a question or request a summary, the question and the parts of the document needed for it go
              to the AI model your server is set up to use: either a model running on your own machine, or a cloud
              provider. Under the rules above, a cloud provider may only be used on terms that do not train on your data.
            </li>
          </ul>
          <p>
            <Link href="/sign-in/">Connect to your NeuroPal</Link> · <Link href="/">Back to the home page</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
