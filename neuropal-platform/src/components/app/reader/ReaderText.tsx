"use client";
// The document as text: chapter headings, paragraphs, real page marks.
// Only the paragraph under the reading cursor is split into word spans (and
// re-renders as the voice moves); every other paragraph is plain text, so a
// whole book stays light. Screen readers get ordinary headings and
// paragraphs. A click on any word starts reading from it.
import { Fragment, memo, useMemo, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import type { Cursor } from "@/lib/neuropal/reader/cursor";
import { useCursorValue } from "@/lib/neuropal/reader/cursor";
import { latexToUnicode, tokenizeMathParagraph } from "@/lib/neuropal/reader/math";
import type { ReaderModel, ReaderParagraph } from "@/lib/neuropal/reader/sections";
import styles from "./reader.module.css";

interface Props {
  model: ReaderModel;
  cursor: Cursor;
  articleRef: RefObject<HTMLElement | null>;
  /** Start reading at this word. */
  onWord: (index: number) => void;
  labelledBy: string;
  /** The voice is speaking (the word is filled; otherwise just marked). */
  playing: boolean;
}

export function ReaderText({ model, cursor, articleRef, onWord, labelledBy, playing }: Props) {
  const onClick = (e: ReactMouseEvent<HTMLElement>) => {
    if (e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.detail > 1) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return;
    const i = wordAt(e, model);
    if (i >= 0) onWord(i);
  };

  return (
    // Clicks are a pointer shortcut; the keyboard has the player's buttons and shortcuts.
    <article ref={articleRef} className={styles.article} aria-labelledby={labelledBy} onClick={onClick} data-playing={playing || undefined}>
      {model.sections.map((s) => (
        <div key={s.index} className={styles.group} data-section={s.index}>
          {s.headingInText ? null : s.synthetic ? (
            model.sections.length > 1 && /^Part \d+ of \d+$/.test(s.title) ? (
              <h2 className={styles.partLabel} data-section-head={s.index}>
                {s.title}
              </h2>
            ) : null
          ) : (
            <h2 className={styles.chapterTitle} data-section-head={s.index}>
              {s.title}
            </h2>
          )}
          {model.paragraphs.slice(s.first, s.last).map((p) => (
            <ParagraphBlock key={p.index} para={p} model={model} cursor={cursor} page={model.pageStarts.get(p.index) ?? null} />
          ))}
        </div>
      ))}
    </article>
  );
}

const ParagraphBlock = memo(function ParagraphBlock({
  para,
  model,
  cursor,
  page,
}: {
  para: ReaderParagraph;
  model: ReaderModel;
  cursor: Cursor;
  page: number | null;
}) {
  const active = useCursorValue(cursor, (i) => (model.paraOf[i] === para.index ? i : -1));
  return (
    <>
      {page !== null ? <p className={styles.pageMark}>Page {page}</p> : null}
      <Paragraph para={para} active={active} />
    </>
  );
});

function Paragraph({ para, active }: { para: ReaderParagraph; active: number }) {
  const tokens = useMemo(() => (para.kind === "text" ? tokenizeMathParagraph(para.text) : []), [para.kind, para.text]);
  const current = active >= 0;

  if (para.kind !== "text") {
    const shown = para.kind === "math" && para.latex ? latexToUnicode(para.latex) : para.text;
    return (
      <p
        className={styles.equation}
        data-p={para.index}
        data-w={para.start}
        data-on={current || undefined}
        tabIndex={-1}
        title={para.latex ?? undefined}
      >
        <span className="np-sr-only">Equation: </span>
        {shown}
      </p>
    );
  }

  const Tag = para.asHeading ? "h2" : "p";
  const className = para.asHeading ? styles.chapterTitle : styles.para;

  if (current) {
    return (
      <Tag className={className} data-p={para.index} data-current="true" tabIndex={-1}>
        {tokens.map((t, k) => {
          const i = para.start + k;
          return (
            <Fragment key={k}>
              <span className={`${styles.w} ${t.latex ? styles.math : ""}`} data-w={i} data-on={i === active || undefined} title={t.latex ?? undefined}>
                {t.display}
              </span>
              {k < tokens.length - 1 ? " " : null}
            </Fragment>
          );
        })}
      </Tag>
    );
  }

  // Not under the cursor: runs of plain words (one text node each) and math islands.
  const parts: { kind: "run" | "math"; first: number; text: string; latex?: string }[] = [];
  tokens.forEach((t, k) => {
    const i = para.start + k;
    const last = parts[parts.length - 1];
    if (t.latex) parts.push({ kind: "math", first: i, text: t.display, latex: t.latex });
    else if (last && last.kind === "run") last.text += ` ${t.display}`;
    else parts.push({ kind: "run", first: i, text: t.display });
  });
  return (
    <Tag className={className} data-p={para.index} tabIndex={-1}>
      {parts.map((part, k) => (
        <Fragment key={k}>
          {part.kind === "math" ? (
            <span className={`${styles.w} ${styles.math}`} data-w={part.first} title={part.latex}>
              {part.text}
            </span>
          ) : (
            <span className={styles.run} data-run={part.first}>
              {part.text}
            </span>
          )}
          {k < parts.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}

// ---- which word was clicked ----------------------------------------------------

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof d.caretPositionFromPoint === "function") {
    const p = d.caretPositionFromPoint(x, y);
    if (p) return { node: p.offsetNode, offset: p.offset };
  }
  if (typeof d.caretRangeFromPoint === "function") {
    const r = d.caretRangeFromPoint(x, y);
    if (r) return { node: r.startContainer, offset: r.startOffset };
  }
  return null;
}

function wordAt(e: ReactMouseEvent<HTMLElement>, model: ReaderModel): number {
  const target = e.target as HTMLElement;
  const w = target.closest<HTMLElement>("[data-w]");
  if (w && w.dataset.w !== undefined) return Number(w.dataset.w);
  const run = target.closest<HTMLElement>("[data-run]");
  if (run && run.dataset.run !== undefined) {
    const first = Number(run.dataset.run);
    const pos = caretAt(e.clientX, e.clientY);
    const text = run.textContent ?? "";
    if (pos && run.contains(pos.node) && pos.node.nodeType === Node.TEXT_NODE) {
      const before = text.slice(0, pos.offset);
      return first + (before.split(" ").length - 1);
    }
    return first;
  }
  const p = target.closest<HTMLElement>("[data-p]");
  if (p && p.dataset.p !== undefined) {
    const para = model.paragraphs[Number(p.dataset.p)];
    return para ? para.start : -1;
  }
  return -1;
}
