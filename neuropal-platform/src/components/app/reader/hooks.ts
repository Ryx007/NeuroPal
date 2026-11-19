"use client";
// Reader plumbing: the read-aloud engine as a hook, the shell's sticky
// chrome as CSS insets, element sizes as CSS variables, and the
// resume-point saver.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { saveProgress, saveProgressOnExit } from "@/lib/neuropal/documents";
import { rateForWpm, type AppPrefs } from "@/lib/neuropal/prefs";
import type { Cursor } from "@/lib/neuropal/reader/cursor";
import { ReadAloud, speechSupported, type PlayState, type SpeechStream } from "@/lib/neuropal/reader/tts";

// ---- read aloud ---------------------------------------------------------------

export interface ReadAloudApi {
  state: PlayState;
  message: string | null;
  supported: boolean;
  play: (from?: number) => void;
  pause: () => void;
  toggle: () => void;
  /** Move the cursor (keeps reading when playing). */
  seek: (index: number) => void;
}

/**
 * Read-aloud for one word stream. The engine moves `cursor`; this hook owns
 * nothing else. Speech stops when the stream changes and on unmount.
 */
export function useReadAloud(stream: SpeechStream | null, cursor: Cursor, prefs: AppPrefs, lang: string, onEnded?: () => void): ReadAloudApi {
  const [state, setState] = useState<PlayState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const [engine] = useState(
    () =>
      new ReadAloud({
        onWord: (i) => cursor.set(i),
        onState: (s, m) => {
          setState(s);
          setMessage(s === "error" ? (m ?? null) : null);
        },
        rateFor: rateForWpm,
      }),
  );

  useEffect(() => {
    engine.setEndedHandler(onEnded ?? null);
    return () => engine.setEndedHandler(null);
  }, [engine, onEnded]);

  useEffect(() => {
    engine.setStream(stream);
    if (stream) engine.seek(cursor.get());
  }, [engine, stream, cursor]);

  // Voice, speed and pitch apply mid-sentence after a short pause in the changes.
  const { voiceURI, wordsPerMinute, pitch } = prefs;
  useEffect(() => {
    const t = window.setTimeout(() => engine.setSettings({ voiceURI, wordsPerMinute, pitch, lang }), 350);
    return () => window.clearTimeout(t);
  }, [engine, voiceURI, wordsPerMinute, pitch, lang]);

  useEffect(() => () => engine.destroy(), [engine]);

  // A page going away never leaves a voice talking.
  useEffect(() => {
    const stop = () => engine.pause();
    window.addEventListener("pagehide", stop);
    return () => window.removeEventListener("pagehide", stop);
  }, [engine]);

  const play = useCallback(
    (from?: number) => {
      engine.setSettings({ voiceURI, wordsPerMinute, pitch, lang });
      engine.play(from ?? cursor.get());
    },
    [engine, cursor, voiceURI, wordsPerMinute, pitch, lang],
  );
  const pause = useCallback(() => engine.pause(), [engine]);
  const toggle = useCallback(() => {
    if (engine.playing) engine.pause();
    else play(state === "ended" ? 0 : cursor.get());
  }, [engine, play, state, cursor]);
  const seek = useCallback((i: number) => engine.seek(i), [engine]);

  return { state, message, supported: speechSupported(), play, pause, toggle, seek };
}

// ---- the shell's sticky chrome --------------------------------------------------

function stickyAncestor(el: Element | null, stop: Element): Element | null {
  let e: Element | null = el;
  for (let depth = 0; e && e !== document.body && depth < 8; depth++, e = e.parentElement) {
    if (stop.contains(e)) return null;
    const pos = getComputedStyle(e).position;
    if (pos === "fixed" || pos === "sticky") return e;
  }
  return null;
}

/**
 * Writes --reader-top / --reader-bottom on `root`: how much of the viewport
 * the app's own sticky bars cover at the top and bottom (the bottom tab bar
 * on narrow screens), so the reader's sticky bar and player sit clear of them.
 */
export function useShellInsets(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const w = window.innerWidth;
      const h = window.innerHeight;
      let top = 0;
      let bottom = 0;
      for (const x of [w / 2, w - 24]) {
        for (const e of document.elementsFromPoint(x, h - 2)) {
          const s = stickyAncestor(e, el);
          if (s) {
            const r = s.getBoundingClientRect();
            if (r.bottom >= h - 2 && r.top > h / 2) bottom = Math.max(bottom, h - r.top);
            break;
          }
        }
        for (const e of document.elementsFromPoint(x, 1)) {
          const s = stickyAncestor(e, el);
          if (s) {
            const r = s.getBoundingClientRect();
            if (r.top <= 1 && r.bottom < h / 2 && r.width > w / 2) top = Math.max(top, r.bottom);
            break;
          }
        }
      }
      el.style.setProperty("--reader-bottom", `${Math.round(bottom)}px`);
      el.style.setProperty("--reader-top", `${Math.round(top)}px`);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    schedule();
    const t = window.setTimeout(schedule, 400);
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      window.clearTimeout(t);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [root]);
}

/** Keeps a CSS variable on `target` equal to `source`'s height (px). */
export function useHeightVar(source: RefObject<HTMLElement | null>, target: RefObject<HTMLElement | null>, name: string) {
  useEffect(() => {
    const s = source.current;
    const t = target.current;
    if (!s || !t || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => t.style.setProperty(name, `${Math.round(s.getBoundingClientRect().height)}px`));
    ro.observe(s);
    return () => ro.disconnect();
  }, [source, target, name]);
}

/** An element's width, as state (0 until measured). */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? el.getBoundingClientRect().width);
      setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

// ---- resume point ----------------------------------------------------------------

export interface ProgressPoint {
  progress: number;
  lastWordIndex: number;
  lastPage?: number | null;
}

/**
 * Saves the resume point: a few seconds after the position settles, at most
 * every 20 s while it keeps moving, when the tab is hidden, when the page
 * goes away, and on unmount. Also counts time spent reading (tab visible).
 */
export function useProgressSaver(docId: string, getPoint: () => ProgressPoint | null, enabled: boolean) {
  const getRef = useRef(getPoint);
  useEffect(() => {
    getRef.current = getPoint;
  }, [getPoint]);
  const last = useRef<string>("");
  const timer = useRef<number | null>(null);
  const firstChange = useRef(0);
  const visibleSince = useRef<number | null>(null);
  const spent = useRef(0);

  const flush = useCallback(
    (exiting = false) => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      firstChange.current = 0;
      const p = getRef.current();
      if (!p || !docId) return;
      const key = `${p.lastWordIndex}|${p.lastPage ?? ""}`;
      // Seconds the tab was visible since the last save (the server caps each at 600).
      const now = performance.now();
      if (visibleSince.current !== null) {
        spent.current += (now - visibleSince.current) / 1000;
        visibleSince.current = document.visibilityState === "visible" ? now : null;
      }
      const timeSpentSec = Math.min(600, Math.round(spent.current));
      spent.current -= timeSpentSec;
      if (key === last.current && timeSpentSec < 5) return;
      last.current = key;
      const body = { ...p, progress: Math.max(0, Math.min(1, p.progress)), ...(timeSpentSec > 0 ? { timeSpentSec } : {}) };
      if (exiting) saveProgressOnExit(docId, body);
      else saveProgress(docId, body).catch(() => undefined);
    },
    [docId],
  );

  /** Call whenever the position moves. */
  const touch = useCallback(() => {
    if (!enabled) return;
    const now = performance.now();
    if (!firstChange.current) firstChange.current = now;
    if (timer.current !== null) window.clearTimeout(timer.current);
    const waited = now - firstChange.current;
    timer.current = window.setTimeout(() => flush(false), waited > 20000 ? 0 : 2500);
  }, [enabled, flush]);

  useEffect(() => {
    if (!enabled) return;
    visibleSince.current = document.visibilityState === "visible" ? performance.now() : null;
    const onVis = () => {
      if (document.visibilityState === "hidden") flush(false);
      else visibleSince.current = performance.now();
    };
    const onHide = () => flush(true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      flush(false);
    };
  }, [enabled, flush]);

  return { touch, flush };
}

// ---- small things ------------------------------------------------------------------

/** Escape and outside clicks close a popover; returns props for the trigger. */
export function usePopover(panel: RefObject<HTMLElement | null>, trigger: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || trigger.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, panel, trigger]);
  return [open, setOpen] as const;
}

/** True while focus is in a text field (keys belong to the field then). */
export function typingIn(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

/** Targets where Space/arrows already mean something. */
export function keysBelongTo(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  if (!t) return false;
  if (typingIn(t)) return true;
  return !!t.closest('button, a[href], summary, [role="button"], [role="slider"], [role="tab"], [role="radio"], [role="menuitem"], [role="option"], [role="switch"], input, select, textarea, audio, video');
}
