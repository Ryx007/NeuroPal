"use client";
// /app/read/?doc=<id>[&ask=1] — opens one document: the text reader, the
// EPUB reader, or a plain status while the server is still processing it
// (checked every few seconds) or couldn't. A failed PDF can still be read as
// its original pages.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { announce } from "@/components/app/common/announce";
import { ROUTES } from "@/components/app/common/appNav";
import { ArrowLeftIcon, RefreshIcon } from "@/components/app/common/icons";
import { ApiError, errorText } from "@/lib/neuropal/client";
import { getDocument, getProgress, getText, reingestDocument } from "@/lib/neuropal/documents";
import { failureWords, percent, stageWords, typeLabel } from "@/lib/neuropal/reader/format";
import { PROCESSING, type DocumentStatus, type DocumentText, type NPDocument, type ReadingProgress } from "@/lib/neuropal/types";
import { EpubReader } from "./EpubReader";
import { PagesView } from "./PagesView";
import { TextReader } from "./TextReader";
import styles from "./reader.module.css";

const POLL_MS = 3000;
const isProcessing = (s: string | undefined) => PROCESSING.includes(s as DocumentStatus);

export function ReaderView() {
  const params = useSearchParams();
  const id = params.get("doc");
  const ask = params.get("ask") === "1";
  if (!id) return <NoDocument />;
  return <DocumentReader key={id} id={id} initialAsk={ask} />;
}

function NoDocument() {
  return (
    <section className={styles.state} aria-labelledby="reader-none">
      <h1 id="reader-none" className={`np-display ${styles.stateTitle}`}>
        Reader
      </h1>
      <p>No document is open. Choose one from your library to read or listen to it.</p>
      <div className={styles.stateActions}>
        <Link href={ROUTES.library} className="np-btn">
          Open the library
        </Link>
      </div>
    </section>
  );
}

function useDocTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} · NeuroPal`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

function DocumentReader({ id, initialAsk }: { id: string; initialAsk: boolean }) {
  const [doc, setDoc] = useState<NPDocument | null>(null);
  const [error, setError] = useState<{ notFound: boolean; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lastStatus = useRef<string | null>(null);
  useDocTitle(doc?.title ?? null);

  // The document, and again every few seconds while the server works on it.
  useEffect(() => {
    let alive = true;
    let timer = 0;
    let loaded = false;
    const ctrl = new AbortController();
    const load = async () => {
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(load, POLL_MS);
        return;
      }
      try {
        const d = await getDocument(id, ctrl.signal);
        if (!alive) return;
        loaded = true;
        setDoc(d);
        setError(null);
        if (lastStatus.current && isProcessing(lastStatus.current) && d.status === "ready") announce(`“${d.title}” is ready.`);
        if (lastStatus.current && isProcessing(lastStatus.current) && d.status === "failed") announce(`“${d.title}” couldn’t be processed.`);
        lastStatus.current = d.status;
        if (isProcessing(d.status)) timer = window.setTimeout(load, POLL_MS);
      } catch (e) {
        if (!alive || ctrl.signal.aborted) return;
        const notFound = e instanceof ApiError && (e.status === 404 || e.status === 400);
        setError({ notFound, message: errorText(e) });
        // A refresh that failed while the document is open: keep checking, slower.
        if (!notFound && loaded) timer = window.setTimeout(load, POLL_MS * 3);
      }
    };
    void load();
    return () => {
      alive = false;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [id, attempt]);

  if (error?.notFound) {
    return (
      <section className={styles.state} aria-labelledby="reader-missing">
        <h1 id="reader-missing" className={`np-display ${styles.stateTitle}`}>
          Not in your library
        </h1>
        <p>This document isn’t in your library any more, or the link is wrong.</p>
        <div className={styles.stateActions}>
          <Link href={ROUTES.library} className="np-btn">
            <ArrowLeftIcon />
            Back to the library
          </Link>
        </div>
      </section>
    );
  }
  if (!doc) {
    return error ? (
      <section className={styles.state} aria-labelledby="reader-error">
        <h1 id="reader-error" className={`np-display ${styles.stateTitle}`}>
          Couldn’t open this document
        </h1>
        <p className="np-hazard" role="alert">
          <span>
            <b>Problem: </b>
            {error.message}
          </span>
        </p>
        <div className={styles.stateActions}>
          <button type="button" className="np-btn" onClick={() => setAttempt((a) => a + 1)}>
            <RefreshIcon />
            Try again
          </button>
          <Link href={ROUTES.library} className="np-btn np-btn--ghost">
            Back to the library
          </Link>
        </div>
      </section>
    ) : (
      <Opening />
    );
  }

  const askUnavailable =
    doc.status === "ready"
      ? null
      : doc.status === "failed"
        ? "Ask needs the text to be processed first. Try processing it again from the library."
        : "Ask is available when processing completes.";

  if (doc.type === "epub") return <EpubReader doc={doc} docId={id} initialAsk={initialAsk} askUnavailable={askUnavailable} />;
  if (doc.status === "ready") return <TextLoader doc={doc} id={id} initialAsk={initialAsk} />;
  return <NotReady doc={doc} id={id} onRetried={() => setAttempt((a) => a + 1)} />;
}

function Opening() {
  return (
    <section className={styles.state} aria-labelledby="reader-opening" aria-busy="true">
      <h1 id="reader-opening" className={`np-display ${styles.stateTitle}`}>
        Opening your document
      </h1>
      <div className={styles.skeleton} aria-hidden="true">
        <span style={{ width: "92%" }} />
        <span style={{ width: "86%" }} />
        <span style={{ width: "95%" }} />
        <span style={{ width: "60%" }} />
      </div>
    </section>
  );
}

function TextLoader({ doc, id, initialAsk }: { doc: NPDocument; id: string; initialAsk: boolean }) {
  const [data, setData] = useState<{ text: DocumentText; progress: ReadingProgress | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([getText(id, ctrl.signal), getProgress(id, ctrl.signal).catch(() => null)])
      .then(([text, progress]) => {
        setData({ text, progress });
        setError(null);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(errorText(e));
      });
    return () => ctrl.abort();
  }, [id, attempt]);

  if (error) {
    return (
      <section className={styles.state} aria-labelledby="reader-text-error">
        <h1 id="reader-text-error" className={`np-display ${styles.stateTitle}`}>
          {doc.title}
        </h1>
        <p className="np-hazard" role="alert">
          <span>
            <b>Problem: </b>The text couldn’t be loaded. {error}
          </span>
        </p>
        <div className={styles.stateActions}>
          <button type="button" className="np-btn" onClick={() => setAttempt((a) => a + 1)}>
            <RefreshIcon />
            Try again
          </button>
          <Link href={ROUTES.library} className="np-btn np-btn--ghost">
            Back to the library
          </Link>
        </div>
      </section>
    );
  }
  if (!data) return <Opening />;
  return <TextReader doc={doc} docId={id} data={data.text} progress={data.progress} initialAsk={initialAsk} askUnavailable={null} />;
}

function NotReady({ doc, id, onRetried }: { doc: NPDocument; id: string; onRetried: () => void }) {
  const ids = useId();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showPages, setShowPages] = useState(false);
  const failed = doc.status === "failed";
  const pages = (doc.type === "pdf" || doc.type === "arxiv") && (doc.pageCount ?? 0) > 0;
  const words = failed ? failureWords(doc as NPDocument & { ingestStage?: string }) : null;
  const ingest = typeof doc.progress === "number" ? doc.progress : 0;

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await reingestDocument(id);
      announce("Processing again.");
      onRetried();
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.state} aria-labelledby={`${ids}-t`}>
      <p className="np-label">
        {typeLabel(doc.type)} · {failed ? "Not ready" : "Processing"}
      </p>
      <h1 id={`${ids}-t`} className={`np-display ${styles.stateTitle}`}>
        {doc.title}
      </h1>
      {failed && words ? (
        <>
          <p>{words.summary}</p>
          {words.detail ? (
            <details className={styles.detail}>
              <summary>What the server said</summary>
              <code>{words.detail}</code>
            </details>
          ) : null}
        </>
      ) : (
        <>
          <p>
            This document is still being processed. The text will appear here as soon as it’s ready — this page checks by itself.
          </p>
          <p className={styles.detail} role="status">
            {stageWords(doc.status)}
            {ingest > 0 ? ` · ${percent(ingest)}` : ""}
          </p>
          <div className={styles.meter} aria-hidden="true">
            <div className={styles.meterFill} style={{ width: `${Math.max(4, Math.round(ingest * 100))}%` }} />
          </div>
        </>
      )}
      <div className={styles.stateActions}>
        {failed ? (
          <button type="button" className="np-btn" onClick={() => void retry()} aria-disabled={busy || undefined}>
            <RefreshIcon />
            {busy ? "Starting…" : "Try processing again"}
          </button>
        ) : null}
        {pages ? (
          <button type="button" className="np-btn np-btn--ghost" aria-expanded={showPages} onClick={() => setShowPages((v) => !v)}>
            {showPages ? "Hide the original pages" : "Show the original pages"}
          </button>
        ) : null}
        <Link href={ROUTES.library} className="np-btn np-btn--ghost">
          Back to the library
        </Link>
      </div>
      {note ? (
        <p className="np-hazard" role="alert">
          <span>
            <b>Problem: </b>
            {note}
          </span>
        </p>
      ) : null}
      {showPages ? (
        <PagesView docId={id} pageCount={doc.pageCount ?? 0} startPage={1} followPage={null} onPageInView={() => undefined} />
      ) : null}
    </section>
  );
}
