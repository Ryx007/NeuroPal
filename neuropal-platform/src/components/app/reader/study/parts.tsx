"use client";
// Pieces every study tool shares: the "working on it" box with Cancel, the
// failure callout, Copy, the sources of a result, and when it was made.
import { useEffect, useMemo, useRef, useState } from "react";
import { announce } from "@/components/app/common/announce";
import { CheckIcon, CloseIcon } from "@/components/app/common/icons";
import { useNow } from "@/components/app/common/useNow";
import { relativeTime } from "@/lib/neuropal/reader/format";
import { markdownToPlain } from "@/lib/neuropal/reader/markdown";
import type { StudyFailure } from "@/lib/neuropal/study";
import type { Citation } from "@/lib/neuropal/types";
import { CopyIcon } from "../icons";
import styles from "./study.module.css";

/** Slower than this, the box says it is still going. */
const SLOW_S = 25;

/** A box that appears below the fold of the panel (under "Make a new deck") scrolls itself into view. */
function useIntoView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "Still";
    ref.current?.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  }, []);
  return ref;
}

export function Working({ title, startedAt, onCancel }: { title: string; startedAt: number; onCancel: () => void }) {
  const now = useNow(1000);
  const slow = now > 0 && (now - startedAt) / 1000 >= SLOW_S;
  const ref = useIntoView<HTMLDivElement>();
  return (
    <div ref={ref} className={styles.working}>
      <p className={styles.workingTitle}>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {title}
      </p>
      <p className={styles.workingNote}>
        {slow
          ? "Still working. Long documents take longer — it will be here when it’s done, even if you close this panel."
          : "This can take a little while. You can keep reading or listening meanwhile."}
      </p>
      <div>
        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={onCancel}>
          <CloseIcon />
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Words only: the tool's own button says "Try again" when trying again can help. */
export function Failure({ failure }: { failure: StudyFailure }) {
  const ref = useIntoView<HTMLParagraphElement>();
  return (
    <p ref={ref} className={`np-hazard ${styles.failure}`}>
      <span>
        <b>Not made: </b>
        {failure.text}
      </span>
    </p>
  );
}

export function CopyButton({ text, what }: { text: string; what: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdownToPlain(text));
      setCopied(true);
      announce(`${what} copied.`);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      announce("Copying didn’t work in this browser. Select the text to copy it.");
    }
  };
  return (
    <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => void copy()}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** "Intuitive summary · made 3 min ago" */
export function Made({ label, at, extra }: { label: string; at: string; extra?: string }) {
  const now = useNow(30_000);
  const when = now ? relativeTime(at, now) : null;
  return <p className={styles.made}>{[label, when ? `made ${when}` : "", extra ?? ""].filter(Boolean).join(" · ")}</p>;
}

/** One chip per distinct source; a chip scrolls the reader to the passage and flashes it. */
export function Sources({
  citations,
  citeLabel,
  onCite,
}: {
  citations: Citation[];
  citeLabel: (c: Citation, n: number) => string;
  onCite: (c: Citation) => boolean | Promise<boolean>;
}) {
  const [note, setNote] = useState<string | null>(null);
  const sources = useMemo(() => {
    const seen = new Set<string>();
    const out: { c: Citation; n: number; label: string }[] = [];
    citations.forEach((c, i) => {
      const label = citeLabel(c, i + 1);
      const key = `${label}|${(c.excerpt || "").slice(0, 40)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ c, n: i + 1, label });
    });
    return out;
  }, [citations, citeLabel]);
  if (!sources.length) return null;

  const cite = (c: Citation) => {
    void Promise.resolve(onCite(c)).then((found) => {
      if (found) setNote(null);
      else {
        const text = "That passage couldn’t be found in the text shown here.";
        setNote(text);
        announce(text);
      }
    });
  };

  return (
    <div className={styles.sources}>
      <span className={styles.sourcesLabel}>Sources</span>
      <ul className={styles.chips}>
        {sources.map((s) => (
          <li key={s.n}>
            <button type="button" className={styles.chip} onClick={() => cite(s.c)} title={s.c.excerpt || undefined}>
              <span className="np-sr-only">Source </span>
              <span className={styles.chipNum}>{s.n}</span>
              <span className="np-sr-only">: </span>
              <span className={styles.chipText}>{s.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  );
}
