"use client";
// Settings: shape the app around your brain. Look · Reading · Pal ·
// Keyboard · Account · About. Wide screens keep an "On this page" list in
// view; everything is saved as you go.
import Link from "next/link";
import { useId } from "react";
import { hostOf } from "@/lib/api";
import { setPrefs, usePrefs } from "@/lib/neuropal/prefs";
import { useAppSession } from "@/lib/neuropal/session";
import { ROUTES, SHORTCUTS_EVENT } from "../common/appNav";
import { Kbd, Switch } from "../common/bits";
import { KeyboardIcon } from "../common/icons";
import { AccountSection } from "./AccountSection";
import { LookSection } from "./LookSection";
import { PalSection } from "./PalSection";
import { ReadingSection } from "./ReadingSection";
import styles from "./settings.module.css";

const SECTIONS = [
  { id: "look", title: "Look" },
  { id: "reading", title: "Reading" },
  { id: "pal", title: "Pal" },
  { id: "keyboard", title: "Keyboard" },
  { id: "account", title: "Account" },
  { id: "about", title: "About and privacy" },
] as const;

export function SettingsView() {
  const id = useId();
  const prefs = usePrefs();
  const { base } = useAppSession();

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={`np-display ${styles.title}`}>Settings</h1>
        <p className={styles.lead}>Shape the app around your brain, not the other way round. Changes save as you go.</p>
      </header>

      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="Settings sections">
          <p className={`np-label ${styles.tocLabel}`} aria-hidden="true">
            On this page
          </p>
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.sections}>
          <section id="look" className={`np-panel ${styles.section}`} aria-labelledby={`${id}-look`}>
            <h2 id={`${id}-look`} className={`np-display ${styles.sectionTitle}`}>
              Look
            </h2>
            <LookSection />
          </section>

          <section id="reading" className={`np-panel ${styles.section}`} aria-labelledby={`${id}-reading`}>
            <h2 id={`${id}-reading`} className={`np-display ${styles.sectionTitle}`}>
              Reading
            </h2>
            <ReadingSection />
          </section>

          <section id="pal" className={`np-panel ${styles.section}`} aria-labelledby={`${id}-pal`}>
            <h2 id={`${id}-pal`} className={`np-display ${styles.sectionTitle}`}>
              Pal
            </h2>
            <PalSection />
          </section>

          <section id="keyboard" className={`np-panel ${styles.section}`} aria-labelledby={`${id}-keyboard`}>
            <h2 id={`${id}-keyboard`} className={`np-display ${styles.sectionTitle}`}>
              Keyboard
            </h2>
            <div className={styles.sectionBody}>
              <div className={styles.switchRow}>
                <div>
                  <p id={`${id}-keys`} className={styles.switchLabel}>
                    Keyboard shortcuts
                  </p>
                  <p id={`${id}-keys-help`} className="np-help">
                    Single keys like <Kbd>g</Kbd> then <Kbd>h</Kbd> for Home, <Kbd>c</Kbd> for the calming steps, <Kbd>Space</Kbd> to
                    play or pause in the reader and <Kbd>?</Kbd> for the full list. Never while you type in a field.
                  </p>
                </div>
                <Switch checked={prefs.shortcuts} labelledBy={`${id}-keys`} describedBy={`${id}-keys-help`} onChange={(v) => setPrefs({ shortcuts: v })} />
              </div>
              <div className={styles.row}>
                <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => window.dispatchEvent(new Event(SHORTCUTS_EVENT))}>
                  <KeyboardIcon />
                  Show all shortcuts
                </button>
              </div>
            </div>
          </section>

          <section id="account" className={`np-panel ${styles.section}`} aria-labelledby={`${id}-account`}>
            <h2 id={`${id}-account`} className={`np-display ${styles.sectionTitle}`}>
              Account
            </h2>
            <AccountSection />
          </section>

          <section id="about" className={`np-panel ${styles.section}`} aria-labelledby={`${id}-about`}>
            <h2 id={`${id}-about`} className={`np-display ${styles.sectionTitle}`}>
              About and privacy
            </h2>
            <div className={styles.sectionBody}>
              <div className={styles.twoCol}>
                <div>
                  <h3 className="np-label">In this browser</h3>
                  <ul className={styles.list}>
                    <li>Your day: check-ins, anchors, the minimum viable day, the brain dump.</li>
                    <li>Talk messages: this tab only, or this device when you stay signed in.</li>
                    <li>Signing out clears both, so the next person here sees none of it. Reading and keyboard settings and the look stay.</li>
                  </ul>
                </div>
                <div>
                  <h3 className="np-label">On your NeuroPal server{base ? ` (${hostOf(base)})` : ""}</h3>
                  <ul className={styles.list}>
                    <li>Your documents, reading progress and questions about them.</li>
                    <li>Your look and your Pal’s settings, so every device shows the same.</li>
                    <li>A copy of your chat with Pal, until you clear it.</li>
                    <li>Questions and Talk messages are answered by the AI service your server uses. Nothing is sold, and there are no ads.</li>
                  </ul>
                </div>
              </div>
              <div className={styles.row}>
                <Link href="/privacy/" className="np-btn np-btn--ghost np-btn--small">
                  Privacy
                </Link>
                <Link href={ROUTES.calm} className="np-btn np-btn--ghost np-btn--small">
                  Calming steps
                </Link>
              </div>
              <p className={styles.note}>NeuroPal is not a medical device and doesn’t replace care from a professional.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
