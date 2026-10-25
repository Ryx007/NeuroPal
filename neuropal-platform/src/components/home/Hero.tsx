"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppearance } from "@/components/AppearanceProvider";
import { FieldCanvas, type FieldMode } from "@/components/FieldCanvas";
import { ArrowRight, Pause, Play } from "@/components/icons";
import { fieldSettings } from "@/lib/appearance";
import styles from "./Hero.module.css";

const FACTS = ["Free core", "No ads", "No streaks", "Your data never trains models"];

export function Hero() {
  const { appearance, palette, reducedMotion } = useAppearance();
  const settings = fieldSettings(appearance, palette, reducedMotion);
  const [modeChoice, setModeChoice] = useState<FieldMode | null>(null);
  const [paused, setPaused] = useState(false);
  const [plateMode, setPlateMode] = useState("(2, 6)");

  const mode: FieldMode = modeChoice ?? settings?.mode ?? "Chladni";
  const stillReason = !settings
    ? null
    : reducedMotion
      ? "Your device asks for reduced motion, so the field holds still."
      : settings.motion === "Still"
        ? "Motion is set to Still in Make it yours, so the field holds still."
        : null;
  const speed = settings && !paused && !stillReason ? settings.speed : 0;
  const field = appearance.skin === "signal" ? appearance.signal.field : "None";

  return (
    <section className={styles.hero} aria-labelledby="hero-title" data-field={field} data-has-field={settings ? "true" : "false"}>
      {settings ? (
        <FieldCanvas
          className={styles.canvas}
          mode={mode}
          speed={speed}
          accent={settings.accent}
          base={settings.base}
          amp={settings.amp}
          onModeLabel={setPlateMode}
        />
      ) : null}
      <div className={`np-grid-layer ${styles.gridOverlay}`} aria-hidden="true" />
      <div className={styles.scrim} aria-hidden="true" />

      <div className={`np-container ${styles.inner}`}>
        <div className={styles.copy}>
          <p className="np-label">NeuroPal · a study platform</p>
          <h1 id="hero-title" className={`np-display np-kinetic ${styles.title}`}>
            <span>Read it.</span> <span>Hear it.</span> <span className={styles.titleAccent}>Ask it.</span>
          </h1>
          <p className={`np-lead ${styles.lead}`}>
            NeuroPal reads your papers and books aloud, highlights each word as it is spoken, and answers your questions
            from the document itself. Next to it is an open learning space where science is explained at your depth,
            through the things you already love.
          </p>
          <div className={styles.ctas}>
            <Link href="/learn/interference/" className="np-btn">
              Try a lesson
              <ArrowRight />
            </Link>
            <Link href="/appearance/" className="np-btn np-btn--ghost">
              Make it yours
            </Link>
          </div>
          <ul className={styles.facts} aria-label="Permanent rules">
            {FACTS.map((f) => (
              <li key={f}>
                <span className="np-led" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {settings ? (
          <div className={`np-panel ${styles.instrument}`} role="group" aria-labelledby="field-title">
            <div className={styles.instrumentHead}>
              <h2 id="field-title" className="np-label">
                Background field
              </h2>
              <p className={`np-mono ${styles.readout}`}>
                {mode === "Chladni" ? <>Plate mode (n, m) = {plateMode}</> : <>Two sources · in step</>}
              </p>
            </div>
            <div className={styles.instrumentRow}>
              <button
                type="button"
                className="np-chip"
                aria-pressed={mode === "Chladni"}
                onClick={() => setModeChoice("Chladni")}
              >
                Chladni plate
              </button>
              <button
                type="button"
                className="np-chip"
                aria-pressed={mode === "Interference"}
                onClick={() => setModeChoice("Interference")}
              >
                Two sources
              </button>
              {stillReason ? null : (
                <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => setPaused((p) => !p)}>
                  {paused ? <Play /> : <Pause />}
                  {paused ? "Play motion" : "Pause motion"}
                </button>
              )}
            </div>
            <p className={styles.caption}>
              {mode === "Chladni"
                ? "Sand gathers on the still lines of a vibrating square plate, here drifting between its vibration modes."
                : "Two ripples set off in step: where crests meet crests the field is bright, where crests meet troughs it stays dark."}
              {stillReason ? ` ${stillReason}` : ""}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
