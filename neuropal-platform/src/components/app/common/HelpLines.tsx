// People to call, now. Shown on the calming steps and wherever Pal answers a
// message that sounds like a crisis. No network: plain tel: links.
import { useId } from "react";
import { PhoneIcon } from "./icons";
import styles from "./common.module.css";

export function HelpLines({ level = 2, title = "Talk to someone now", className }: { level?: 2 | 3; title?: string; className?: string }) {
  const id = useId();
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section className={`${styles.helpLines} ${className ?? ""}`} aria-labelledby={`${id}-help`}>
      <Heading id={`${id}-help`} className={`np-display ${styles.helpTitle}`}>
        {title}
      </Heading>
      <p className={styles.helpLead}>
        If you’re in danger, or you might act on thoughts of hurting yourself, call now or go to someone you trust.
      </p>
      <ul className={styles.helpList}>
        <li>
          <a className={styles.helpCall} href="tel:112">
            <PhoneIcon />
            <span className={styles.helpNumber}>112</span>
          </a>
          <span className={styles.helpWhat}>Emergency, in Italy and across the EU</span>
        </li>
        <li>
          <a className={styles.helpCall} href="tel:+390223272327">
            <PhoneIcon />
            <span className={styles.helpNumber}>02 2327 2327</span>
          </a>
          <span className={styles.helpWhat}>Telefono Amico Italia, someone to talk to</span>
        </li>
        <li className={styles.helpElsewhere}>
          <span>Somewhere else? Call your local emergency number.</span>
        </li>
      </ul>
    </section>
  );
}
