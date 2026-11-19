"use client";
// Reading: how the reader sounds and looks. A live preview reacts to font,
// size, spacing and background; "Hear it" plays a sample with the chosen
// voice, speed and pitch. Stored in this browser (prefs.ts); the reader reads
// the same values.
import { useId, useState } from "react";
import {
  DEFAULT_PREFS,
  rateForWpm,
  READER_BACKGROUND_LABELS,
  READER_FONTS,
  readerSurface,
  setPrefs,
  usePrefs,
  type ReaderBackground,
} from "@/lib/neuropal/prefs";
import { ChoiceChips, Switch } from "../common/bits";
import { PlayIcon, StopIcon } from "../common/icons";
import { fontInstalled, speakSample, speechAvailable, stopSpeaking, useVoices } from "../common/speech";
import styles from "./settings.module.css";

const PREVIEW =
  "In squeezed states of light, the noise of the electric field at certain phases falls below that of the vacuum state.";
const SAMPLE = "This is how the reader will sound with this voice.";

function Range({
  label,
  value,
  min,
  max,
  step,
  format,
  spoken,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  spoken: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className={styles.range}>
      <div className={styles.rangeHead}>
        <label htmlFor={id} className="np-field-label">
          {label}
        </label>
        <output htmlFor={id} className={styles.rangeValue}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        className="np-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={spoken(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function ReadingSection() {
  const id = useId();
  const prefs = usePrefs();
  const voices = useVoices();
  const [hasDyslexic] = useState(() => fontInstalled("OpenDyslexic"));
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState("");
  const surface = readerSurface(prefs.readerBackground);
  const fonts = READER_FONTS.filter((f) => !f.local || hasDyslexic || prefs.readerFont === f.family);
  const fontValue = READER_FONTS.find((f) => f.family === prefs.readerFont)?.id ?? "skin";

  // English voices first (the app's language), then the rest by language.
  const mine = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const other = voices.filter((v) => !mine.includes(v)).sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  const chosenMissing = prefs.voiceURI && !voices.some((v) => v.uri === prefs.voiceURI);

  const hear = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    const ok = speakSample(SAMPLE, {
      voiceURI: prefs.voiceURI,
      rate: rateForWpm(prefs.wordsPerMinute),
      pitch: prefs.pitch,
      onEnd: () => setPlaying(false),
    });
    if (!ok) {
      setNote("This browser can’t read aloud.");
      return;
    }
    setNote("");
    setPlaying(true);
  };

  return (
    <div className={styles.sectionBody}>
      <div
        className={styles.preview}
        style={{
          fontFamily: prefs.readerFont ?? undefined,
          fontSize: `${prefs.readerFontSize}px`,
          lineHeight: prefs.readerLineHeight,
          background: surface?.background,
          color: surface?.color,
        }}
      >
        <p className={styles.previewLabel} style={surface ? { color: surface.muted } : undefined}>
          Preview
        </p>
        <p>{PREVIEW}</p>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.stack}>
          <div>
            <label htmlFor={`${id}-voice`} className="np-field-label">
              Voice
            </label>
            <div className={styles.voiceRow}>
              <select
                id={`${id}-voice`}
                className={`np-input ${styles.select}`}
                value={prefs.voiceURI ?? ""}
                aria-describedby={`${id}-voice-help`}
                onChange={(e) => setPrefs({ voiceURI: e.target.value || null })}
              >
                <option value="">Browser default</option>
                {chosenMissing && prefs.voiceURI ? <option value={prefs.voiceURI}>Saved voice (not on this device)</option> : null}
                {mine.length ? (
                  <optgroup label="This language">
                    {mine.map((v) => (
                      <option key={v.uri} value={v.uri}>
                        {v.name} ({v.lang}){v.local ? "" : " · online"}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {other.length ? (
                  <optgroup label="Other languages">
                    {other.map((v) => (
                      <option key={v.uri} value={v.uri}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <button type="button" className="np-btn np-btn--ghost" onClick={hear} aria-disabled={!speechAvailable()}>
                {playing ? <StopIcon /> : <PlayIcon />}
                {playing ? "Stop" : "Hear it"}
              </button>
            </div>
            <p id={`${id}-voice-help`} className="np-help">
              {voices.length
                ? `${voices.length} voices on this device. Voices called “Enhanced”, “Natural” or “Neural” sound most human; your system settings can add more.`
                : speechAvailable()
                  ? "No voices listed yet. Your system settings can add some."
                  : "This browser can’t read aloud."}
            </p>
            <p className={styles.note} role="status">
              {note}
            </p>
          </div>
          <Range
            label="Speed"
            value={prefs.wordsPerMinute}
            min={80}
            max={450}
            step={10}
            format={(v) => `${v} wpm`}
            spoken={(v) => `${v} words per minute`}
            onChange={(v) => setPrefs({ wordsPerMinute: v })}
          />
          <Range
            label="Pitch"
            value={prefs.pitch}
            min={0.5}
            max={2}
            step={0.1}
            format={(v) => v.toFixed(1)}
            spoken={(v) => `${v.toFixed(1)}${v === 1 ? ", normal" : v < 1 ? ", lower" : ", higher"}`}
            onChange={(v) => setPrefs({ pitch: Math.round(v * 10) / 10 })}
          />
          <div className={styles.switchRow}>
            <div>
              <p id={`${id}-follow`} className={styles.switchLabel}>
                Follow along
              </p>
              <p id={`${id}-follow-help`} className="np-help">
                Keeps the spoken word in view while the reader reads aloud.
              </p>
            </div>
            <Switch checked={prefs.followAlong} labelledBy={`${id}-follow`} describedBy={`${id}-follow-help`} onChange={(v) => setPrefs({ followAlong: v })} />
          </div>
        </div>

        <div className={styles.stack}>
          <ChoiceChips
            label="Reader font"
            value={fontValue}
            choices={fonts.map((f) => ({ value: f.id, label: f.label }))}
            onChange={(v) => setPrefs({ readerFont: READER_FONTS.find((f) => f.id === v)?.family ?? null })}
          />
          {!hasDyslexic ? <p className={styles.note}>OpenDyslexic shows up here once it is installed on this device.</p> : null}
          <Range
            label="Text size"
            value={prefs.readerFontSize}
            min={14}
            max={40}
            step={1}
            format={(v) => `${v} px`}
            spoken={(v) => `${v} pixels`}
            onChange={(v) => setPrefs({ readerFontSize: v })}
          />
          <Range
            label="Line spacing"
            value={prefs.readerLineHeight}
            min={1.2}
            max={2.4}
            step={0.1}
            format={(v) => v.toFixed(1)}
            spoken={(v) => `${v.toFixed(1)} times the text size`}
            onChange={(v) => setPrefs({ readerLineHeight: Math.round(v * 10) / 10 })}
          />
          <ChoiceChips
            label="Background"
            value={prefs.readerBackground}
            choices={(Object.keys(READER_BACKGROUND_LABELS) as ReaderBackground[]).map((b) => ({ value: b, label: READER_BACKGROUND_LABELS[b] }))}
            onChange={(readerBackground) => setPrefs({ readerBackground })}
          />
          <div className={styles.row}>
            <button
              type="button"
              className="np-btn np-btn--ghost np-btn--small"
              onClick={() =>
                setPrefs({
                  readerFont: DEFAULT_PREFS.readerFont,
                  readerFontSize: DEFAULT_PREFS.readerFontSize,
                  readerLineHeight: DEFAULT_PREFS.readerLineHeight,
                  readerBackground: DEFAULT_PREFS.readerBackground,
                })
              }
            >
              Reset the reading look
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
