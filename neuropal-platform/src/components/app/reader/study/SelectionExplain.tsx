"use client";
// "Explain this": select a passage in the text and a small button appears
// under it (above it when the player is in the way); it opens Study on
// Explain with that passage. A pointer and touch shortcut: the keyboard way
// is Study's "Explain the sentence being read".
import { useEffect, useRef, useState, type RefObject } from "react";
import { ExplainIcon } from "./icons";
import styles from "./study.module.css";

/** A selected word is enough ("plenoptic"); a select-all of a book is cut to this. */
const MAX_CHARS = 20000;

export function SelectionExplain({
  containerRef,
  enabled,
  onExplain,
}: {
  /** Only selections inside this element count. */
  containerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onExplain: (passage: string) => void;
}) {
  const [box, setBox] = useState<{ left: number; top: number; text: string } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let timer = 0;
    let mouseDown = false;

    const measure = () => {
      frame = 0;
      const root = containerRef.current;
      const sel = window.getSelection();
      if (mouseDown || !root || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        setBox(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const text = sel.toString().replace(/\s+/g, " ").trim();
      if (!root.contains(range.commonAncestorContainer) || text.length < 2) {
        setBox(null);
        return;
      }
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      const whole = range.getBoundingClientRect();
      const first = rects[0] ?? whole;
      const last = rects[rects.length - 1] ?? whole;
      const player = document.querySelector('[role="region"][aria-label="Read aloud"]')?.getBoundingClientRect().top ?? window.innerHeight;
      const limit = Math.min(window.innerHeight, player) - 60;
      const under = last.bottom + 10 <= limit;
      const x = under ? (last.left + last.right) / 2 : (first.left + first.right) / 2;
      setBox({
        left: Math.max(96, Math.min(window.innerWidth - 96, x)),
        top: under ? last.bottom + 10 : Math.max(8, first.top - 58),
        text: text.slice(0, MAX_CHARS),
      });
    };
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (delay) timer = window.setTimeout(() => (frame = window.requestAnimationFrame(measure)), delay);
      else frame = window.requestAnimationFrame(measure);
    };

    // A mouse selection shows when the button is released; touch and keyboard
    // selections once they have settled for a moment.
    const onSelection = () => schedule(mouseDown ? 0 : 250);
    const onDown = (e: PointerEvent) => {
      if (barRef.current?.contains(e.target as Node)) return;
      if (e.pointerType === "mouse" && e.button === 0) mouseDown = true;
      setBox(null);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !mouseDown) return;
      mouseDown = false;
      schedule(0);
    };
    const onMove = () => schedule(0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBox(null);
    };
    document.addEventListener("selectionchange", onSelection);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("selectionchange", onSelection);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
      window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled, containerRef]);

  if (!enabled || !box) return null;
  return (
    <div ref={barRef} className={styles.selBar} style={{ left: box.left, top: box.top }}>
      <button
        type="button"
        className="np-btn np-btn--small"
        // Keep the selection (and focus) where they are until the click lands.
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          const text = box.text;
          window.getSelection()?.removeAllRanges();
          setBox(null);
          onExplain(text);
        }}
      >
        <ExplainIcon />
        Explain this
      </button>
    </div>
  );
}
