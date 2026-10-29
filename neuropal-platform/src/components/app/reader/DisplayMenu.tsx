"use client";
// "Aa": the reading look, right where you read (the same preferences as
// Settings): text size, line spacing, font, background — and, on narrow
// screens, the text / original pages switch.
import Link from "next/link";
import { useId, useRef } from "react";
import { ROUTES } from "@/components/app/common/appNav";
import { PlusIcon } from "@/components/app/common/icons";
import { READER_BACKGROUND_LABELS, READER_FONTS, setPrefs, usePrefs, type ReaderBackground } from "@/lib/neuropal/prefs";
import { usePopover } from "./hooks";
import { MinusIcon, TextSizeIcon } from "./icons";
import styles from "./reader.module.css";

const BACKGROUNDS: ReaderBackground[] = ["theme", "paper", "sepia", "dusk", "night"];

export function DisplayMenu({ pagesToggle }: { pagesToggle?: { pages: boolean; onChange: (pages: boolean) => void } | null }) {
  const prefs = usePrefs();
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = usePopover(panel, trigger);
  const fonts = READER_FONTS.filter((f) => !f.local || prefs.readerFont === f.family);

  return (
    <div className={styles.popWrap}>
      <button
        ref={trigger}
        type="button"
        className="np-btn np-btn--ghost np-btn--small"
        aria-expanded={open}
        aria-controls={`${id}-display`}
        onClick={() => setOpen(!open)}
        title="Reading look"
      >
        <TextSizeIcon />
        <span className={styles.btnText}>Display</span>
      </button>
      {open ? (
        <div ref={panel} id={`${id}-display`} className={`${styles.popover} ${styles.popDown}`} role="group" aria-labelledby={`${id}-title`}>
          <h2 id={`${id}-title`} className={styles.popTitle}>
            Reading look
          </h2>

          {pagesToggle ? (
            <div className={styles.field}>
              <p id={`${id}-view`} className="np-field-label">
                Show
              </p>
              <div className={styles.chipRow} role="group" aria-labelledby={`${id}-view`}>
                <button type="button" className="np-chip" aria-pressed={!pagesToggle.pages} onClick={() => pagesToggle.onChange(false)}>
                  Text
                </button>
                <button type="button" className="np-chip" aria-pressed={pagesToggle.pages} onClick={() => pagesToggle.onChange(true)}>
                  Original pages
                </button>
              </div>
            </div>
          ) : null}

          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <span id={`${id}-size`} className="np-field-label">
                Text size
              </span>
              <span className={styles.fieldValue}>{prefs.readerFontSize} px</span>
            </div>
            <div className={styles.scrubRow}>
              <button
                type="button"
                className={styles.tBtn}
                onClick={() => setPrefs({ readerFontSize: prefs.readerFontSize - 1 })}
                aria-label="Smaller text"
              >
                <MinusIcon />
              </button>
              <input
                type="range"
                className={`np-range ${styles.scrub}`}
                min={14}
                max={40}
                step={1}
                value={prefs.readerFontSize}
                aria-labelledby={`${id}-size`}
                aria-valuetext={`${prefs.readerFontSize} pixels`}
                onChange={(e) => setPrefs({ readerFontSize: Number(e.target.value) })}
              />
              <button
                type="button"
                className={styles.tBtn}
                onClick={() => setPrefs({ readerFontSize: prefs.readerFontSize + 1 })}
                aria-label="Larger text"
              >
                <PlusIcon />
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <label htmlFor={`${id}-lh`} className="np-field-label">
                Line spacing
              </label>
              <span className={styles.fieldValue}>{prefs.readerLineHeight.toFixed(1)}</span>
            </div>
            <input
              id={`${id}-lh`}
              type="range"
              className="np-range"
              min={1.2}
              max={2.4}
              step={0.1}
              value={prefs.readerLineHeight}
              onChange={(e) => setPrefs({ readerLineHeight: Number(e.target.value) })}
            />
          </div>

          <div className={styles.field}>
            <p id={`${id}-font`} className="np-field-label">
              Font
            </p>
            <div className={styles.chipRow} role="group" aria-labelledby={`${id}-font`}>
              {fonts.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="np-chip"
                  aria-pressed={prefs.readerFont === f.family}
                  onClick={() => setPrefs({ readerFont: f.family })}
                  style={f.family ? { fontFamily: f.family } : undefined}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <p id={`${id}-bg`} className="np-field-label">
              Background
            </p>
            <div className={styles.chipRow} role="group" aria-labelledby={`${id}-bg`}>
              {BACKGROUNDS.map((b) => (
                <button key={b} type="button" className="np-chip" aria-pressed={prefs.readerBackground === b} onClick={() => setPrefs({ readerBackground: b })}>
                  {READER_BACKGROUND_LABELS[b]}
                </button>
              ))}
            </div>
          </div>

          <p className={styles.popFoot}>
            <Link href={`${ROUTES.settings}#reading`}>More reading settings</Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
