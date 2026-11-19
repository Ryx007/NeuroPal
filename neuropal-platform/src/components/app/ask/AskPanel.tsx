"use client";
// Ask: chat with the open document. Answers come from the document and cite
// where (chips that scroll the reader to the passage and flash it). History
// comes from the server; the waiting state, errors and copying are here.
// Answers are untrusted text: rendered through the safe Markdown renderer.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { announce } from "@/components/app/common/announce";
import { CheckIcon, CloseIcon, RefreshIcon, SendIcon } from "@/components/app/common/icons";
import { ask, chatHistory } from "@/lib/neuropal/documents";
import { askErrorText } from "@/lib/neuropal/reader/format";
import { Markdown, markdownToPlain } from "@/lib/neuropal/reader/markdown";
import type { Citation } from "@/lib/neuropal/types";
import { CopyIcon, SparkIcon } from "../reader/icons";
import styles from "./ask.module.css";

export const STARTERS = [
  "Explain this in plain language",
  "Why does this matter?",
  "Give a concrete example",
  "What should I remember for an exam?",
];

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  /** A question that wasn't answered. */
  error?: string;
}

export interface AskPanelProps {
  docId: string;
  titleId: string;
  /** null when Ask can be used; else why not, in plain words. */
  unavailable: string | null;
  onClose: () => void;
  /** Scroll the reader to a cited passage; false when it can't be found. */
  onCite: (c: Citation) => boolean | Promise<boolean>;
  /** "p. 4 · 4 Limits" */
  citeLabel: (c: Citation, n: number) => string;
}

let localId = 0;

export function AskPanel({ docId, titleId, unavailable, onClose, onCite, citeLabel }: AskPanelProps) {
  const id = useId();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<"loading" | "ok" | "error">("loading");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyTry, setHistoryTry] = useState(0);
  const [question, setQuestion] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    chatHistory(docId, undefined, ctrl.signal)
      .then((rows) => {
        const list: Msg[] = (Array.isArray(rows) ? rows : [])
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m, i) => ({
            id: String(m._id ?? m.id ?? `h${i}`),
            role: m.role as "user" | "assistant",
            content: m.content,
            citations: Array.isArray(m.citations) ? m.citations : [],
          }));
        setMessages((now) => (now.length ? [...list, ...now] : list));
        setHistory("ok");
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setHistory("error");
        setHistoryError(askErrorText(e));
      });
    return () => ctrl.abort();
  }, [docId, historyTry]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Newest at the bottom, in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "Still";
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages.length, waiting]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim().slice(0, 2000);
      if (!q || waiting || unavailable) return;
      const qid = `local-${++localId}`;
      setMessages((m) => [...m, { id: qid, role: "user", content: q, citations: [] }]);
      setQuestion("");
      setWaiting(true);
      setNote(null);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await ask(docId, q, undefined, ctrl.signal);
        const answer = typeof r?.answer === "string" ? r.answer : "";
        setMessages((m) => [
          ...m,
          { id: `local-${++localId}`, role: "assistant", content: answer || "No answer came back.", citations: Array.isArray(r?.citations) ? r.citations : [] },
        ]);
        const plain = markdownToPlain(answer);
        announce(`Answer ready. ${plain.slice(0, 220)}${plain.length > 220 ? "…" : ""}`);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        const msg = askErrorText(e);
        setMessages((m) => m.map((x) => (x.id === qid ? { ...x, error: msg } : x)));
        announce(`Not answered. ${msg}`);
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
        if (!ctrl.signal.aborted) setWaiting(false);
      }
    },
    [docId, waiting, unavailable],
  );

  const retry = (m: Msg) => {
    setMessages((list) => list.filter((x) => x.id !== m.id));
    void send(m.content);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(question);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(question);
    }
  };

  const copy = async (m: Msg) => {
    try {
      await navigator.clipboard.writeText(markdownToPlain(m.content));
      setCopied(m.id);
      announce("Answer copied.");
      window.setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 2200);
    } catch {
      announce("Copying didn’t work in this browser. Select the text to copy it.");
    }
  };

  const cite = (c: Citation) => {
    void Promise.resolve(onCite(c)).then((found) => {
      if (!found) {
        const text = "That passage couldn’t be found in the text shown here.";
        setNote(text);
        announce(text);
      } else setNote(null);
    });
  };

  const hasThread = messages.length > 0;

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.head}>
        <span className={styles.headIcon} aria-hidden="true">
          <SparkIcon />
        </span>
        <h2 id={titleId} className={styles.title}>
          Ask about this document
        </h2>
        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={onClose} aria-label="Close Ask">
          <CloseIcon />
        </button>
      </div>

      <div ref={scrollRef} className={styles.scroll}>
        {!hasThread ? (
          <div className={styles.intro}>
            <p>Answers are grounded in this document and cite the pages they come from.</p>
            {unavailable ? (
              <p className={styles.note}>{unavailable}</p>
            ) : (
              <>
                <p id={`${id}-starters`} className="np-label">
                  Try one
                </p>
                <ul className={styles.starters} aria-labelledby={`${id}-starters`}>
                  {STARTERS.map((s) => (
                    <li key={s}>
                      <button type="button" className={styles.starter} onClick={() => void send(s)} disabled={waiting}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {history === "loading" ? <p className={styles.note}>Loading earlier questions…</p> : null}
          </div>
        ) : null}

        {history === "error" ? (
          <div className={styles.error}>
            <p>Earlier questions couldn’t be loaded. {historyError}</p>
            <div>
              <button
                type="button"
                className="np-btn np-btn--ghost np-btn--small"
                onClick={() => {
                  setHistory("loading");
                  setHistoryTry((t) => t + 1);
                }}
              >
                <RefreshIcon />
                Try again
              </button>
            </div>
          </div>
        ) : null}

        {hasThread ? (
          <ol className={styles.thread}>
            {messages.map((m) =>
              m.role === "user" ? (
                <li key={m.id} className={styles.q}>
                  <span className={styles.who}>You asked</span>
                  {m.content}
                  {m.error ? (
                    <span className={styles.error}>
                      <span className="np-hazard" role="alert">
                        <span>
                          <b>Not answered: </b>
                          {m.error}
                        </span>
                      </span>
                      <span>
                        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => retry(m)} disabled={waiting}>
                          <RefreshIcon />
                          Try again
                        </button>
                      </span>
                    </span>
                  ) : null}
                </li>
              ) : (
                <Answer key={m.id} m={m} copied={copied === m.id} onCopy={() => void copy(m)} onCite={cite} citeLabel={citeLabel} />
              ),
            )}
            {waiting ? (
              <li className={styles.waiting} aria-hidden="true">
                <span className={styles.dots}>
                  <span />
                  <span />
                  <span />
                </span>
                Reading the document…
              </li>
            ) : null}
          </ol>
        ) : null}
        <p className="np-sr-only" role="status">
          {waiting ? "Reading the document…" : ""}
        </p>
        {note ? <p className={styles.note}>{note}</p> : null}
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        <label htmlFor={`${id}-q`} className="np-sr-only">
          Your question
        </label>
        <div className={styles.inputRow}>
          <textarea
            ref={inputRef}
            id={`${id}-q`}
            className={styles.input}
            rows={1}
            value={question}
            maxLength={2000}
            placeholder={unavailable ? "Ask is available when processing completes" : "Ask anything about this document…"}
            disabled={!!unavailable}
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              setQuestion(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(168, el.scrollHeight + 2)}px`;
            }}
            onKeyDown={onKeyDown}
            data-autofocus
          />
          <button type="submit" className={`np-btn ${styles.send}`} disabled={!question.trim() || waiting || !!unavailable}>
            <SendIcon />
            Ask
          </button>
        </div>
        <p id={`${id}-hint`} className={styles.hint}>
          Enter sends · Shift + Enter for a new line
        </p>
      </form>
    </section>
  );
}

function Answer({
  m,
  copied,
  onCopy,
  onCite,
  citeLabel,
}: {
  m: Msg;
  copied: boolean;
  onCopy: () => void;
  onCite: (c: Citation) => void;
  citeLabel: (c: Citation, n: number) => string;
}) {
  // One chip per distinct source (the same page and passage twice is one).
  const sources = useMemo(() => {
    const seen = new Set<string>();
    const out: { c: Citation; n: number; label: string }[] = [];
    m.citations.forEach((c, i) => {
      const label = citeLabel(c, i + 1);
      const key = `${label}|${(c.excerpt || "").slice(0, 40)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ c, n: i + 1, label });
    });
    return out;
  }, [m.citations, citeLabel]);

  return (
    <li className={styles.a}>
      <span className={styles.who}>Answer</span>
      <Markdown
        text={m.content}
        className={styles.md}
        mathClassName={styles.mathInline}
        citeClassName={styles.cite}
        citationCount={m.citations.length}
        citationLabel={(n) => citeLabel(m.citations[n - 1], n)}
        onCitation={(n) => {
          const c = m.citations[n - 1];
          if (c) onCite(c);
        }}
      />
      {sources.length ? (
        <div className={styles.sources}>
          <span className={styles.sourcesLabel}>Sources</span>
          <ul className={styles.chips}>
            {sources.map((s) => (
              <li key={`${s.n}`}>
                <button type="button" className={styles.chip} onClick={() => onCite(s.c)} title={s.c.excerpt || undefined}>
                  <span className="np-sr-only">Source </span>
                  <span className={styles.chipNum}>{s.n}</span>
                  <span className="np-sr-only">: </span>
                  <span className={styles.chipText}>{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={onCopy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy answer"}
        </button>
      </div>
    </li>
  );
}
