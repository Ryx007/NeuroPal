import Link from "next/link";
import styles from "./chrome.module.css";

const LINKS = [
  { href: "/learn/", label: "The learning space" },
  { href: "/appearance/", label: "Make it yours" },
  { href: "/sign-in/", label: "Sign in to your NeuroPal" },
  { href: "/privacy/", label: "Privacy and principles" },
];

const PRINCIPLES = ["No ads", "No data selling", "No streaks", "Your data never trains models"];

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`np-container ${styles.footerGrid}`}>
        <div>
          <p className={styles.footerMark}>
            <span className="np-led" aria-hidden="true" />
            <span className={styles.wordmarkText}>NeuroPal</span>
          </p>
          <p className="np-small np-muted">
            A neurodivergent-first study platform. It started as one physicist’s own study tool: papers read aloud,
            questions answered from the page, and a calmer way to get started.
          </p>
        </div>
        <nav aria-label="Footer">
          <h2 className="np-label">Explore</h2>
          <ul className={styles.footerList}>
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={styles.footerLink}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="np-label">Permanent rules</h2>
          <ul className={styles.principles}>
            {PRINCIPLES.map((p) => (
              <li key={p}>
                <span className="np-led" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
