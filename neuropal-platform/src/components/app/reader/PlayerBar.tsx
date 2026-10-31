"use client";
// The docked read-aloud player: position in the chapter, previous/next
// sentence and paragraph, play, speed, and the voice settings. Shared by the
// text reader and the EPUB reader.
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Kbd, Switch } from "@/components/app/common/bits";
import { PlusIcon } from "@/components/app/common/icons";
import { setPrefs, usePrefs } from "@/lib/neuropal/prefs";
import { useCursorValue, type Cursor } from "@/lib/neuropal/reader/cursor";
import { shortMinutes } from "@/lib/neuropal/reader/format";
import { groupVoices, useVoices, voiceLabel } from "@/lib/neuropal/reader/voices";
import { usePopover, type ReadAloudApi } from "./hooks";
import {
  LocateIcon,
  MinusIcon,
  ParagraphBackIcon,
  ParagraphNextIcon,
  PauseGlyph,
  PlayGlyph,
  SentenceBackIcon,
  SentenceNextIcon,
  SlidersIcon,
} from "./icons";
import styles from "./reader.module.css";

export interface PlayerChapters {
  count: number;
  /** Chapter index of a word. */
  of: (word: number) => number;
  /** Title and word range [start, end) of a chapter. */
  get: (index: number) => { title: string; start: number; end: number };
}

interface Props {
  reader: ReadAloudApi;
  cursor: Cursor;
  total: number;
  chapters: PlayerChapters;
  lang: string;
  disabled?: boolean;
  /** A note shown while idle ("Picked up where you left off."). */
  note?: string | null;
  onSeek: (word: number) => void;
  onPrevSentence: () => void;
  onNextSentence: () => void;
  onPrevParagraph: () => void;
  onNextParagraph: () => void;
  onOpenChapters: () => void;
  onLocate: () => void;
  /** Shown above the player while reading, when the spoken word is off screen. */
  returnButton?: ReactNode;
  playerRef?: RefObject<HTMLDivElement | null>;
}

const STEP = 10;

export function PlayerBar({
  reader,
  cursor,
  total,
  chapters,
  lang,
  disabled: disabledProp,
  note,
  onSeek,
  onPrevSentence,
  onNextSentence,
  onPrevParagraph,
  onNextParagraph,
  onOpenChapters,
  onLocate,
  returnButton,
  playerRef,
}: Props) {
  const prefs = usePrefs();
  const id = useId();
  const word = useCursorValue(cursor, (i) => i);
  const chapterIndex = Math.min(Math.max(0, chapters.of(word)), Math.max(0, chapters.count - 1));
  const ch = chapters.get(chapterIndex);
  const span = Math.max(1, ch.end - ch.start);
  const inChapter = Math.min(Math.max(word - ch.start, 0), span - 1);
  const pct = Math.round((inChapter / Math.max(1, span - 1)) * 100);
  const [drag, setDrag] = useState<number | null>(null);
  const dragging = useRef(false);
  const playing = reader.state === "playing";
  const wpm = prefs.wordsPerMinute;
  const disabled = disabledProp || !reader.supported || total === 0;

  const status =
    reader.state === "error"
      ? reader.message
      : !reader.supported
        ? "Read-aloud isn’t available in this browser."
        : playing
          ? "Reading aloud"
          : reader.state === "paused"
            ? "Paused"
            : reader.state === "ended"
              ? "Finished. Play starts again from the top."
              : note || "Press play to listen";

  const chapterWords = `Chapter ${chapterIndex + 1} of ${chapters.count}`;
  const valueText = `${pct}% through ${ch.title || chapterWords}, ${shortMinutes(span - inChapter, wpm)} left`;

  return (
    <div ref={playerRef} className={`np-panel ${styles.player}`} role="region" aria-label="Read aloud">
      {returnButton}
      <div className={styles.scrubRow}>
        <span className={styles.scrubLabel}>
          <button type="button" onClick={onOpenChapters}>
            {chapters.count > 1 ? `Ch ${chapterIndex + 1}/${chapters.count}` : "Chapter"}
            <span className="np-sr-only">
              {`: ${chapterWords}${ch.title ? `, ${ch.title}` : ""}. Open the chapter list`}
            </span>
          </button>{" "}
          · {pct}%
        </span>
        <input
          type="range"
          className={`np-range ${styles.scrub}`}
          min={ch.start}
          max={Math.max(ch.start, ch.end - 1)}
          step={1}
          value={drag ?? Math.min(word, Math.max(ch.start, ch.end - 1))}
          disabled={total === 0}
          aria-label="Position in this chapter"
          aria-valuetext={valueText}
          onPointerDown={() => {
            dragging.current = true;
          }}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (dragging.current) setDrag(v);
            else onSeek(v); // keyboard: every step is a move
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            onSeek(Number((e.target as HTMLInputElement).value));
            setDrag(null);
          }}
          onPointerCancel={() => {
            dragging.current = false;
            setDrag(null);
          }}
        />
        <span className={styles.scrubLeft}>{shortMinutes(span - inChapter, wpm)} left</span>
      </div>

      <div className={styles.controls}>
        <div className={styles.statusSide}>
          <p className={styles.statusText} data-tone={reader.state === "error" ? "error" : undefined}>
            {status}
          </p>
        </div>

        <div className={styles.transport} role="group" aria-label="Playback">
          <button type="button" className={styles.tBtn} onClick={onPrevParagraph} disabled={total === 0} aria-label="Previous paragraph" title="Previous paragraph (Shift + Up)">
            <ParagraphBackIcon />
          </button>
          <button type="button" className={styles.tBtn} onClick={onPrevSentence} disabled={total === 0} aria-label="Previous sentence" title="Previous sentence (Left arrow)">
            <SentenceBackIcon />
          </button>
          <button
            type="button"
            className={`np-btn ${styles.playBtn}`}
            onClick={reader.toggle}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause (Space)" : "Play (Space)"}
          >
            {playing ? <PauseGlyph /> : <PlayGlyph />}
          </button>
          <button type="button" className={styles.tBtn} onClick={onNextSentence} disabled={total === 0} aria-label="Next sentence" title="Next sentence (Right arrow)">
            <SentenceNextIcon />
          </button>
          <button type="button" className={styles.tBtn} onClick={onNextParagraph} disabled={total === 0} aria-label="Next paragraph" title="Next paragraph (Shift + Down)">
            <ParagraphNextIcon />
          </button>
        </div>

        <div className={styles.toolsSide}>
          <div className={`${styles.stepper} ${styles.desktopOnly}`} role="group" aria-label="Reading speed">
            <button type="button" onClick={() => setPrefs({ wordsPerMinute: wpm - STEP })} aria-label="Slower" title="Slower">
              <MinusIcon />
            </button>
            <span className={styles.stepValue} aria-live="polite">
              {wpm} wpm
            </span>
            <button type="button" onClick={() => setPrefs({ wordsPerMinute: wpm + STEP })} aria-label="Faster" title="Faster">
              <PlusIcon />
            </button>
          </div>
          <button type="button" className={styles.tBtn} onClick={onLocate} disabled={total === 0} aria-label="Go to the reading position" title="Go to the reading position">
            <LocateIcon />
          </button>
          <VoiceSettings lang={lang} id={id} />
        </div>
      </div>

      <p className={`${styles.hints} ${styles.desktopOnly}`}>
        {prefs.shortcuts ? (
          <>
            <span>
              <Kbd>Space</Kbd> play or pause
            </span>
            <span>
              <Kbd>←</Kbd>
              <Kbd>→</Kbd> sentence
            </span>
            <span>
              <Kbd>Shift</Kbd>+<Kbd>↑</Kbd>
              <Kbd>↓</Kbd> paragraph
            </span>
          </>
        ) : null}
        <span>Click a word to read from there</span>
      </p>
    </div>
  );
}

function VoiceSettings({ lang, id }: { lang: string; id: string }) {
  const prefs = usePrefs();
  const voices = useVoices();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = usePopover(panel, trigger);
  const { matching, others } = groupVoices(voices, lang);
  const chosenMissing = prefs.voiceURI !== null && voices.length > 0 && !voices.some((v) => v.voiceURI === prefs.voiceURI);

  return (
    <div className={styles.popWrap}>
      <button
        ref={trigger}
        type="button"
        className={styles.tBtn}
        aria-expanded={open}
        aria-controls={`${id}-voice`}
        onClick={() => setOpen(!open)}
        aria-label="Voice and speed"
        title="Voice and speed"
      >
        <SlidersIcon />
      </button>
      {open ? (
        <div ref={panel} id={`${id}-voice`} className={`${styles.popover} ${styles.popUp}`} role="group" aria-labelledby={`${id}-voice-title`}>
          <h2 id={`${id}-voice-title`} className={styles.popTitle}>
            Voice and speed
          </h2>

          <div className={styles.field}>
            <label htmlFor={`${id}-voice-select`} className="np-field-label">
              Voice
            </label>
            <select
              id={`${id}-voice-select`}
              className={styles.select}
              value={chosenMissing ? "" : (prefs.voiceURI ?? "")}
              onChange={(e) => setPrefs({ voiceURI: e.target.value || null })}
            >
              <option value="">Browser default</option>
              {matching.length ? (
                <optgroup label="For this text">
                  {matching.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {voiceLabel(v)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {others.length ? (
                <optgroup label="Other languages">
                  {others.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {voiceLabel(v)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            {voices.length === 0 ? <p className="np-help">No voices listed yet. The browser’s default voice is used.</p> : null}
            {chosenMissing ? <p className="np-help">The voice chosen in Settings isn’t on this device, so the default is used.</p> : null}
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <label htmlFor={`${id}-wpm`} className="np-field-label">
                Speed
              </label>
              <span className={styles.fieldValue}>{prefs.wordsPerMinute} words a minute</span>
            </div>
            <input
              id={`${id}-wpm`}
              type="range"
              className="np-range"
              min={80}
              max={450}
              step={10}
              value={prefs.wordsPerMinute}
              aria-valuetext={`${prefs.wordsPerMinute} words a minute`}
              onChange={(e) => setPrefs({ wordsPerMinute: Number(e.target.value) })}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHead}>
              <label htmlFor={`${id}-pitch`} className="np-field-label">
                Pitch
              </label>
              <span className={styles.fieldValue}>{prefs.pitch.toFixed(1)}</span>
            </div>
            <input
              id={`${id}-pitch`}
              type="range"
              className="np-range"
              min={0.5}
              max={2}
              step={0.1}
              value={prefs.pitch}
              onChange={(e) => setPrefs({ pitch: Number(e.target.value) })}
            />
          </div>

          <div className={styles.inlineSwitch}>
            <span id={`${id}-follow`}>Follow the voice</span>
            <Switch checked={prefs.followAlong} labelledBy={`${id}-follow`} onChange={(v) => setPrefs({ followAlong: v })} />
          </div>
          <p className="np-help">Keeps the spoken word in view. Scrolling yourself pauses it for a few seconds.</p>
        </div>
      ) : null}
    </div>
  );
}
