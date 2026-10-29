"use client";
// Pal: name, talk style (with a sample line), voice, and whether Pal points
// you to people. Part of your look (appearance.pal), saved in this browser.
import { useId, useState, type FormEvent } from "react";
import { useAppearance } from "@/components/AppearanceProvider";
import { normalizeAppearance } from "@/lib/appearance";
import { appearanceStore } from "@/lib/appearanceStore";
import { normalizePal, PAL_OPTIONS, palLine, palSay, palVoice, TALK_STYLES, type PalLook } from "@/lib/neuropal/look";
import { usePrefs } from "@/lib/neuropal/prefs";
import { announce } from "../common/announce";
import { ChoiceChips, Switch } from "../common/bits";
import { PlayIcon, StopIcon } from "../common/icons";
import { PalAvatar, palImageLabel } from "../common/PalAvatar";
import { speakSample, speechAvailable, stopSpeaking } from "../common/speech";
import styles from "./settings.module.css";

// Pal and the Home layout aren't part of the look's undo history: they are
// written straight to the stored appearance (stamped, like every change).
function savePal(patch: Partial<PalLook>) {
  const a = appearanceStore.get();
  appearanceStore.set(normalizeAppearance({ ...a, pal: { ...a.pal, ...patch }, updatedAt: new Date().toISOString() }));
}

export function PalSection() {
  const id = useId();
  const { appearance } = useAppearance();
  const prefs = usePrefs();
  const pal = normalizePal(appearance.pal);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const name = nameDraft ?? pal.name;

  const commitName = (e?: FormEvent) => {
    e?.preventDefault();
    if (nameDraft == null) return;
    const n = nameDraft.trim().slice(0, 14);
    setNameDraft(null);
    if (!n || n === pal.name) return;
    savePal({ name: n });
    announce(`Saved. Your Pal is called ${n}.`);
  };

  const hear = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const v = palVoice(pal);
    if (speakSample(palSay(pal, "helloOkay"), { voiceURI: prefs.voiceURI, rate: v.rate, pitch: v.pitch, onEnd: () => setSpeaking(false) })) setSpeaking(true);
  };

  return (
    <div className={styles.sectionBody}>
      <div className={styles.palRow}>
        <PalAvatar pal={pal} size={132} speaking={speaking} label={palImageLabel(pal)} />
        <div className={styles.says}>
          <p className="np-label">{pal.name} says</p>
          <p className={styles.saysLine} aria-live="polite">
            {palLine(pal, "the CPI notes")}
          </p>
        </div>
      </div>

      <form className={styles.nameForm} onSubmit={commitName}>
        <div className={styles.grow}>
          <label htmlFor={`${id}-name`} className="np-field-label">
            Name
          </label>
          <input
            id={`${id}-name`}
            className="np-input"
            type="text"
            maxLength={14}
            autoComplete="off"
            value={name}
            aria-describedby={`${id}-name-help`}
            onChange={(e) => setNameDraft(e.target.value.slice(0, 14))}
            onBlur={() => commitName()}
          />
          <p id={`${id}-name-help`} className="np-help">
            Up to 14 characters. Saved when you leave the field or press Enter.
          </p>
        </div>
      </form>

      <ChoiceChips
        label="Talk style"
        value={pal.talk}
        choices={TALK_STYLES.map((t) => ({ value: t, label: t }))}
        onChange={(talk) => savePal({ talk })}
      />

      <div className={styles.voicePick}>
        <ChoiceChips label="Voice" value={pal.voice} choices={Object.keys(PAL_OPTIONS.voice).map((v) => ({ value: v, label: v }))} onChange={(voice) => savePal({ voice })} />
        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={hear} aria-disabled={!speechAvailable()}>
          {speaking ? <StopIcon /> : <PlayIcon />}
          {speaking ? "Stop" : `Hear ${pal.name}`}
        </button>
      </div>

      <div className={styles.switchRow}>
        <div>
          <p id={`${id}-people`} className={styles.switchLabel}>
            Points you to people
          </p>
          <p id={`${id}-people-help`} className="np-help">
            {pal.people
              ? `When you seem stuck, ${pal.name} suggests a person or a quiet co-working room before more chat.`
              : `Off. ${pal.name} only mentions people when you ask.`}
          </p>
        </div>
        <Switch checked={pal.people} labelledBy={`${id}-people`} describedBy={`${id}-people-help`} onChange={(people) => savePal({ people })} />
      </div>
      <p className={styles.note}>
        Shape, colour and face are in the NeuroPal app’s Pal builder. Heavy daily chatbot use goes with more loneliness (Fang et al.,
        2025), so {pal.name} keeps chats short.
      </p>
    </div>
  );
}
