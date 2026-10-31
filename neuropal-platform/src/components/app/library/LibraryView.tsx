"use client";
// The library: every document, searchable, sortable, filterable; uploads
// with progress (button, or drop files anywhere on the page); live status
// while the server processes something (checked every few seconds, never
// while the tab is hidden). Opening a card goes to the reader.
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { announce } from "@/components/app/common/announce";
import { CloseIcon, PlusIcon, RefreshIcon } from "@/components/app/common/icons";
import { useNow } from "@/components/app/common/useNow";
import { errorText } from "@/lib/neuropal/client";
import { listDocuments, reingestDocument } from "@/lib/neuropal/documents";
import { setPrefs, usePrefs, type LibrarySort } from "@/lib/neuropal/prefs";
import { docId, PROCESSING, type DocumentStatus, type NPDocument } from "@/lib/neuropal/types";
import { DocIcon, SearchIcon, UploadIcon } from "../reader/icons";
import { DocCard, readHref } from "./DocCard";
import { DeleteDialog, RenameDialog } from "./DocDialogs";
import {
  ACCEPT_ATTR,
  ACCEPTED_WORDS,
  addFiles,
  cancelUpload,
  clearFinished,
  dismissUpload,
  onUploadDone,
  onUploadFailed,
  retryUpload,
  sizeLabel,
  useUploads,
  type UploadItem,
} from "./uploads";
import styles from "./library.module.css";

type Filter = "all" | "progress" | "unread" | "pdf" | "epub" | "other";

const FILTERS: { key: Filter; label: string; match: (d: NPDocument) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "progress", label: "In progress", match: (d) => (d.readingProgress ?? 0) > 0 && (d.readingProgress ?? 0) < 0.995 },
  { key: "unread", label: "Not started", match: (d) => !(d.readingProgress ?? 0) },
  { key: "pdf", label: "PDF", match: (d) => d.type === "pdf" || d.type === "arxiv" },
  { key: "epub", label: "EPUB", match: (d) => d.type === "epub" },
  { key: "other", label: "Other", match: (d) => !["pdf", "arxiv", "epub"].includes(String(d.type)) },
];

const POLL_MS = 3000;
const isProcessing = (d: NPDocument) => PROCESSING.includes(d.status as DocumentStatus);
const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

export function LibraryView() {
  const ids = useId();
  const prefs = usePrefs();
  const now = useNow(60_000);
  const sort = prefs.librarySort;
  const uploads = useUploads();
  const [docs, setDocs] = useState<NPDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshTick, setRefreshTick] = useState(0);
  /** The search the list on screen answers (null before the first answer). */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState<NPDocument | null>(null);
  const [deleting, setDeleting] = useState<NPDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const statuses = useRef(new Map<string, string>());
  const inFlight = useRef<AbortController | null>(null);

  // Search on the server, a moment after typing stops.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (search: string) => {
      inFlight.current?.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;
      try {
        const list = await listDocuments(search || undefined, ctrl.signal);
        if (ctrl.signal.aborted) return;
        const arr = Array.isArray(list) ? list : [];
        // Say when something finishes processing (not on every refresh).
        for (const d of arr) {
          const before = statuses.current.get(docId(d));
          if (before && PROCESSING.includes(before as DocumentStatus) && d.status === "ready") announce(`“${d.title}” is ready to read.`);
          if (before && PROCESSING.includes(before as DocumentStatus) && d.status === "failed") announce(`“${d.title}” couldn’t be processed.`);
          statuses.current.set(docId(d), String(d.status));
        }
        setDocs(arr);
        setLoadedFor(search);
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError(errorText(e));
      } finally {
        if (inFlight.current === ctrl) inFlight.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    // From a task, not the effect itself: the list arrives asynchronously anyway.
    const t = window.setTimeout(() => void load(q), 0);
    return () => window.clearTimeout(t);
  }, [q, refreshTick, load]);
  const searching = query.trim() !== q || (loadedFor !== null && loadedFor !== q);

  // While anything is processing, check again every few seconds (not while hidden).
  const anyProcessing = !!docs?.some(isProcessing);
  useEffect(() => {
    if (!anyProcessing) return;
    let timer = 0;
    const tick = () => {
      if (document.visibilityState === "visible") void load(q);
      timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void load(q);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [anyProcessing, q, load]);

  useEffect(() => () => inFlight.current?.abort(), []);

  // Finished uploads join the list at once.
  useEffect(() => {
    const offDone = onUploadDone((doc, item) => {
      statuses.current.set(docId(doc), String(doc.status));
      setDocs((list) => [doc, ...(list ?? []).filter((d) => docId(d) !== docId(doc))]);
      announce(`“${item.name}” added. It’s being processed.`);
    });
    const offFail = onUploadFailed((item) => announce(`“${item.name}” wasn’t uploaded. ${item.error ?? ""}`));
    return () => {
      offDone();
      offFail();
    };
  }, []);

  const queueFiles = useCallback((files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const { accepted, rejected } = addFiles(list);
    if (accepted) {
      setQuery("");
      setFilter("all");
    }
    announce(
      [accepted ? `Uploading ${accepted} ${accepted === 1 ? "file" : "files"}.` : "", rejected ? `${rejected} can’t be read by NeuroPal.` : ""].filter(Boolean).join(" "),
    );
  }, []);

  // Drop files anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      queueFiles(e.dataTransfer?.files ?? null);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [queueFiles]);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    const list = (docs ?? []).filter(f.match);
    const byTitle = (a: NPDocument, b: NPDocument) => (a.title || "").localeCompare(b.title || "", undefined, { numeric: true, sensitivity: "base" });
    if (sort === "title") return [...list].sort(byTitle);
    if (sort === "newest") return [...list].sort((a, b) => time(b.createdAt) - time(a.createdAt));
    return [...list].sort((a, b) => time(b.lastReadAt) - time(a.lastReadAt) || time(b.createdAt) - time(a.createdAt));
  }, [docs, filter, sort]);

  const pickFiles = () => fileInput.current?.click();
  const total = docs?.length ?? 0;
  const searchActive = q.length > 0 || filter !== "all";
  const filterLabel = FILTERS.find((x) => x.key === filter)?.label ?? "All";

  let countText = "";
  if (docs) {
    if (q) countText = `${visible.length} ${visible.length === 1 ? "match" : "matches"} for “${q}”${filter !== "all" ? ` in ${filterLabel}` : ""}`;
    else if (filter !== "all") countText = `${visible.length} of ${total} in ${filterLabel}`;
    else countText = `${total} ${total === 1 ? "document" : "documents"}`;
  }

  return (
    <section className={styles.page} aria-labelledby={`${ids}-title`}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <h1 id={`${ids}-title`} className={`np-display ${styles.title}`}>
            Library
          </h1>
          <p className={styles.lead}>Your papers and books. Open one to read it, listen to it, or ask about it.</p>
        </div>
        <div className={styles.headActions}>
          <span className={styles.dropHint}>or drop files anywhere here</span>
          <button type="button" className="np-btn" onClick={pickFiles}>
            <UploadIcon />
            Add documents
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              queueFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <label htmlFor={`${ids}-q`} className="np-sr-only">
            Search your library
          </label>
          <span className={styles.searchIcon} aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            id={`${ids}-q`}
            type="search"
            className={`np-input ${styles.searchInput}`}
            placeholder="Search titles"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
              }
            }}
            autoComplete="off"
          />
        </div>
        <div className={styles.sort}>
          <label htmlFor={`${ids}-sort`} className={styles.sortLabel}>
            Sort
          </label>
          <select id={`${ids}-sort`} className={styles.select} value={sort} onChange={(e) => setPrefs({ librarySort: e.target.value as LibrarySort })}>
            <option value="recent">Recently read</option>
            <option value="newest">Newest first</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
        <div className={styles.filters} role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="np-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <UploadsPanel items={uploads} />

      <p className={styles.count} role="status">
        {searching && query.trim() ? "Searching…" : countText}
      </p>

      {error && !docs ? (
        <div className={`np-panel ${styles.empty}`} role="alert">
          <h2 className={`np-display ${styles.emptyTitle}`}>The library couldn’t be loaded</h2>
          <p className={styles.emptyText}>{error}</p>
          <button type="button" className="np-btn" onClick={() => setRefreshTick((t) => t + 1)}>
            <RefreshIcon />
            Try again
          </button>
        </div>
      ) : null}

      {error && docs ? (
        <p className="np-hazard" role="alert">
          <span>
            <b>Problem: </b>Couldn’t refresh the library. {error}{" "}
            <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => setRefreshTick((t) => t + 1)}>
              Try again
            </button>
          </span>
        </p>
      ) : null}

      {!docs && !error ? (
        <ul className={styles.grid} aria-hidden="true">
          {[0, 1, 2].map((k) => (
            <li key={k} className={styles.skeletonCard} />
          ))}
        </ul>
      ) : null}

      {docs && total === 0 && !q ? (
        <div className={`np-panel ${styles.empty}`}>
          <h2 className={`np-display ${styles.emptyTitle}`}>Your library is empty</h2>
          <p className={styles.emptyText}>
            Add a paper or a book — {ACCEPTED_WORDS}. NeuroPal reads it aloud with each word highlighted, and answers questions from it. You can also drop
            files anywhere on this page.
          </p>
          <button type="button" className="np-btn" onClick={pickFiles}>
            <UploadIcon />
            Add documents
          </button>
        </div>
      ) : null}

      {docs && visible.length === 0 && (total > 0 || q) && searchActive ? (
        <div className={`np-panel ${styles.empty}`}>
          <h2 className={`np-display ${styles.emptyTitle}`}>Nothing matches</h2>
          <p className={styles.emptyText}>
            Nothing{q ? ` called “${q}”` : ""} in {filterLabel}.
          </p>
          <button
            type="button"
            className="np-btn np-btn--ghost"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            <CloseIcon />
            Clear search and filters
          </button>
        </div>
      ) : null}

      {docs && visible.length > 0 ? (
        <ul className={styles.grid}>
          {visible.map((d) => (
            <DocCard
              key={docId(d)}
              doc={d}
              wpm={prefs.wordsPerMinute}
              now={now}
              onRename={() => setRenaming(d)}
              onDelete={() => setDeleting(d)}
              onRetry={async () => {
                try {
                  await reingestDocument(docId(d));
                  statuses.current.set(docId(d), "pending");
                  setDocs((list) => (list ?? []).map((x) => (docId(x) === docId(d) ? { ...x, status: "pending", progress: 0, ingestError: undefined } : x)));
                  announce(`Processing “${d.title}” again.`);
                } catch (e) {
                  announce(`Couldn’t start processing again. ${errorText(e)}`);
                }
              }}
            />
          ))}
          {!searchActive ? (
            <li>
              <button type="button" className={styles.addCard} onClick={pickFiles}>
                <span className={styles.addIcon} aria-hidden="true">
                  <PlusIcon />
                </span>
                <span className={styles.addTitle}>Add documents</span>
                <span className={styles.addHelp}>Or drop files anywhere on this page. EPUB keeps a book’s own layout and equations best.</span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {dragging ? (
        <div className={styles.drop} aria-hidden="true">
          <span className={styles.dropIcon}>
            <UploadIcon />
          </span>
          <p className={`np-display ${styles.dropTitle}`}>Drop to add to your library</p>
          <p className={styles.dropText}>{ACCEPTED_WORDS}</p>
        </div>
      ) : null}

      <RenameDialog
        doc={renaming}
        onClose={() => setRenaming(null)}
        onDone={(updated) => {
          setDocs((list) => (list ?? []).map((x) => (docId(x) === docId(updated) ? { ...x, title: updated.title, subtitle: updated.subtitle } : x)));
          setRenaming(null);
          announce(`Renamed to “${updated.title}”.`);
        }}
      />
      <DeleteDialog
        doc={deleting}
        onClose={() => setDeleting(null)}
        onDone={(gone) => {
          const title = deleting?.title ?? "The document";
          setDocs((list) => (list ?? []).filter((x) => docId(x) !== gone));
          setDeleting(null);
          announce(`“${title}” deleted.`);
        }}
      />
    </section>
  );
}

function UploadsPanel({ items }: { items: UploadItem[] }) {
  const ids = useId();
  if (!items.length) return null;
  const active = items.filter((u) => u.status === "uploading" || u.status === "waiting").length;
  return (
    <section className={`np-panel ${styles.uploads}`} aria-labelledby={`${ids}-up`}>
      <div className={styles.uploadsHead}>
        <h2 id={`${ids}-up`} className={styles.uploadsTitle}>
          Uploads{active ? ` · ${active} in progress` : ""}
        </h2>
        {items.length > active ? (
          <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={clearFinished}>
            Clear finished
          </button>
        ) : null}
      </div>
      <ul className={styles.uploadList}>
        {items.map((u) => {
          const pct = u.total ? Math.round((u.loaded / u.total) * 100) : 0;
          const tone = u.status === "error" || u.status === "rejected" ? "error" : undefined;
          const state =
            u.status === "waiting"
              ? "Waiting to upload"
              : u.status === "uploading"
                ? `Uploading · ${pct}% of ${sizeLabel(u.total)}`
                : u.status === "done"
                  ? "Added. Processing has started."
                  : u.status === "cancelled"
                    ? "Cancelled"
                    : (u.error ?? "Not uploaded");
          return (
            <li key={u.key} className={styles.upload}>
              <span className={styles.upIcon} aria-hidden="true">
                <DocIcon />
              </span>
              <div className={styles.upMain}>
                <span id={`${ids}-${u.key}`} className={styles.upName} title={u.name}>
                  {u.name}
                </span>
                {u.status === "uploading" || u.status === "waiting" ? (
                  <progress className={styles.progress} max={100} value={u.status === "waiting" ? 0 : pct} aria-labelledby={`${ids}-${u.key}`} />
                ) : null}
                <span className={styles.upState} data-tone={tone}>
                  {state}
                </span>
              </div>
              <div className={styles.upActions}>
                {u.status === "uploading" || u.status === "waiting" ? (
                  <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => cancelUpload(u.key)} aria-label={`Cancel uploading ${u.name}`}>
                    Cancel
                  </button>
                ) : null}
                {u.status === "done" && u.docId ? (
                  <Link href={readHref({ _id: u.docId, title: u.name, type: "", status: "pending" })} className="np-btn np-btn--ghost np-btn--small" aria-label={`Open ${u.name}`}>
                    Open
                  </Link>
                ) : null}
                {u.status === "error" || u.status === "cancelled" ? (
                  <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => retryUpload(u.key)} aria-describedby={`${ids}-${u.key}`}>
                    Try again
                  </button>
                ) : null}
                {u.status !== "uploading" && u.status !== "waiting" ? (
                  <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => dismissUpload(u.key)} aria-label={`Remove ${u.name} from this list`}>
                    <CloseIcon />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
