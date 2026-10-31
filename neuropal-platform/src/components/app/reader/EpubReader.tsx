"use client";
// EPUB: the publisher's own chapters, one at a time, in a sandboxed frame
// (lib/neuropal/reader/epub.ts holds the policy and the in-frame runtime).
// Reading never waits for processing; Ask does. Read-aloud speaks the exact
// words the frame found in the chapter, and the frame highlights them.
// Progress uses the phone's convention: lastPage = chapter (spine) index,
// lastWordIndex = word in that chapter.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAppearance } from "@/components/AppearanceProvider";
import { announce } from "@/components/app/common/announce";
import { ArrowLeftIcon, ArrowRightIcon, RefreshIcon } from "@/components/app/common/icons";
import { AskPanel } from "@/components/app/ask/AskPanel";
import { errorText } from "@/lib/neuropal/client";
import { epubBaseUrl, epubChapterBase, epubManifest, fetchEpubChapter, getProgress, ticketFor } from "@/lib/neuropal/documents";
import { readerSurface, usePrefs } from "@/lib/neuropal/prefs";
import { createCursor, useCursorValue, type Cursor } from "@/lib/neuropal/reader/cursor";
import { buildChapterHtml, epubThemeCss, type EpubCommand, type EpubMessage, type EpubTokens, type TokenKind } from "@/lib/neuropal/reader/epub";
import { textHasExcerpt } from "@/lib/neuropal/reader/locate";
import {
  computeSentenceEnds,
  nextParagraphStart,
  nextSentence,
  previousParagraphStart,
  previousSentence,
  sentenceText,
} from "@/lib/neuropal/reader/sections";
import type { Citation, EpubManifest, EpubTocNode, NPDocument } from "@/lib/neuropal/types";
import { ChaptersPanel, type ChapterItem } from "./ChaptersPanel";
import { keysBelongTo, typingIn, useProgressSaver, useReadAloud } from "./hooks";
import { PlayerBar, type PlayerChapters } from "./PlayerBar";
import { ReaderFrame, usePanels } from "./ReaderFrame";
import styles from "./reader.module.css";

interface Props {
  doc: NPDocument;
  docId: string;
  initialAsk: boolean;
  askUnavailable: string | null;
}

interface FlatToc {
  title: string;
  depth: number;
  spine: number | null;
  anchor: string | null;
}

interface Pending {
  word: number;
  anchor: string | null;
  autoplay: boolean;
  find: string | null;
}

const MAX_TOKENS = 400000;

function flattenToc(nodes: EpubTocNode[], order: Map<string, number>, depth = 0, out: FlatToc[] = []): FlatToc[] {
  for (const n of nodes || []) {
    const href = n.href ? n.href.split("#")[0] : null;
    out.push({ title: n.title || "Untitled", depth, spine: href && order.has(href) ? (order.get(href) as number) : null, anchor: n.anchor || null });
    if (n.children?.length && depth < 4) flattenToc(n.children, order, depth + 1, out);
  }
  return out;
}

function validTokens(m: unknown): EpubTokens | null {
  const t = m as Partial<EpubTokens>;
  if (!Array.isArray(t.words) || !Array.isArray(t.kinds) || !Array.isArray(t.pids)) return null;
  if (t.words.length !== t.kinds.length || t.words.length !== t.pids.length || t.words.length > MAX_TOKENS) return null;
  const words = t.words.map((w) => String(w).slice(0, 200));
  const kinds = t.kinds.map((k) => (k === "eq" || k === "img" ? k : "w")) as TokenKind[];
  const pids = t.pids.map((p) => (Number.isFinite(Number(p)) ? Number(p) : 0));
  const pageAnchors = Array.isArray(t.pageAnchors)
    ? t.pageAnchors
        .filter((a) => a && Number.isFinite(Number(a.index)))
        .map((a) => ({ page: typeof a.page === "number" ? a.page : String(a.page).slice(0, 20), index: Number(a.index) }))
    : [];
  return { words, kinds, pids, pageAnchors };
}

export function EpubReader({ doc, docId, initialAsk, askUnavailable }: Props) {
  const prefs = usePrefs();
  const { palette } = useAppearance();
  const ids = useId();
  const titleId = `${ids}-title`;
  const askTitleId = `${ids}-ask`;
  const chaptersTitleId = `${ids}-chapters`;
  const lang = typeof navigator !== "undefined" ? navigator.language || "en" : "en";

  const [manifest, setManifest] = useState<EpubManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [spine, setSpine] = useState(0);
  const [html, setHtml] = useState<string | null>(null);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<EpubTokens | null>(null);
  const [cursor] = useState(() => createCursor(0));
  const pending = useRef<Pending>({ word: 0, anchor: null, autoplay: false, find: null });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, string>());
  /** The last "Try again" a fresh ticket was asked for. */
  const ticketAttempt = useRef(0);
  const findRef = useRef(0);
  const findWaiters = useRef(new Map<number, (index: number) => void>());
  const spineRef = useRef(0);
  useEffect(() => {
    spineRef.current = spine;
  }, [spine]);

  const spineCount = manifest?.spine.length ?? 0;
  const order = useMemo(() => new Map((manifest?.spine ?? []).map((s, i) => [s.href, i])), [manifest]);
  const toc = useMemo(() => (manifest ? flattenToc(manifest.toc, order) : []), [manifest, order]);
  const panels = usePanels(rootRef, initialAsk, spineCount > 1 || toc.length > 1);
  const { askSheet, setAskOpen, chaptersSheet, closeChapters } = panels;

  // ---- the word stream of the open chapter ----------------------------------------
  const stream = useMemo(() => {
    if (!tokens || tokens.words.length === 0) return null;
    const paraOf = Int32Array.from(tokens.pids);
    const starts: number[] = [];
    tokens.pids.forEach((p, i) => {
      if (starts[p] === undefined) starts[p] = i;
    });
    const paraStarts = Int32Array.from(starts.map((s, k) => s ?? starts[k - 1] ?? 0));
    const speech = tokens.words.map((w, i) => (tokens.kinds[i] === "w" ? w : tokens.kinds[i] === "eq" ? "equation" : ""));
    return { speech, sentenceEnd: computeSentenceEnds(tokens.words, paraOf), paraOf, paraStarts, totalWords: tokens.words.length, words: tokens.words };
  }, [tokens]);

  const goToChapterRef = useRef<(si: number, opts?: Partial<Pending>) => void>(() => undefined);
  const onEnded = useCallback(() => {
    const next = spineRef.current + 1;
    if (manifest && next < manifest.spine.length) goToChapterRef.current(next, { word: 0, autoplay: true });
  }, [manifest]);
  const reader = useReadAloud(stream, cursor, prefs, lang, onEnded);
  // Rolling into the next chapter keeps reading once its words are in.
  const autoplay = useRef(false);
  const play = reader.play;
  useEffect(() => {
    if (!stream || !autoplay.current) return;
    autoplay.current = false;
    play(cursor.get());
  }, [stream, play, cursor]);

  const send = useCallback((cmd: EpubCommand) => {
    // The frame has an opaque origin, so "*": commands carry no secrets.
    iframeRef.current?.contentWindow?.postMessage({ __np: cmd }, "*");
  }, []);

  // ---- resume point --------------------------------------------------------------
  const getPoint = useCallback(() => {
    if (!manifest || !stream) return null;
    const i = cursor.get();
    const frac = stream.totalWords ? i / stream.totalWords : 0;
    return { lastWordIndex: i, lastPage: spineRef.current, progress: Math.min(1, (spineRef.current + frac) / Math.max(1, manifest.spine.length)) };
  }, [manifest, stream, cursor]);
  const { touch, flush } = useProgressSaver(docId, getPoint, !!manifest);
  useEffect(() => cursor.subscribe(touch), [cursor, touch]);

  // ---- open: manifest + resume ---------------------------------------------------------
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([epubManifest(docId, ctrl.signal), getProgress(docId, ctrl.signal).catch(() => null)])
      .then(([m, p]) => {
        if (!m || !Array.isArray(m.spine) || m.spine.length === 0) {
          setError("This book has no chapters to show.");
          return;
        }
        const si = Math.max(0, Math.min(m.spine.length - 1, Math.floor(p?.lastPage ?? 0)));
        pending.current = { word: Math.max(0, Math.floor(p?.lastWordIndex ?? 0)), anchor: null, autoplay: false, find: null };
        setManifest(m);
        setSpine(si);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(errorText(e));
      });
    return () => ctrl.abort();
  }, [docId, attempt]);

  // ---- the look inside the frame ------------------------------------------------------
  const surface = readerSurface(prefs.readerBackground);
  const themeCss = useMemo(
    () =>
      epubThemeCss({
        background: surface?.background ?? palette.surface,
        text: surface?.color ?? palette.onSurface,
        link: surface?.color ?? palette.accentText,
        highlight: palette.accentFill,
        highlightText: palette.accentInk,
        flash: palette.accentText,
        font: prefs.readerFont,
        fontSize: prefs.readerFontSize,
        lineHeight: prefs.readerLineHeight,
      }),
    [surface, palette, prefs.readerFont, prefs.readerFontSize, prefs.readerLineHeight],
  );
  const themeRef = useRef(themeCss);
  useEffect(() => {
    themeRef.current = themeCss;
    send({ type: "theme", css: themeCss });
  }, [themeCss, send]);
  useEffect(() => {
    send({ type: "follow", on: prefs.followAlong });
  }, [prefs.followAlong, send, tokens]);

  // ---- chapter loading ----------------------------------------------------------------------
  const chapterTitle = useCallback(
    (si: number) => {
      let hit: string | null = null;
      for (const e of toc) {
        if (e.spine !== null && e.spine <= si && (hit === null || e.spine === si || e.depth === 0)) hit = e.title;
        if (e.spine !== null && e.spine > si) break;
      }
      return hit || `Section ${si + 1}`;
    },
    [toc],
  );

  useEffect(() => {
    if (!manifest) return;
    const entry = manifest.spine[spine];
    if (!entry) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        // "Try again" asks for a fresh ticket too: the old one may have run
        // out, or stopped working when the password changed.
        const fresh = attempt > ticketAttempt.current;
        ticketAttempt.current = attempt;
        const ticket = await ticketFor(docId, fresh);
        const key = `${spine}|${entry.href}`;
        const xhtml = cache.current.get(key) ?? (await fetchEpubChapter(docId, entry.href, ticket, ctrl.signal));
        cache.current.set(key, xhtml);
        if (ctrl.signal.aborted) return;
        const anchors = (manifest.pageList || []).filter((p) => p.href === entry.href).map((p) => ({ page: p.page, anchor: p.anchor ?? null }));
        setHtml(
          buildChapterHtml({
            chapterXhtml: xhtml,
            baseHref: epubChapterBase(docId, entry.href, ticket),
            themeCss: themeRef.current,
            pageAnchors: anchors,
            parentOrigin: window.location.origin,
            title: chapterTitle(spine),
          }),
        );
        setChapterError(null);
        // The next chapter, ahead of time, so turning the page is instant.
        const next = manifest.spine[spine + 1];
        const nextKey = next ? `${spine + 1}|${next.href}` : null;
        if (next && nextKey && !cache.current.has(nextKey)) {
          fetchEpubChapter(docId, next.href, ticket)
            .then((t) => {
              cache.current.set(nextKey, t);
              if (cache.current.size > 6) cache.current.delete(cache.current.keys().next().value as string);
            })
            .catch(() => undefined);
        }
      } catch (e) {
        if (!ctrl.signal.aborted) setChapterError(errorText(e));
      }
    })();
    return () => ctrl.abort();
  }, [manifest, spine, docId, chapterTitle, attempt]);

  const goToChapter = useCallback(
    (si: number, opts: Partial<Pending> = {}) => {
      if (!manifest || si < 0 || si >= manifest.spine.length) return;
      const p: Pending = { word: opts.word ?? 0, anchor: opts.anchor ?? null, autoplay: !!opts.autoplay, find: opts.find ?? null };
      if (si === spineRef.current && stream) {
        if (p.anchor) send({ type: "anchor", id: p.anchor });
        else if (p.find) {
          const ref = ++findRef.current;
          send({ type: "find", text: p.find, ref });
        } else reader.seek(Math.min(p.word, stream.totalWords - 1));
        return;
      }
      flush();
      if (!p.autoplay) reader.pause();
      pending.current = p;
      setTokens(null);
      setHtml(null);
      setSpine(si);
    },
    [manifest, stream, send, reader, flush],
  );
  useEffect(() => {
    goToChapterRef.current = goToChapter;
  }, [goToChapter]);

  // ---- messages from the frame ---------------------------------------------------------
  const handlers = useRef<{ onKey: (key: string, shift: boolean) => void; startAt: (i: number) => void }>({
    onKey: () => undefined,
    startAt: () => undefined,
  });

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || e.source !== frame.contentWindow || e.origin !== "null") return;
      const m = (e.data as { __epub?: EpubMessage } | null)?.__epub;
      if (!m || typeof m !== "object" || typeof m.type !== "string") return;
      if (m.type === "tokens") {
        const t = validTokens(m);
        if (!t) return;
        const p = pending.current;
        pending.current = { word: 0, anchor: null, autoplay: false, find: null };
        const word = Math.max(0, Math.min(t.words.length - 1, p.word));
        cursor.set(word);
        autoplay.current = p.autoplay;
        setTokens(t);
        window.requestAnimationFrame(() => {
          if (p.anchor) send({ type: "anchor", id: p.anchor });
          else if (p.find) {
            const ref = ++findRef.current;
            send({ type: "find", text: p.find, ref });
          } else send({ type: "highlight", index: word, scroll: false, quiet: true });
        });
      } else if (m.type === "tap") {
        const i = Number(m.index);
        if (Number.isFinite(i) && i >= 0) handlers.current.startAt(i);
      } else if (m.type === "key") {
        handlers.current.onKey(String(m.key), !!m.shift);
      } else if (m.type === "found") {
        const ref = Number(m.ref);
        const index = Number(m.index);
        const waiter = findWaiters.current.get(ref);
        if (waiter) {
          findWaiters.current.delete(ref);
          waiter(index);
        } else if (index >= 0) {
          // A search that rode along with a chapter turn.
          send({ type: "flash", index });
        }
      } else if (m.type === "link") {
        const href = String(m.href || "");
        let url: URL | null = null;
        try {
          url = new URL(href);
        } catch {
          url = null;
        }
        if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return;
        const ticketBase = epubBaseUrl(docId, null);
        const inBook = url.href.startsWith(ticketBase) || url.pathname.includes(`/documents/${encodeURIComponent(docId)}/epub/`);
        if (inBook) {
          const rest = url.pathname.replace(/^.*\/epub\/(?:t\/[^/]+\/)?/, "");
          const path = rest
            .split("/")
            .map((s) => {
              try {
                return decodeURIComponent(s);
              } catch {
                return s;
              }
            })
            .join("/");
          const si = order.get(path);
          if (si !== undefined) goToChapterRef.current(si, { anchor: url.hash ? decodeURIComponent(url.hash.slice(1)) : null });
        } else if (m.external) {
          window.open(url.href, "_blank", "noopener,noreferrer");
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [cursor, send, docId, order]);

  // The highlight follows the cursor (the frame keeps it in view while reading).
  useEffect(() => {
    let frame = 0;
    const unsub = cursor.subscribe(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        send({ type: "highlight", index: cursor.get(), scroll: reader.state === "playing", quiet: reader.state !== "playing" });
      });
    });
    return () => {
      unsub();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [cursor, send, reader.state]);

  // ---- moving ----------------------------------------------------------------------
  const go = useCallback(
    (i: number) => {
      if (!stream) return;
      const at = Math.max(0, Math.min(stream.totalWords - 1, i));
      reader.seek(at);
      send({ type: "highlight", index: at, scroll: false, quiet: reader.state !== "playing" });
    },
    [stream, reader, send],
  );
  const prevSentence = useCallback(() => stream && go(previousSentence(stream, cursor.get())), [stream, go, cursor]);
  const nextSentenceFn = useCallback(() => stream && go(nextSentence(stream, cursor.get())), [stream, go, cursor]);
  const prevParagraph = useCallback(() => stream && go(previousParagraphStart(stream, cursor.get())), [stream, go, cursor]);
  const nextParagraph = useCallback(() => stream && go(nextParagraphStart(stream, cursor.get())), [stream, go, cursor]);
  const locate = useCallback(() => {
    if (!stream) return;
    const i = cursor.get();
    send({ type: "scrollTo", index: i });
    send({ type: "highlight", index: i, scroll: false, quiet: reader.state !== "playing" });
    announce(`Reading position: ${sentenceText(stream, i)}`);
  }, [stream, cursor, send, reader.state]);

  const prevState = useRef(reader.state);
  useEffect(() => {
    if (stream && prevState.current === "playing" && reader.state === "paused") announce(`Paused at: ${sentenceText(stream, cursor.get())}`);
    else if (reader.state === "playing" && prevState.current !== "playing") announce("Reading aloud.");
    else if (reader.state === "error" && reader.message) announce(reader.message);
    prevState.current = reader.state;
  }, [reader.state, reader.message, stream, cursor]);

  useEffect(() => {
    const onKey = (key: string, shift: boolean) => {
      if (!prefs.shortcuts) return;
      if (key === " " && !shift) reader.toggle();
      else if (key === "ArrowLeft" && !shift) prevSentence();
      else if (key === "ArrowRight" && !shift) nextSentenceFn();
      else if (key === "ArrowUp" && shift) prevParagraph();
      else if (key === "ArrowDown" && shift) nextParagraph();
    };
    handlers.current = {
      onKey,
      startAt: (i: number) => {
        reader.play(i);
      },
    };
    if (!prefs.shortcuts) return;
    const listener = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (document.querySelector("dialog[open]") || typingIn(e.target)) return;
      const t = e.target as HTMLElement | null;
      if (e.key === " " && !e.shiftKey) {
        if (keysBelongTo(t)) return;
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        if (t?.closest('input, select, textarea, [role="slider"], [role="radio"], [role="tab"], [role="option"], [role="listbox"]')) return;
        if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey) return;
        if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.shiftKey) return;
      } else return;
      e.preventDefault();
      onKey(e.key, e.shiftKey);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [prefs.shortcuts, reader, prevSentence, nextSentenceFn, prevParagraph, nextParagraph]);

  // ---- chapters, pages ------------------------------------------------------------------
  const currentToc = useMemo(() => {
    let hit = -1;
    toc.forEach((e, k) => {
      if (e.spine !== null && e.spine <= spine) hit = k;
    });
    return hit;
  }, [toc, spine]);

  const chapterItems: ChapterItem[] = useMemo(() => {
    const items: ChapterItem[] = toc.length
      ? toc.map((e, k) => ({
          key: `t${k}`,
          title: e.title,
          depth: e.depth,
          current: k === currentToc,
          disabled: e.spine === null,
          onSelect: () => {
            if (e.spine === null) return;
            goToChapter(e.spine, { word: 0, anchor: e.anchor });
            if (chaptersSheet) closeChapters();
          },
        }))
      : (manifest?.spine ?? []).map((s, k) => ({
          key: `s${k}`,
          title: `Section ${k + 1}`,
          current: k === spine,
          onSelect: () => {
            goToChapter(k, { word: 0 });
            if (chaptersSheet) closeChapters();
          },
        }));
    return items;
  }, [toc, currentToc, manifest, spine, goToChapter, chaptersSheet, closeChapters]);

  const playerChapters: PlayerChapters = useMemo(
    () => ({
      count: Math.max(1, spineCount),
      of: () => spine,
      get: () => ({ title: chapterTitle(spine), start: 0, end: Math.max(1, tokens?.words.length ?? 1) }),
    }),
    [spineCount, spine, chapterTitle, tokens],
  );

  // ---- Ask: citations point into chapters ---------------------------------------------------
  const onCite = useCallback(
    async (c: Citation): Promise<boolean> => {
      const excerpt = (c.excerpt || "").trim();
      if (excerpt.length < 12 || !manifest) return false;
      if (stream) {
        const ref = ++findRef.current;
        const index = await new Promise<number>((resolve) => {
          findWaiters.current.set(ref, resolve);
          send({ type: "find", text: excerpt, ref });
          window.setTimeout(() => {
            if (findWaiters.current.delete(ref)) resolve(-1);
          }, 1500);
        });
        if (index >= 0) {
          send({ type: "flash", index });
          if (askSheet) setAskOpen(false);
          return true;
        }
      }
      // Other chapters: read their text (inert parse, nothing runs) and look there.
      const ticket = await ticketFor(docId).catch(() => null);
      for (let si = 0; si < manifest.spine.length; si++) {
        if (si === spineRef.current) continue;
        const entry = manifest.spine[si];
        const key = `${si}|${entry.href}`;
        try {
          const xhtml = cache.current.get(key) ?? (await fetchEpubChapter(docId, entry.href, ticket));
          cache.current.set(key, xhtml);
          const text = new DOMParser().parseFromString(xhtml, "text/html").body?.textContent ?? "";
          if (textHasExcerpt(text, excerpt)) {
            if (askSheet) setAskOpen(false);
            goToChapter(si, { find: excerpt });
            return true;
          }
        } catch {
          /* try the next chapter */
        }
      }
      return false;
    },
    [manifest, stream, send, docId, goToChapter, askSheet, setAskOpen],
  );

  const citeLabel = useCallback((c: Citation, n: number) => {
    const head = c.sectionHeading || "";
    return [typeof c.page === "number" ? `p. ${c.page}` : `Source ${n}`, head].filter(Boolean).join(" · ");
  }, []);

  const pageStyle = {
    padding: 0,
    ...(surface ? { "--reader-bg": surface.background, "--reader-fg": surface.color, "--reader-muted": surface.muted } : {}),
  } as CSSProperties;

  const subtitle = (
    <EpubSubtitle
      cursor={cursor}
      tokens={tokens}
      pageList={manifest?.pageList ?? []}
      spineIndexOf={(href) => order.get(href)}
      spine={spine}
      lead={[spineCount ? `Chapter ${spine + 1} of ${spineCount}` : "", currentToc >= 0 ? toc[currentToc]?.title : ""].filter(Boolean).join(" · ")}
    />
  );

  const body = error ? (
    <div className={styles.state} role="alert">
      <p className="np-hazard">
        <span>
          <b>Problem: </b>The book couldn’t be opened. {error}
        </span>
      </p>
      <div className={styles.stateActions}>
        <button
          type="button"
          className="np-btn np-btn--ghost"
          onClick={() => {
            setError(null);
            setAttempt((a) => a + 1);
          }}
        >
          <RefreshIcon />
          Try again
        </button>
      </div>
    </div>
  ) : (
    <>
      <div className={styles.epubWrap}>
        {chapterError ? (
          <div className={styles.state} role="alert">
            <p className="np-hazard">
              <span>
                <b>Problem: </b>This chapter couldn’t be loaded. {chapterError}
              </span>
            </p>
            <div className={styles.stateActions}>
              <button type="button" className="np-btn np-btn--ghost" onClick={() => setAttempt((a) => a + 1)}>
                <RefreshIcon />
                Try again
              </button>
            </div>
          </div>
        ) : html ? (
          <iframe
            key={`${spine}-${attempt}`}
            ref={iframeRef}
            className={styles.epubFrame}
            sandbox="allow-scripts"
            srcDoc={html}
            referrerPolicy="no-referrer"
            title={`Chapter ${spine + 1} of ${spineCount}: ${chapterTitle(spine)}`}
          />
        ) : (
          <p className={`np-muted ${styles.state}`}>Opening the book…</p>
        )}
      </div>
      {spineCount > 1 ? (
        <div className={styles.epubNav}>
          <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => goToChapter(spine - 1, { word: 0 })} disabled={spine === 0}>
            <ArrowLeftIcon />
            Previous chapter
          </button>
          <button type="button" className="np-btn np-btn--ghost np-btn--small" onClick={() => goToChapter(spine + 1, { word: 0 })} disabled={spine >= spineCount - 1}>
            Next chapter
            <ArrowRightIcon />
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <ReaderFrame
      rootRef={rootRef}
      titleId={titleId}
      title={doc.title}
      subtitle={subtitle}
      panels={panels}
      hasChapters={spineCount > 1 || toc.length > 1}
      chaptersTitleId={chaptersTitleId}
      chapters={<ChaptersPanel titleId={chaptersTitleId} items={chapterItems} onClose={panels.closeChapters} />}
      askTitleId={askTitleId}
      ask={<AskPanel docId={docId} titleId={askTitleId} unavailable={askUnavailable} onClose={() => panels.setAskOpen(false)} onCite={onCite} citeLabel={citeLabel} />}
      view={null}
      pageStyle={pageStyle}
      customSurface={!!surface}
      page={body}
      playerRef={playerRef}
      player={
        <PlayerBar
          reader={reader}
          cursor={cursor}
          total={stream?.totalWords ?? 0}
          chapters={playerChapters}
          lang={lang}
          playerRef={playerRef}
          onSeek={go}
          onPrevSentence={() => prevSentence()}
          onNextSentence={() => nextSentenceFn()}
          onPrevParagraph={() => prevParagraph()}
          onNextParagraph={() => nextParagraph()}
          onOpenChapters={panels.toggleChapters}
          onLocate={locate}
        />
      }
    />
  );
}

/** "Chapter 3 of 12 · Title · Page 41 of 300" — real print pages only, never made up. */
function EpubSubtitle({
  cursor,
  tokens,
  pageList,
  spineIndexOf,
  spine,
  lead,
}: {
  cursor: Cursor;
  tokens: EpubTokens | null;
  pageList: EpubManifest["pageList"];
  spineIndexOf: (href: string) => number | undefined;
  spine: number;
  lead: string;
}) {
  const page = useCursorValue(cursor, (i) => {
    if (!tokens || !pageList.length) return null;
    let current: string | number | null = null;
    for (const a of tokens.pageAnchors) {
      if (a.index <= i) current = a.page;
      else break;
    }
    if (current === null) {
      for (const p of pageList) {
        const si = spineIndexOf(p.href);
        if (si !== undefined && si < spine) current = p.page;
        if (si !== undefined && si >= spine) break;
      }
    }
    return current === null ? null : String(current);
  });
  const last = pageList.length ? String(pageList[pageList.length - 1].page) : null;
  return <>{[lead, page && last ? `Page ${page} of ${last}` : ""].filter(Boolean).join(" · ") || "EPUB"}</>;
}
