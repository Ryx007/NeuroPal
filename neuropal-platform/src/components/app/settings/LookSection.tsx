"use client";
// Look: the core of the Make it yours studio, right here — skin, Classic's
// theme and accent, Signal's vibe, accent and motion — with Undo. Everything
// else (the live preview, fine-tuning, Ask Pal, saving to your NeuroPal)
// lives in the studio, one link away.
import Link from "next/link";
import { useAppearance } from "@/components/AppearanceProvider";
import {
  cap,
  CLASSIC_ACCENT_NAMES,
  CLASSIC_THEME_NAMES,
  describeAppearance,
  matchPreset,
  SIGNAL_ACCENTS,
  SIGNAL_OPTIONS,
  SIGNAL_PRESETS,
  type Motion,
} from "@/lib/appearance";
import { ChoiceChips } from "../common/bits";
import { ArrowRightIcon, UndoIcon } from "../common/icons";
import styles from "./settings.module.css";

export function LookSection() {
  const { appearance, reducedMotion, canUndo, edit, undo } = useAppearance();
  const signal = appearance.skin === "signal";
  const sig = appearance.signal;
  const preset = signal ? matchPreset(sig) : null;
  const contrast = appearance.classic.theme === "contrast";

  return (
    <div className={styles.sectionBody}>
      <ChoiceChips
        label="Skin"
        value={appearance.skin}
        choices={[
          { value: "classic", label: "Classic", ariaLabel: "Classic: calm glass, the original look" },
          { value: "signal", label: "Signal", ariaLabel: "Signal: brutal glass, every setting yours" },
        ]}
        onChange={(skin) => edit((a) => ({ ...a, skin }))}
      />
      {signal ? (
        <>
          <ChoiceChips
            label="Vibe"
            value={preset}
            choices={Object.keys(SIGNAL_PRESETS).map((name) => ({ value: name, label: name }))}
            onChange={(name) => edit((a) => ({ ...a, skin: "signal", signal: { ...SIGNAL_PRESETS[name] } }))}
          />
          <ChoiceChips
            label="Accent"
            value={SIGNAL_ACCENTS.find((x) => x.hex.toUpperCase() === sig.acc.toUpperCase())?.hex ?? null}
            choices={SIGNAL_ACCENTS.map((x) => ({ value: x.hex, label: x.name }))}
            onChange={(acc) => edit((a) => ({ ...a, signal: { ...a.signal, acc } }), { coalesce: "acc" })}
          />
          <ChoiceChips
            label="Motion"
            value={sig.motion}
            choices={SIGNAL_OPTIONS.motion.map((m: Motion) => ({ value: m, label: m }))}
            onChange={(motion) => edit((a) => ({ ...a, signal: { ...a.signal, motion } }))}
          />
          {reducedMotion ? <p className={styles.note}>Your device asks for reduced motion, so nothing moves whatever you pick here.</p> : null}
        </>
      ) : (
        <>
          <ChoiceChips
            label="Theme"
            value={appearance.classic.theme}
            choices={CLASSIC_THEME_NAMES.map((t) => ({ value: t, label: cap(t) }))}
            onChange={(theme) => edit((a) => ({ ...a, skin: "classic", classic: { ...a.classic, theme } }))}
          />
          <ChoiceChips
            label="Accent"
            value={contrast ? null : appearance.classic.accent}
            choices={CLASSIC_ACCENT_NAMES.map((x) => ({
              value: x,
              label: cap(x),
              disabled: contrast,
              ariaLabel: contrast ? `${cap(x)}, not available in Contrast` : undefined,
            }))}
            onChange={(accent) => edit((a) => ({ ...a, skin: "classic", classic: { ...a.classic, accent } }))}
          />
          {contrast ? <p className={styles.note}>Contrast uses fixed black, white and yellow, so accents are off.</p> : null}
        </>
      )}
      <p className={styles.note} role="status">
        Now: {describeAppearance(appearance)}.
      </p>
      <div className={styles.row}>
        <button type="button" className="np-btn np-btn--ghost np-btn--small" aria-disabled={!canUndo} onClick={() => canUndo && undo()}>
          <UndoIcon />
          Undo
        </button>
        <Link href="/appearance/" className="np-btn np-btn--ghost np-btn--small">
          Everything else in Make it yours
          <ArrowRightIcon />
        </Link>
      </div>
      <p className={styles.note}>Saved in this browser. Make it yours has the live preview, every Signal setting, Ask Pal, and saving to your NeuroPal.</p>
    </div>
  );
}
