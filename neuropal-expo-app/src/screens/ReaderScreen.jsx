import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  AppState,
  BackHandler,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Toast from "../components/toast";

import { withAlpha } from "../components/primitives";
import { MathView } from "../components/MathView";
import { DisplayOptionsSheet } from "../components/reader/DisplayOptionsSheet";
import { ReaderTopBar } from "../components/reader/ReaderTopBar";
import { AskSheet } from "../components/reader/AskSheet";
import { SelectionBar } from "../components/reader/SelectionBar";
import { TidalPlayer } from "../components/reader/TidalPlayer";
import { TocSheet } from "../components/reader/TocSheet";
import { StudySheet } from "../components/StudySheet";
import {
  documentPageUrl,
  fetchReadingProgressApi,
  saveReadingProgressApi,
  USE_MOCK,
} from "../services/network";
import { speakWords } from "../services/tts";
import { appStore } from "../store";
import {
  selectDocumentById,
  selectReaderDoc,
  selectReaderAsking,
  selectReaderMessages,
  selectReaderPlayback,
  selectUiState,
} from "../store/selectors";
import {
  addAnnotation,
  advanceReader,
  fetchReaderDocument,
  loadAnnotations,
  pauseReader,
  playReader,
  removeAnnotation,
  requestReaderAnswer,
  resetReader,
  setPlayerExpanded,
  setReaderTotalWords,
  setReaderWord,
} from "../store/slices/readerSlice";
import { createNoteRemote, setPendingOpenNote } from "../store/slices/notesSlice";
import { setVoice, setWpm } from "../store/slices/uiSlice";
import {
  blockMathOf,
  isUnicodeMathParagraph,
  tokenizeMathParagraph,
} from "../utils/math";
import { latexToSpeech } from "../utils/mathSpeech";
import { usePalette, useTheme } from "../theme/ThemeProvider";

// D8/D9/D10 — the Play-Books-style immersive reader.
//   · tap the page (not a word) to toggle chrome (top bar + player + Ask)
//   · tap a word to move the read cursor; long-press a word to start a
//     selection, tap another word to extend, then highlight/explain
//   · block equations ($$…$$) render via KaTeX and are skipped by TTS
//   · Tidal-style docked player: scrubber → transport → tone + WPM
//   · TOC sheet with chapters + bookmarks; go-to-page; original-pages view

const EMPTY_SECTIONS = [];
const EMPTY_CHAT = []; // stable identity — keeps memoized rows from churning

export function ReaderScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const palette = usePalette();
  const dispatch = useDispatch();
  const {
    readerFontFamily,
    readerFontSize,
    readerLineHeight,
    readerExtraLetterSpacing,
  } = useTheme();
  const readerDoc = useSelector(selectReaderDoc);
  // P4: the drawer's Reader item navigates WITHOUT params, and RN7's router
  // then REPLACES the existing {id} with undefined — falling back to the
  // live session's docId re-summons what was playing instead of (the old
  // behavior) silently opening whatever docs[0] happened to be.
  const id = route.params?.id ?? readerDoc.docId ?? undefined;

  const document = useSelector((state) => selectDocumentById(state, id));
  const { readerLayout, voice, wpm, speakEquations } = useSelector(selectUiState);
  const playback = useSelector(selectReaderPlayback);
  const chat = useSelector(selectReaderMessages);
  const asking = useSelector(selectReaderAsking);
  const voiceId = useSelector((st) => st.ui.voiceId);
  const annotations = useSelector((s) => s.reader.annotations);

  const [askingId, setAskingId] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const [viewMode, setViewMode] = useState("text"); // 'text' | 'pages'
  const [chromeVisible, setChromeVisible] = useState(true);
  // A ↔ B — in redux (P4) so the global nav FAB can duck under the
  // full-screen now-playing view
  const playerExpanded = useSelector((s) => s.reader.playerExpanded);
  const [selection, setSelection] = useState(null); // {start, end} inclusive
  const [currentPage, setCurrentPage] = useState(1);

  const simTimerRef = useRef(null);
  const ttsRef = useRef(null);
  // Resume: which docId we've already restored the reading position for, so
  // the fetch runs once per open and never fights a user seek afterward.
  const restoredForRef = useRef(null);
  const settingsRestartRef = useRef(null);
  const pagesListRef = useRef(null);
  // Flips true on the first real word-boundary event from the TTS engine —
  // from then on the engine drives the highlight and the estimator dies.
  const boundaryLiveRef = useRef(false);

  // ---- document text ------------------------------------------------------
  const targetId = document?.id;
  const status = document?.status;
  const ingesting =
    status === "pending" ||
    status === "parsing" ||
    status === "chunking" ||
    status === "embedding";
  const needsText =
    Boolean(targetId) &&
    !document.sections &&
    !USE_MOCK &&
    (status === "ready" || status === undefined);
  useEffect(() => {
    if (needsText && readerDoc.docId !== targetId) {
      dispatch(fetchReaderDocument({ documentId: targetId }));
      dispatch(loadAnnotations({ documentId: targetId }));
    }
  }, [needsText, readerDoc.docId, targetId, dispatch]);

  const retryTextFetch = useCallback(() => {
    if (targetId) dispatch(fetchReaderDocument({ documentId: targetId }));
  }, [targetId, dispatch]);

  const fetchedSections =
    needsText && readerDoc.docId === targetId ? readerDoc.sections : null;

  const baseDocument =
    document || {
      id: "doc-empty",
      title: "No document selected",
      subtitle: "Open a document from the library to start reading.",
      type: "pdf",
      progress: 0,
      pageCount: 0,
      sections: [],
    };
  const sections = baseDocument.sections || fetchedSections || EMPTY_SECTIONS;
  const activeDocument = { ...baseDocument, sections };

  const textError =
    needsText && readerDoc.docId === targetId ? readerDoc.error : null;
  const emptyNotice = !baseDocument.sections
    ? ingesting
      ? "This document is still being processed — the text will appear here as soon as it's ready."
      : status === "failed"
        ? `⚠ Ingest failed${document?.ingestError ? `: ${document.ingestError}` : ""}. Re-upload the file or reingest from the backend.`
        : readerDoc.loading
          ? "Loading document text…"
          : textError
            ? `⚠ ${textError}`
            : USE_MOCK && document && !document.sections
              ? "Mock mode: this sample document has no content."
              : null
    : null;

  // ---- words / ranges / spans (P1: equations are single karaoke units) ----
  // Two parallel same-length arrays: `words` is what's DISPLAYED (inline
  // math prettified to unicode), `speechWords` is what the ENGINE says for
  // that token — "" (skip) / "equation" / a LaTeX→speech rendering, per the
  // speakEquations setting. A display-math paragraph is exactly one unit,
  // so the whole equation highlights together and is never vocalised as
  // raw LaTeX.
  const { words, speechWords, ranges, sectionSpans } = useMemo(() => {
    const nextWords = [];
    const nextSpeech = [];
    const nextRanges = [];
    const nextSpans = [];

    const speechFor = (latex) => {
      if (speakEquations === "off") return "";
      if (speakEquations === "aloud" && latex) return latexToSpeech(latex);
      return "equation";
    };

    sections.forEach((section) => {
      const sectionStart = nextWords.length;
      section.paragraphs.forEach((paragraph, index) => {
        const start = nextWords.length;
        const latex = blockMathOf(paragraph);
        if (latex || isUnicodeMathParagraph(paragraph)) {
          nextWords.push("[equation]");
          nextSpeech.push(speechFor(latex));
        } else {
          for (const tok of tokenizeMathParagraph(paragraph)) {
            nextWords.push(tok.display);
            nextSpeech.push(tok.latex ? speechFor(tok.latex) : tok.display);
          }
        }
        nextRanges.push({
          pid: `${section.id}-${index}`,
          start,
          end: nextWords.length,
        });
      });
      nextSpans.push({ start: sectionStart, end: nextWords.length });
    });

    return {
      words: nextWords,
      speechWords: nextSpeech,
      ranges: nextRanges,
      sectionSpans: nextSpans,
    };
  }, [sections, speakEquations]);

  // Highlights clipped per paragraph — computed once per annotations change
  // so ParagraphText's memo keeps working (stable array identities).
  const highlightsByPid = useMemo(() => {
    const map = new Map();
    const highlights = annotations.filter((a) => a.kind === "highlight");
    if (highlights.length === 0) return map;
    for (const range of ranges) {
      const clipped = [];
      for (const h of highlights) {
        const s = Math.max(h.wordStart, range.start);
        const e = Math.min(h.wordEnd, range.end - 1);
        if (s <= e) clipped.push({ s, e, color: h.color || palette.tertiary });
      }
      if (clipped.length > 0) map.set(range.pid, clipped);
    }
    return map;
  }, [annotations, ranges, palette.tertiary]);

  const bookmarks = useMemo(
    () => annotations.filter((a) => a.kind === "bookmark"),
    [annotations]
  );

  // ---- P4: word↔page agreement --------------------------------------------
  // pageMap anchors original pages to canonical /text paragraphs; sections
  // built from a TOC carry paraOrigin (display→canonical). When either is
  // missing the callers keep their old proportional math.
  const pageMap = readerDoc.docId === targetId ? readerDoc.pageMap : null;
  const pageSync = useMemo(() => {
    const hasMap = Array.isArray(pageMap) && pageMap.length > 0;
    const paragraphForPage = (page) => {
      let hit = null;
      for (const e of pageMap) {
        if (e.page <= page) hit = e.startParagraph;
        else break;
      }
      return hit;
    };
    const pageForParagraph = (para) => {
      let hit = null;
      for (const e of pageMap) {
        if (e.startParagraph <= para) hit = e.page;
        else break;
      }
      return hit;
    };
    // current word → canonical paragraph (via the section's paraOrigin)
    const canonicalAtWord = (idx) => {
      const range = ranges.find((r) => idx >= r.start && idx < r.end);
      if (!range) return null;
      const section = sections.find((s) => range.pid.startsWith(s.id + "-"));
      const dIdx = parseInt(range.pid.split("-").pop(), 10);
      return section?.paraOrigin?.[dIdx] ?? null;
    };
    // canonical paragraph → first word of the display paragraph holding it
    const wordForCanonical = (para) => {
      let si = -1;
      sections.forEach((s, i) => {
        if (typeof s.startParagraph === "number" && s.startParagraph <= para) si = i;
      });
      if (si === -1) return null;
      const s = sections[si];
      let dIdx = 0;
      for (let i = 0; i < (s.paraOrigin?.length || 0); i++) {
        if (s.paraOrigin[i] <= para) dIdx = i;
        else break;
      }
      const range = ranges.find((r) => r.pid === `${s.id}-${dIdx}`);
      return range ? { wordIndex: range.start, sectionIndex: si } : null;
    };
    return {
      hasMap,
      pageAtWord: (idx) => {
        if (!hasMap) return null;
        const para = canonicalAtWord(idx);
        return para === null ? null : pageForParagraph(para);
      },
      wordForPage: (page) => {
        if (!hasMap) return null;
        const para = paragraphForPage(page);
        return para === null ? null : wordForCanonical(para);
      },
    };
  }, [pageMap, ranges, sections]);

  // ---- playback engine (carried over intact) ------------------------------
  const stopSpeech = useCallback(() => {
    if (ttsRef.current) {
      ttsRef.current.stop();
      ttsRef.current = null;
    }
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
  }, []);

  // Save the resume point (word index + % through the book) — fire-and-forget
  // so it never blocks the UI. Called on pause, seek, blur and unmount.
  const persistProgress = useCallback(() => {
    if (!targetId || USE_MOCK || words.length === 0) return;
    const st = appStore.getState().reader;
    const total = st.totalWords || words.length;
    saveReadingProgressApi(targetId, {
      lastWordIndex: st.wordIndex,
      progress: total > 0 ? st.wordIndex / total : 0,
    });
  }, [targetId, words.length]);

  useEffect(() => {
    dispatch(resetReader());
    dispatch(setReaderTotalWords(words.length));
    setActiveSection(0);
    setViewMode("text");
    setSelection(null);
    setChromeVisible(true);
    // (playerExpanded cleared inside resetReader — never carry the
    // full-screen B into a new doc)
    return () => {
      stopSpeech();
      dispatch(pauseReader());
    };
    // keyed on targetId too, so switching between two same-length docs still
    // resets view state (the Reader is a never-unmounting drawer destination)
  }, [dispatch, words.length, targetId, stopSpeech]);

  // Resume where the reader last left off (Audible-style). Runs once per doc
  // open, AFTER the reset above (declared later → same-commit ordering), and
  // never re-fetches for a doc it has already restored.
  useEffect(() => {
    if (USE_MOCK || !targetId || words.length === 0) return undefined;
    if (readerDoc.docId !== targetId) return undefined;
    if (restoredForRef.current === targetId) return undefined;
    restoredForRef.current = targetId;
    let active = true;
    fetchReadingProgressApi(targetId).then((p) => {
      if (!active || !p) return;
      const idx = Math.min(Math.max(0, p.lastWordIndex || 0), words.length - 1);
      if (idx > 0) {
        dispatch(setReaderWord(idx));
        const span = sectionSpans.findIndex((s) => idx >= s.start && idx < s.end);
        if (span >= 0) setActiveSection(span);
      }
    });
    return () => {
      active = false;
    };
  }, [targetId, words.length, readerDoc.docId, sectionSpans, dispatch]);

  // Whatever flips `playing` off must also kill the audio.
  useEffect(() => {
    if (!playback.playing) stopSpeech();
  }, [playback.playing, stopSpeech]);

  // The Reader never unmounts (drawer destination). P4: losing focus no
  // longer kills the session — audio keeps playing across navigation (the
  // global now-playing pill controls it from other screens); we only save
  // the resume point. Switching DOCUMENTS still stops via the reset effect.
  useFocusEffect(
    useCallback(() => {
      return () => {
        persistProgress();
      };
    }, [persistProgress])
  );

  const startPlaybackFrom = useCallback(
    (startIndex) => {
      boundaryLiveRef.current = false;
      const pitch = voice === "deep" ? 0.85 : voice === "natural" ? 1 : 1.1;
      const voiceIdentifier = appStore.getState().ui.voiceId;
      // 950 wpm ceiling: 400 wpm ≈ engine rate 1.0, clamp at 2.4× (past the
      // reliable Android/iOS range the estimator alone paces the karaoke).
      const rate = Math.min(2.4, Math.max(0.25, wpm / 400));

      ttsRef.current = speakWords({
        words,
        speechWords,
        startIndex,
        rate,
        pitch,
        voice: voiceIdentifier,
        onWord: (wordIndex) => {
          boundaryLiveRef.current = true;
          if (simTimerRef.current) {
            clearInterval(simTimerRef.current);
            simTimerRef.current = null;
          }
          dispatch(setReaderWord(wordIndex));
        },
        onChunkStart: (wordIndex) => {
          if (!boundaryLiveRef.current) dispatch(setReaderWord(wordIndex));
        },
        onDone: () => dispatch(pauseReader()),
        onError: () => dispatch(pauseReader()),
      });

      simTimerRef.current = setInterval(() => {
        if (!boundaryLiveRef.current) {
          // hold at the LAST word instead of advancing past it — the
          // estimator ticks faster than long spoken equations, and
          // advanceReader's auto-pause would cut audio mid-sentence; the
          // engine's own onDone ends playback at the true finish.
          const st = appStore.getState().reader;
          if (st.wordIndex + 1 < st.totalWords) {
            dispatch(advanceReader());
          }
        }
        if (!appStore.getState().reader.playing && simTimerRef.current) {
          clearInterval(simTimerRef.current);
          simTimerRef.current = null;
        }
      }, 60000 / wpm);
    },
    [dispatch, voice, wpm, words, speechWords]
  );

  const togglePlay = useCallback(() => {
    if (playback.playing) {
      stopSpeech();
      dispatch(pauseReader());
      setChromeVisible(true);
      persistProgress();
      return;
    }
    // P4: an ENDED session restarts from the top instead of replaying the
    // final word — play always does something obvious
    const atEnd = words.length > 0 && playback.wordIndex >= words.length - 1;
    const from = atEnd ? 0 : playback.wordIndex;
    if (atEnd) {
      dispatch(setReaderWord(0));
      setActiveSection(0);
    }
    dispatch(playReader());
    startPlaybackFrom(from);
    setChromeVisible(false); // Play-Books: chrome auto-hides while reading
  }, [dispatch, playback.playing, playback.wordIndex, words.length, startPlaybackFrom, stopSpeech, persistProgress]);

  const seekTo = useCallback(
    (index) => {
      const clamped = Math.max(0, Math.min(Math.max(0, words.length - 1), index));
      const wasPlaying = appStore.getState().reader.playing;
      stopSpeech();
      dispatch(setReaderWord(clamped));
      if (wasPlaying) startPlaybackFrom(clamped);
      persistProgress();
    },
    [words.length, stopSpeech, dispatch, startPlaybackFrom, persistProgress]
  );

  // #7 hardware back collapses the expanded player before leaving the screen;
  // #9 backgrounding the app saves the resume point (blur doesn't fire on
  // background, so an OS kill mid-listen would otherwise lose the position).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (playerExpanded) {
        dispatch(setPlayerExpanded(false));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [playerExpanded, dispatch]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") persistProgress();
    });
    return () => sub.remove();
  }, [persistProgress]);

  // Speed/voice changes apply mid-playback (debounced engine restart).
  useEffect(() => {
    if (!appStore.getState().reader.playing) return undefined;
    if (settingsRestartRef.current) clearTimeout(settingsRestartRef.current);
    settingsRestartRef.current = setTimeout(() => {
      if (appStore.getState().reader.playing) {
        stopSpeech();
        startPlaybackFrom(appStore.getState().reader.wordIndex);
      }
    }, 600);
    return () => {
      if (settingsRestartRef.current) clearTimeout(settingsRestartRef.current);
    };
  }, [wpm, voice, stopSpeech, startPlaybackFrom]);

  // While playing, the visible section follows the voice.
  useEffect(() => {
    if (!playback.playing || sectionSpans.length < 2) return;
    const span = sectionSpans[activeSection];
    if (span && playback.wordIndex >= span.start && playback.wordIndex < span.end) {
      return;
    }
    const next = sectionSpans.findIndex(
      (s) => playback.wordIndex >= s.start && playback.wordIndex < s.end
    );
    if (next >= 0 && next !== activeSection) setActiveSection(next);
  }, [playback.playing, playback.wordIndex, sectionSpans, activeSection]);

  // ---- selection / highlight / explain ------------------------------------
  const selectionRef = useRef(null);
  selectionRef.current = selection;
  // "Armed" turns the next word tap into a selection start. Long-press does
  // the same in one gesture, but react-native-web never fires onLongPress on
  // nested Text nodes — this menu-armed path is the way in on web (and a
  // more discoverable one everywhere).
  const armSelectRef = useRef(false);

  const onWordPress = useCallback(
    (globalIndex) => {
      const sel = selectionRef.current;
      if (sel) {
        setSelection(
          globalIndex < sel.start
            ? { start: globalIndex, end: sel.end }
            : { start: sel.start, end: globalIndex }
        );
        return;
      }
      if (armSelectRef.current) {
        armSelectRef.current = false;
        setSelection({ start: globalIndex, end: globalIndex });
        return;
      }
      seekTo(globalIndex);
    },
    [seekTo]
  );

  const onWordLongPress = useCallback((globalIndex) => {
    setSelection({ start: globalIndex, end: globalIndex });
  }, []);

  const selectedText = selection
    ? words.slice(selection.start, selection.end + 1).join(" ")
    : "";

  async function applyHighlight(color) {
    if (!selection || !document) return;
    try {
      await dispatch(
        addAnnotation({
          documentId: activeDocument.id,
          kind: "highlight",
          wordStart: selection.start,
          wordEnd: selection.end,
          color,
          excerpt: selectedText.slice(0, 500),
        })
      ).unwrap();
      Toast.show({ type: "success", text1: "Highlighted" });
    } catch (error) {
      Toast.show({ type: "error", text1: "Highlight failed", text2: error?.message });
    }
    setSelection(null);
  }

  function explainSelection() {
    if (!selection || !document) return;
    const range = ranges.find(
      (r) => selection.start >= r.start && selection.start < r.end
    );
    dispatch(
      requestReaderAnswer({
        documentId: activeDocument.id,
        paragraphId: range?.pid || "selection",
        question: `Explain: "${selectedText.slice(0, 120)}…"`,
        excerpt: selectedText,
        kind: "explain",
      })
    );
    setAskingId(range?.pid || null);
    setSelection(null);
  }

  async function bookmarkHere() {
    if (!document) return;
    const idx =
      viewMode === "pages"
        ? pageSync.wordForPage(currentPage)?.wordIndex ??
          Math.floor(
            ((currentPage - 1) / Math.max(1, activeDocument.pageCount)) *
              Math.max(1, words.length)
          )
        : appStore.getState().reader.wordIndex;
    try {
      await dispatch(
        addAnnotation({
          documentId: activeDocument.id,
          kind: "bookmark",
          wordStart: idx,
          wordEnd: idx,
          excerpt: words.slice(idx, idx + 14).join(" "),
          page: viewMode === "pages" ? currentPage : undefined,
        })
      ).unwrap();
      Toast.show({ type: "success", text1: "Bookmarked" });
    } catch (error) {
      Toast.show({ type: "error", text1: "Bookmark failed", text2: error?.message });
    }
  }

  // P6 — a typed note anchored to the reading position: created on the
  // backend (documentId + word/page anchor), then the Notes screen opens
  // straight into the editor. The current paragraph is quoted as a seed so
  // the note starts with its context.
  async function noteHere() {
    if (!document) return;
    const idx = appStore.getState().reader.wordIndex;
    const { paragraph } = paragraphAtCursor();
    try {
      const note = await dispatch(
        createNoteRemote({
          kind: "typed",
          title: `${activeDocument.title} — note`,
          contentMarkdown: paragraph ? `> ${paragraph.slice(0, 300)}\n\n` : "",
          documentId: activeDocument.id,
          anchor: {
            wordStart: idx,
            wordEnd: idx,
            page: pageSync.pageAtWord(idx) ?? undefined,
          },
        })
      ).unwrap();
      dispatch(setPendingOpenNote(note.id));
      navigation.navigate("Notes");
    } catch (error) {
      Toast.show({ type: "error", text1: "Could not create note", text2: error?.message });
    }
  }

  // ---- ask / q&a -----------------------------------------------------------
  // The paragraph under the reading cursor — shown as context in the Ask
  // sheet and attached to the question as the grounding excerpt.
  function paragraphAtCursor() {
    const idx = appStore.getState().reader.wordIndex;
    const range =
      ranges.find((r) => idx >= r.start && idx < r.end) || ranges[0];
    if (!range) return { pid: null, paragraph: "" };
    const section = sections.find((s) => range.pid.startsWith(s.id + "-"));
    const paraIndex = parseInt(range.pid.split("-").pop(), 10);
    return { pid: range.pid, paragraph: section?.paragraphs?.[paraIndex] || "" };
  }

  function submitQuestion(question) {
    if (!document) return;
    const { pid, paragraph } = paragraphAtCursor();
    dispatch(
      requestReaderAnswer({
        documentId: activeDocument.id,
        paragraphId: pid,
        question,
        excerpt: paragraph,
      })
    );
    setAskingId(pid);
  }

  // ---- navigation helpers --------------------------------------------------
  const jumpToSection = useCallback(
    (index) => {
      const span = sectionSpans[index];
      if (playback.playing) {
        stopSpeech();
        dispatch(pauseReader());
      }
      if (span) dispatch(setReaderWord(span.start));
      setActiveSection(index);
      setTocOpen(false);
    },
    [sectionSpans, playback.playing, stopSpeech, dispatch]
  );

  function goToPage(page) {
    const pageCount = Math.max(1, activeDocument.pageCount || 1);
    const clamped = Math.max(1, Math.min(pageCount, page));
    if (viewMode === "pages") {
      pagesListRef.current?.scrollToIndex({ index: clamped - 1, animated: true });
    } else if (words.length > 0) {
      // exact via pageMap when the ingest anchored real pages (P4);
      // proportional guess otherwise
      const hit = pageSync.wordForPage(clamped);
      if (hit) {
        seekTo(hit.wordIndex);
        setActiveSection(hit.sectionIndex);
      } else {
        const idx = Math.floor(((clamped - 1) / pageCount) * words.length);
        seekTo(idx);
        const next = sectionSpans.findIndex((s) => idx >= s.start && idx < s.end);
        if (next >= 0) setActiveSection(next);
      }
    }
    setCurrentPage(clamped);
    setGotoOpen(false);
  }

  // P4: switching views resolves the position from ONE shared anchor — the
  // reading cursor going text→pages, the visible page coming back. Without a
  // pageMap this falls back to the proportional estimate both directions.
  function toggleViewMode() {
    const pageCount = Math.max(1, activeDocument.pageCount || 1);
    if (viewMode === "text") {
      const idx = appStore.getState().reader.wordIndex;
      const page =
        pageSync.pageAtWord(idx) ??
        Math.max(
          1,
          Math.min(
            pageCount,
            1 + Math.floor((idx / Math.max(1, words.length)) * pageCount)
          )
        );
      setCurrentPage(page);
      setViewMode("pages");
    } else {
      const hit = pageSync.wordForPage(currentPage);
      // move the cursor only when the views actually DISAGREE — flipping
      // back without scrolling must never nudge the reading position
      if (hit && pageSync.pageAtWord(appStore.getState().reader.wordIndex) !== currentPage) {
        seekTo(hit.wordIndex);
        setActiveSection(hit.sectionIndex);
      }
      setViewMode("text");
    }
  }

  const visibleSections =
    sections.length > 1
      ? [sections[Math.min(activeSection, sections.length - 1)]]
      : sections;

  const currentHeading =
    sections[Math.min(activeSection, Math.max(0, sections.length - 1))]?.heading ||
    activeDocument.title;

  const overflowItems = [
    { icon: "school", label: "Study tools", onPress: () => setStudyOpen(true) },
    ...(document && viewMode === "text"
      ? [
          {
            icon: "border-color",
            label: "Select & highlight",
            onPress: () => {
              armSelectRef.current = true;
              Toast.show({
                type: "info",
                text1: "Tap a word to start selecting",
                text2: "Tap another word to extend, then pick a color or Explain.",
              });
            },
          },
        ]
      : []),
    ...(document &&
    (document.type === "pdf" || document.type === "arxiv") && // /page/:n renders both
    document.pageCount > 0 &&
    !USE_MOCK
      ? [
          {
            icon: viewMode === "text" ? "auto-stories" : "subject",
            label: viewMode === "text" ? "Original pages" : "Text reader",
            onPress: toggleViewMode,
          },
        ]
      : []),
    ...(activeDocument.pageCount > 0
      ? [{ icon: "tag", label: "Go to page…", onPress: () => setGotoOpen(true) }]
      : []),
    ...(document
      ? [{ icon: "bookmark-add", label: "Bookmark here", onPress: bookmarkHere }]
      : []),
    ...(document && !USE_MOCK
      ? [{ icon: "edit-note", label: "Typed note here", onPress: noteHere }]
      : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      {viewMode === "pages" ? (
        <PdfPagesView
          listRef={pagesListRef}
          documentId={activeDocument.id}
          pageCount={activeDocument.pageCount}
          initialPage={currentPage}
          onPageChange={setCurrentPage}
          onTapPage={() => setChromeVisible((v) => !v)}
        />
      ) : (
        <ReaderBody
          visibleSections={visibleSections}
          sectionKey={activeSection}
          currentWordIndex={playback.wordIndex}
          ranges={ranges}
          chat={chat}
          askingId={askingId}
          emptyNotice={emptyNotice}
          onRetryText={textError ? retryTextFetch : null}
          layout={readerLayout}
          readerFontFamily={readerFontFamily}
          readerFontSize={readerFontSize}
          readerLineHeight={readerLineHeight}
          readerExtraLetterSpacing={readerExtraLetterSpacing}
          onWordPress={onWordPress}
          onWordLongPress={onWordLongPress}
          highlightsByPid={highlightsByPid}
          selection={selection}
          onSurfaceTap={() => setChromeVisible((v) => !v)}
          equationColor={palette.onSurface}
        />
      )}

      {chromeVisible ? (
        <ReaderTopBar
          title={activeDocument.title}
          subtitle={
            viewMode === "pages"
              ? `Page ${currentPage} / ${activeDocument.pageCount}`
              : currentHeading !== activeDocument.title
                ? currentHeading
                : null
          }
          onBack={() => navigation.navigate("Library")}
          onToc={() => setTocOpen(true)}
          onDisplay={() => setDisplayOpen(true)}
          overflowItems={overflowItems}
        />
      ) : null}

      {/* D10 — Ask as a translucent floating button, top-right */}
      {chromeVisible && document ? (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", top: 116, right: 14, zIndex: 15 }}
        >
          <Pressable
            onPress={() => setAskOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Ask about this passage"
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: withAlpha(palette.surfaceContainer, 0.75),
              borderWidth: 1,
              borderColor: withAlpha(palette.accent, 0.4),
            }}
          >
            <MaterialIcons name="auto-awesome" size={15} color={palette.accent} />
            <Text
              style={{
                marginLeft: 6,
                color: palette.accent,
                fontFamily: "SpaceGrotesk_600SemiBold",
                fontSize: 13,
              }}
            >
              Ask
            </Text>
          </Pressable>
        </View>
      ) : null}

      {selection ? (
        <SelectionBar
          wordCount={selection.end - selection.start + 1}
          onHighlight={applyHighlight}
          onExplain={explainSelection}
          onCancel={() => setSelection(null)}
        />
      ) : null}

      {/* P4 §5.2 — the always-reachable re-summon affordance: while chrome is
          hidden (immersive playback) this is the one persistent control that
          brings the player back; tapping the text still works, but margins
          and muscle-memory both get a real target. ≥44px (WCAG 2.5.5). */}
      {!chromeVisible && !playerExpanded && viewMode === "text" && words.length > 0 ? (
        <Pressable
          onPress={() => setChromeVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Show player"
          style={{
            position: "absolute",
            right: 14,
            bottom: 24,
            minWidth: 44,
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: withAlpha(palette.surfaceContainer, 0.85),
            borderWidth: 1,
            borderColor: withAlpha(palette.accent, 0.4),
            zIndex: 20,
          }}
        >
          <MaterialIcons
            name={playback.playing ? "graphic-eq" : "play-arrow"}
            size={18}
            color={palette.accent}
          />
          <Text
            style={{
              marginLeft: 6,
              color: palette.accent,
              fontFamily: "SpaceGrotesk_600SemiBold",
              fontSize: 13,
            }}
          >
            Player
          </Text>
        </Pressable>
      ) : null}

      {(chromeVisible || playerExpanded) && viewMode === "text" && words.length > 0 ? (
        <TidalPlayer
          playing={playback.playing}
          wordIndex={playback.wordIndex}
          chapterIndex={activeSection}
          chapterCount={sections.length}
          chapterStart={sectionSpans[activeSection]?.start ?? 0}
          chapterEnd={sectionSpans[activeSection]?.end ?? words.length}
          sectionHeading={currentHeading}
          docTitle={activeDocument.title}
          docSubtitle={activeDocument.subtitle}
          expanded={playerExpanded}
          onExpand={() => dispatch(setPlayerExpanded(true))}
          onCollapse={() => {
            dispatch(setPlayerExpanded(false));
            setChromeVisible(true); // reveal the mini-player, not a bare page
          }}
          onAsk={() => setAskOpen(true)}
          onSeek={seekTo}
          onTogglePlay={togglePlay}
          onPrevChapter={() =>
            jumpToSection(Math.max(0, activeSection - 1))
          }
          onNextChapter={() =>
            jumpToSection(Math.min(sections.length - 1, activeSection + 1))
          }
          onOpenChapters={() => setTocOpen(true)}
          wpm={wpm}
          onWpm={(value) => dispatch(setWpm(value))}
          voice={voice}
          onVoice={(value) => dispatch(setVoice(value))}
        />
      ) : null}

      <TocSheet
        visible={tocOpen}
        onClose={() => setTocOpen(false)}
        sections={sections}
        sectionSpans={sectionSpans}
        wpm={wpm}
        activeSection={activeSection}
        onJumpSection={jumpToSection}
        bookmarks={bookmarks}
        onJumpBookmark={(bm) => {
          seekTo(bm.wordStart);
          const next = sectionSpans.findIndex(
            (s) => bm.wordStart >= s.start && bm.wordStart < s.end
          );
          if (next >= 0) setActiveSection(next);
          setTocOpen(false);
        }}
        onDeleteBookmark={(bm) =>
          dispatch(removeAnnotation({ annotationId: bm._id }))
        }
      />

      <DisplayOptionsSheet
        visible={displayOpen}
        onClose={() => setDisplayOpen(false)}
      />

      <GoToPageModal
        visible={gotoOpen}
        pageCount={activeDocument.pageCount}
        onClose={() => setGotoOpen(false)}
        onGo={goToPage}
      />

      <AskSheet
        visible={askOpen}
        onClose={() => setAskOpen(false)}
        onAsk={submitQuestion}
        messages={chat}
        asking={asking}
        contextLabel={
          askOpen ? paragraphAtCursor().paragraph.slice(0, 140) : ""
        }
      />

      <StudySheet
        visible={studyOpen}
        onClose={() => setStudyOpen(false)}
        documentId={activeDocument.id}
        documentTitle={activeDocument.title}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Go to page
// ---------------------------------------------------------------------------

function GoToPageModal({ visible, pageCount, onClose, onGo }) {
  const palette = usePalette();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (visible) setValue("");
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: withAlpha("#000000", 0.5),
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 320,
            borderRadius: 18,
            backgroundColor: withAlpha(palette.surfaceContainer, 0.98),
            padding: 20,
          }}
        >
          <Text
            style={{
              color: palette.onSurface,
              fontFamily: "SpaceGrotesk_600SemiBold",
              fontSize: 16,
            }}
          >
            Go to page
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={`1 – ${pageCount || 1}`}
              placeholderTextColor={palette.onSurfaceVariant}
              keyboardType="number-pad"
              autoFocus
              onSubmitEditing={() => {
                const n = parseInt(value, 10);
                if (n > 0) onGo(n);
              }}
              accessibilityLabel="Page number"
              style={{
                flex: 1,
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderRadius: 12,
                backgroundColor: palette.surfaceHigh,
                color: palette.onSurface,
                fontFamily: "JetBrainsMono_400Regular",
                fontSize: 16,
              }}
            />
            <Pressable
              onPress={() => {
                const n = parseInt(value, 10);
                if (n > 0) onGo(n);
              }}
              accessibilityRole="button"
              accessibilityLabel="Go"
              style={{
                paddingHorizontal: 20,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: withAlpha(palette.accent, 0.16),
                borderWidth: 1,
                borderColor: withAlpha(palette.accent, 0.45),
              }}
            >
              <Text
                style={{
                  color: palette.accent,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                Go
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reading surface
// ---------------------------------------------------------------------------

function ReaderBody({
  visibleSections,
  sectionKey,
  currentWordIndex,
  ranges,
  chat,
  askingId,
  emptyNotice,
  onRetryText,
  layout,
  readerFontFamily,
  readerFontSize,
  readerLineHeight,
  readerExtraLetterSpacing,
  onWordPress,
  onWordLongPress,
  highlightsByPid,
  selection,
  onSurfaceTap,
  equationColor,
}) {
  const palette = usePalette();
  const scrollRef = useRef(null);
  const maxWidth = layout === "focus" ? 520 : layout === "paginated" ? 680 : 720;

  // P7: this component re-renders on EVERY karaoke boundary (the moving
  // word), and the per-paragraph lookups below used to be linear scans —
  // ranges.find over the whole document's ranges (thousands of entries on a
  // big book) plus a display-math regex and a chat filter, once per visible
  // paragraph per tick. Precompute on identity change; O(1) per paragraph
  // at render time.
  const rangeByPid = useMemo(
    () => new Map(ranges.map((entry) => [entry.pid, entry])),
    [ranges]
  );
  const latexBySection = useMemo(() => {
    const map = new Map();
    for (const s of visibleSections || []) {
      map.set(s.id, s.paragraphs.map((p) => blockMathOf(p)));
    }
    return map;
  }, [visibleSections]);
  const chatByPid = useMemo(() => {
    const map = new Map();
    for (const m of chat || []) {
      if (!m.paragraphId) continue;
      const arr = map.get(m.paragraphId) || [];
      arr.push(m);
      map.set(m.paragraphId, arr);
    }
    return map;
  }, [chat]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [sectionKey]);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: 118, // clears the translucent top bar
        paddingBottom: 240, // clears the docked player
        alignItems: "center",
      }}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        onPress={onSurfaceTap}
        accessibilityLabel="Toggle reader controls"
        style={{ maxWidth, width: "100%" }}
      >
        {!visibleSections?.[0]?.paragraphs?.length && emptyNotice ? (
          <View style={{ marginTop: 28 }}>
            <Text
              accessibilityRole="alert"
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 15,
                lineHeight: 22,
              }}
            >
              {emptyNotice}
            </Text>
            {onRetryText ? (
              <Pressable
                onPress={onRetryText}
                accessibilityRole="button"
                accessibilityLabel="Retry loading the document text"
                style={{
                  marginTop: 14,
                  alignSelf: "flex-start",
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: withAlpha(palette.accent, 0.14),
                  borderWidth: 1,
                  borderColor: withAlpha(palette.accent, 0.4),
                }}
              >
                <Text
                  style={{
                    color: palette.accent,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 14,
                  }}
                >
                  Retry
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {(visibleSections || []).map((section) => (
          <View key={section.id}>
            <Text
              style={{
                color: palette.onSurface,
                fontFamily: "SpaceGrotesk_700Bold",
                fontSize: 21,
                marginTop: 8,
                marginBottom: 16,
                letterSpacing: -0.4,
              }}
            >
              {section.heading}
            </Text>
            {section.paragraphs.map((paragraph, index) => {
              const paragraphId = `${section.id}-${index}`;
              const range = rangeByPid.get(paragraphId) || { start: 0, end: 0 };
              const latex = latexBySection.get(section.id)?.[index] ?? null;
              const notesForParagraph = chatByPid.get(paragraphId) || EMPTY_CHAT;
              const paraHighlights = highlightsByPid.get(paragraphId) || null;
              // clip the live selection to this paragraph (primitives → memo-safe)
              let selFrom = -1;
              let selTo = -1;
              if (selection) {
                selFrom = Math.max(selection.start, range.start);
                selTo = Math.min(selection.end, range.end - 1);
                if (selFrom > selTo) {
                  selFrom = -1;
                  selTo = -1;
                }
              }

              return (
                <View key={paragraphId} style={{ marginVertical: 8 }}>
                  {latex ? (
                    <View
                      style={
                        currentWordIndex === range.start && range.end > range.start
                          ? {
                              borderLeftWidth: 3,
                              borderLeftColor: palette.accent,
                              backgroundColor: withAlpha(palette.accent, 0.06),
                              borderRadius: 8,
                            }
                          : null
                      }
                    >
                      <MathView latex={latex} color={equationColor} fontSize={17} />
                    </View>
                  ) : isUnicodeMathParagraph(paragraph) ? (
                    <EquationCard
                      text={paragraph}
                      active={currentWordIndex === range.start && range.end > range.start}
                    />
                  ) : (
                    <ParagraphText
                      text={paragraph}
                      firstWordIndex={range.start}
                      wordCount={range.end - range.start}
                      currentWordIndex={currentWordIndex}
                      fontFamily={readerFontFamily}
                      fontSize={readerFontSize}
                      lineHeight={readerFontSize * readerLineHeight}
                      letterSpacing={readerExtraLetterSpacing ? 0.6 : 0}
                      onWordPress={onWordPress}
                      onWordLongPress={onWordLongPress}
                      highlights={paraHighlights}
                      selFrom={selFrom}
                      selTo={selTo}
                      askActive={askingId === paragraphId}
                    />
                  )}
                  {layout === "split"
                    ? notesForParagraph.map((note) => (
                        <MarginNote key={note.id} note={note} />
                      ))
                    : null}
                </View>
              );
            })}
          </View>
        ))}
      </Pressable>
    </ScrollView>
  );
}

// A PDF-extracted equation (unicode, no LaTeX source): centered serif card,
// visually distinct from prose, excluded from TTS. True typesetting lives in
// the Original-pages view.
function EquationCard({ text, active }) {
  const palette = usePalette();
  return (
    <View
      style={{
        alignSelf: "stretch",
        marginVertical: 4,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: active
          ? withAlpha(palette.accent, 0.1)
          : withAlpha(palette.tertiary, 0.06),
        borderLeftWidth: active ? 3 : 2,
        borderLeftColor: active
          ? palette.accent
          : withAlpha(palette.tertiary, 0.45),
      }}
    >
      <Text
        selectable
        style={{
          color: palette.onSurface,
          fontFamily: Platform.OS === "web" ? "Georgia, 'Times New Roman', serif" : "serif",
          fontStyle: "italic",
          fontSize: 16,
          lineHeight: 26,
          textAlign: "center",
        }}
      >
        {text}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Karaoke paragraph (word-level) — memoized; only re-renders when the read
// cursor moves relative to it, its highlights change, or selection touches it.
// ---------------------------------------------------------------------------

function paragraphHighlightEqual(prev, next) {
  if (
    prev.text !== next.text ||
    prev.firstWordIndex !== next.firstWordIndex ||
    prev.wordCount !== next.wordCount ||
    prev.fontFamily !== next.fontFamily ||
    prev.fontSize !== next.fontSize ||
    prev.lineHeight !== next.lineHeight ||
    prev.letterSpacing !== next.letterSpacing ||
    prev.onWordPress !== next.onWordPress ||
    prev.onWordLongPress !== next.onWordLongPress ||
    prev.highlights !== next.highlights ||
    prev.selFrom !== next.selFrom ||
    prev.selTo !== next.selTo ||
    prev.askActive !== next.askActive
  ) {
    return false;
  }
  const clamp = (cursor, first, count) =>
    Math.max(-1, Math.min(count, cursor - first));
  return (
    clamp(prev.currentWordIndex, prev.firstWordIndex, prev.wordCount) ===
    clamp(next.currentWordIndex, next.firstWordIndex, next.wordCount)
  );
}

const ParagraphText = memo(function ParagraphText({
  text,
  firstWordIndex,
  currentWordIndex,
  fontFamily,
  fontSize,
  lineHeight,
  letterSpacing,
  onWordPress,
  onWordLongPress,
  highlights,
  selFrom,
  selTo,
  askActive,
}) {
  const palette = usePalette();
  // MUST be the same tokenizer the words/karaoke memo uses — a divergence
  // would shift every highlight after the first inline equation.
  // (P7: memoized — the ACTIVE paragraph re-renders on every karaoke tick
  // and was re-tokenizing its full text each time.)
  const tokens = useMemo(() => tokenizeMathParagraph(text), [text]);

  return (
    <View
      style={{
        paddingLeft: 12,
        borderLeftWidth: 2,
        borderLeftColor: askActive ? withAlpha(palette.accent, 0.6) : "transparent",
      }}
    >
      <Text
        selectable={false}
        style={{
          fontFamily,
          fontSize,
          lineHeight,
          letterSpacing,
          color: palette.onSurface,
        }}
      >
        {tokens.map(({ display: word, latex }, index) => {
          const globalIndex = firstWordIndex + index;
          const isRead = globalIndex < currentWordIndex;
          const isCurrent = globalIndex === currentWordIndex;
          const isSelected = selFrom >= 0 && globalIndex >= selFrom && globalIndex <= selTo;
          let highlightColor = null;
          if (highlights) {
            for (const h of highlights) {
              if (globalIndex >= h.s && globalIndex <= h.e) {
                highlightColor = h.color;
                break;
              }
            }
          }
          return (
            <Text
              key={`${word}-${index}`}
              onPress={onWordPress ? () => onWordPress(globalIndex) : undefined}
              onLongPress={
                onWordLongPress ? () => onWordLongPress(globalIndex) : undefined
              }
              style={{
                color: isRead
                  ? withAlpha(palette.onSurfaceVariant, 0.55)
                  : latex
                    ? palette.tertiary
                    : palette.onSurface,
                // inline math: serif italic + gold tint — visibly "math"
                // while staying a real Text node (karaoke + selection work)
                fontFamily: latex
                  ? Platform.OS === "web"
                    ? "Georgia, 'Times New Roman', serif"
                    : "serif"
                  : undefined,
                fontStyle: latex ? "italic" : "normal",
                backgroundColor: isCurrent
                  ? withAlpha(palette.accent, 0.22)
                  : isSelected
                    ? withAlpha(palette.accent, 0.32)
                    : highlightColor
                      ? withAlpha(highlightColor, 0.3)
                      : "transparent",
                textDecorationLine: isCurrent ? "underline" : "none",
                textDecorationColor: palette.accent,
              }}
            >
              {word}
              {index === tokens.length - 1 ? "" : " "}
            </Text>
          );
        })}
      </Text>
    </View>
  );
}, paragraphHighlightEqual);

// ---------------------------------------------------------------------------
// Q&A margin note (split layout)
// ---------------------------------------------------------------------------

function MarginNote({ note }) {
  const palette = usePalette();

  return (
    <View
      style={{
        padding: 14,
        borderRadius: 14,
        marginVertical: 6,
        backgroundColor: withAlpha(palette.accent, 0.06),
        borderLeftWidth: 2,
        borderLeftColor: palette.accent,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <MaterialIcons name="auto-awesome" size={14} color={palette.accent} />
        <View style={{ width: 6 }} />
        <Text
          style={{
            color: palette.accent,
            fontFamily: "Inter_600SemiBold",
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          ASKED
        </Text>
      </View>
      <View style={{ height: 6 }} />
      <Text
        style={{
          color: palette.onSurface,
          fontFamily: "Inter_600SemiBold",
          fontSize: 14,
        }}
      >
        {note.question}
      </Text>
      <View style={{ height: 6 }} />
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_400Regular",
          fontSize: 13,
          lineHeight: 20,
        }}
      >
        {note.answer}
      </Text>
      {note.citations?.length ? (
        <View
          style={{
            flexDirection: "row",
            marginTop: 8,
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {note.citations.map((citation) => (
            <View
              key={citation}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: palette.surfaceHighest,
              }}
            >
              <Text
                style={{
                  color: palette.onSurfaceVariant,
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 10,
                }}
              >
                {citation}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Original pages view
// ---------------------------------------------------------------------------

function PdfPagesView({ listRef, documentId, pageCount, initialPage, onPageChange, onTapPage }) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width - 16, 900);
  const pageHeight = Math.round(pageWidth * 1.35);
  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i + 1),
    [pageCount]
  );

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems?.length && onPageChange) {
      onPageChange(viewableItems[0].item);
    }
  }).current;

  return (
    <FlatList
      ref={listRef}
      data={pages}
      keyExtractor={(n) => String(n)}
      initialNumToRender={2}
      maxToRenderPerBatch={3}
      windowSize={5}
      // P4: open on the page that matches the reading cursor — the view
      // remounts on every toggle, so initialScrollIndex is enough
      initialScrollIndex={Math.max(0, Math.min(pageCount - 1, (initialPage || 1) - 1))}
      onScrollToIndexFailed={() => {}}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 55 }}
      getItemLayout={(_, index) => ({
        length: pageHeight + 34,
        offset: (pageHeight + 34) * index,
        index,
      })}
      contentContainerStyle={{ paddingTop: 108, paddingBottom: 60, alignItems: "center" }}
      renderItem={({ item: n }) => (
        <Pressable onPress={onTapPage} style={{ marginTop: 8, alignItems: "center" }}>
          <Image
            source={{ uri: documentPageUrl(documentId, n) }}
            style={{
              width: pageWidth,
              height: pageHeight,
              backgroundColor: "#FFFFFF",
              borderRadius: 4,
            }}
            resizeMode="contain"
            accessibilityLabel={`Page ${n}`}
          />
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "JetBrainsMono_400Regular",
              fontSize: 10,
              marginTop: 4,
            }}
          >
            {n} / {pageCount}
          </Text>
        </Pressable>
      )}
    />
  );
}
