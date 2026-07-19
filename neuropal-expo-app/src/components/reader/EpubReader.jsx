import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Toast from "../toast";

import {
  epubChapterBaseUrl,
  fetchEpubChapterApi,
  fetchEpubManifestApi,
  fetchReadingProgressApi,
  saveReadingProgressApi,
} from "../../services/network";
import { speakWords } from "../../services/tts";
import { appStore } from "../../store";
import {
  selectReaderAsking,
  selectReaderMessages,
  selectReaderPlayback,
  selectUiState,
} from "../../store/selectors";
import {
  addAnnotation,
  loadAnnotations,
  pauseReader,
  playReader,
  removeAnnotation,
  requestReaderAnswer,
  resetReader,
  setPlayerExpanded,
  setReaderDocId,
  setReaderTotalWords,
  setReaderWord,
} from "../../store/slices/readerSlice";
import { setVoice, setWpm } from "../../store/slices/uiSlice";
import { usePalette } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";
import { AskSheet } from "./AskSheet";
import { DisplayOptionsSheet } from "./DisplayOptionsSheet";
import { EpubTocSheet } from "./EpubTocSheet";
import { ReaderTopBar } from "./ReaderTopBar";
import { SelectionBar } from "./SelectionBar";
import { TidalPlayer } from "./TidalPlayer";
import { buildChapterHtml, epubThemeCss } from "./epubRuntime";

// Issue 1 — the Google-Play-Books-style EPUB reader.
//
// DISPLAY: one spine chapter at a time, the publisher's own XHTML/CSS served
// from the backend's epub mount and rendered in a WebView (native) / iframe
// (web). Equations are whatever the publisher shipped (<img>/SVG/MathML) —
// rendered exactly, never round-tripped through text extraction.
//
// AUDIO/RAG: the in-page runtime (epubRuntime.js) walks the LIVE chapter DOM
// once and exports the token stream; TTS reads that exact stream (one
// tokenization by construction) and every boundary event is mirrored back as
// a karaoke highlight via the CSS Custom Highlight API.
//
// Readable IMMEDIATELY on upload — ingest only powers Ask.

// react-native-webview has no web target; the web build uses a same-origin
// srcdoc iframe instead (full DOM access, no CORS involvement).
const WebView =
  Platform.OS === "web" ? null : require("react-native-webview").WebView;

// Annotations store ONE number, but epub positions are (spine, token). The
// pair packs as spine*STRIDE + token — no real chapter approaches a million
// tokens, so the encoding is unambiguous and existing word-anchored
// annotation plumbing keeps working untouched.
const STRIDE = 1000000;
const packPos = (spine, token) => spine * STRIDE + token;
const unpackPos = (v) => ({ spine: Math.floor(v / STRIDE), token: v % STRIDE });


export function EpubReader({ document: doc }) {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const palette = usePalette();
  const ui = useSelector(selectUiState);
  const playback = useSelector(selectReaderPlayback);
  const playerExpanded = useSelector((s) => s.reader.playerExpanded);
  const chat = useSelector(selectReaderMessages);
  const asking = useSelector(selectReaderAsking);
  const annotations = useSelector((s) => s.reader.annotations);
  const { wpm, voice, speakEquations } = ui;

  const [manifest, setManifest] = useState(null);
  const [manifestError, setManifestError] = useState(null);
  const [spineIndex, setSpineIndex] = useState(0);
  const [chapterHtml, setChapterHtml] = useState(null);
  const [tokens, setTokens] = useState(null); // {words,kinds,pids,pageAnchors}
  const [chromeVisible, setChromeVisible] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [selection, setSelection] = useState(null); // {start,end,text} token idx

  const webviewRef = useRef(null);
  const iframeRef = useRef(null);
  const ttsRef = useRef(null);
  const simTimerRef = useRef(null);
  const boundaryLiveRef = useRef(false);
  const settingsRestartRef = useRef(null);
  const tokensRef = useRef(null);
  const spineIndexRef = useRef(0);
  const pendingWordRef = useRef(0); // token to restore once tokens arrive
  const pendingAnchorRef = useRef(null); // element id to land on (TOC jump)
  const autoplayRef = useRef(false); // continue playback across a chapter turn
  const prefetchRef = useRef(new Map()); // href → chapter xhtml (next-chapter preload)

  tokensRef.current = tokens;
  spineIndexRef.current = spineIndex;

  const themeCss = useMemo(
    () =>
      epubThemeCss({
        palette,
        fontKey: ui.readerFont,
        fontSize: ui.fontSize,
        lineSpacing: ui.lineSpacing,
        margin: ui.readerMargin,
      }),
    [palette, ui.readerFont, ui.fontSize, ui.lineSpacing, ui.readerMargin]
  );
  const themeCssRef = useRef(themeCss);
  themeCssRef.current = themeCss;

  // ---- command channel into the page --------------------------------------
  const sendCmd = useCallback((js) => {
    if (Platform.OS === "web") {
      try {
        iframeRef.current?.contentWindow?.__npExec?.(js);
      } catch (e) {}
    } else {
      webviewRef.current?.injectJavaScript(`${js};true;`);
    }
  }, []);

  // ---- audio --------------------------------------------------------------
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

  const persistProgress = useCallback(() => {
    const t = tokensRef.current;
    if (!doc?.id) return;
    const st = appStore.getState().reader;
    const spine = spineIndexRef.current;
    const spineCount = manifest?.spine?.length || 1;
    const frac = t && t.words.length > 0 ? st.wordIndex / t.words.length : 0;
    saveReadingProgressApi(doc.id, {
      lastWordIndex: st.wordIndex,
      lastPage: spine, // spine index rides the existing lastPage field
      progress: Math.min(1, (spine + frac) / spineCount),
    });
  }, [doc?.id, manifest?.spine?.length]);

  const goToChapterRef = useRef(null);

  const startPlaybackFrom = useCallback(
    (startIndex) => {
      const t = tokensRef.current;
      if (!t || t.words.length === 0) return;
      boundaryLiveRef.current = false;
      const pitch = voice === "deep" ? 0.85 : voice === "natural" ? 1 : 1.1;
      const voiceIdentifier = appStore.getState().ui.voiceId;
      const rate = Math.min(2.4, Math.max(0.25, wpm / 400));

      // ONE tokenization: the engine speaks the exact exported stream.
      // Equation/image tokens speak per the Speak-equations setting (no
      // LaTeX exists for publisher images, so "aloud" says "equation" too).
      const speech = t.words.map((w, i) => {
        const kind = t.kinds[i];
        if (kind === "w") return w;
        if (kind === "eq") return speakEquations === "off" ? "" : "equation";
        return ""; // plain figures stay silent
      });

      ttsRef.current = speakWords({
        words: t.words,
        speechWords: speech,
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
          sendCmd(`window.epubHighlight&&epubHighlight(${wordIndex})`);
        },
        onChunkStart: (wordIndex) => {
          if (!boundaryLiveRef.current) {
            dispatch(setReaderWord(wordIndex));
            sendCmd(`window.epubHighlight&&epubHighlight(${wordIndex})`);
          }
        },
        onDone: () => {
          // roll into the next spine chapter, Audible-style
          const si = spineIndexRef.current;
          const count = manifest?.spine?.length || 0;
          if (appStore.getState().reader.playing && si + 1 < count) {
            goToChapterRef.current?.(si + 1, { word: 0, autoplay: true });
          } else {
            dispatch(pauseReader());
          }
        },
        onError: () => dispatch(pauseReader()),
      });

      simTimerRef.current = setInterval(() => {
        if (!boundaryLiveRef.current) {
          const st = appStore.getState().reader;
          if (st.wordIndex + 1 < st.totalWords) {
            dispatch(setReaderWord(st.wordIndex + 1));
            sendCmd(`window.epubHighlight&&epubHighlight(${st.wordIndex + 1})`);
          }
        }
        if (!appStore.getState().reader.playing && simTimerRef.current) {
          clearInterval(simTimerRef.current);
          simTimerRef.current = null;
        }
      }, 60000 / wpm);
    },
    [dispatch, voice, wpm, speakEquations, sendCmd, manifest?.spine?.length]
  );

  const seekTo = useCallback(
    (index) => {
      const t = tokensRef.current;
      if (!t) return;
      const clamped = Math.max(0, Math.min(t.words.length - 1, index));
      const wasPlaying = appStore.getState().reader.playing;
      stopSpeech();
      dispatch(setReaderWord(clamped));
      sendCmd(`window.epubHighlight&&epubHighlight(${clamped})`);
      if (wasPlaying) startPlaybackFrom(clamped);
      persistProgress();
    },
    [stopSpeech, dispatch, sendCmd, startPlaybackFrom, persistProgress]
  );

  const togglePlay = useCallback(() => {
    const t = tokensRef.current;
    if (!t || t.words.length === 0) return;
    if (appStore.getState().reader.playing) {
      stopSpeech();
      dispatch(pauseReader());
      setChromeVisible(true);
      persistProgress();
      return;
    }
    const st = appStore.getState().reader;
    const atEnd = st.wordIndex >= t.words.length - 1;
    const from = atEnd ? 0 : st.wordIndex;
    if (atEnd) dispatch(setReaderWord(0));
    dispatch(playReader());
    startPlaybackFrom(from);
    setChromeVisible(false);
  }, [dispatch, stopSpeech, startPlaybackFrom, persistProgress]);

  // ---- chapter loading ----------------------------------------------------
  const goToChapter = useCallback(
    (si, { word = 0, autoplay = false, anchor = null } = {}) => {
      const count = manifest?.spine?.length || 0;
      if (si < 0 || si >= count) return;
      // same chapter (a TOC section anchor within the open file): no reload —
      // the spine effect wouldn't re-run, so act on the live page directly
      if (si === spineIndexRef.current && tokensRef.current) {
        if (anchor) {
          sendCmd(`window.epubSeekAnchor&&epubSeekAnchor(${JSON.stringify(anchor)})`);
        } else {
          seekTo(word);
        }
        return;
      }
      stopSpeech();
      if (!autoplay) dispatch(pauseReader());
      pendingWordRef.current = word;
      pendingAnchorRef.current = anchor;
      autoplayRef.current = autoplay;
      setTokens(null);
      setSelection(null);
      setSpineIndex(si);
      persistProgress();
    },
    [manifest?.spine?.length, stopSpeech, dispatch, persistProgress, sendCmd, seekTo]
  );
  goToChapterRef.current = goToChapter;

  // open: register the doc globally, pull manifest + resume point
  useEffect(() => {
    if (!doc?.id) return undefined;
    let active = true;
    dispatch(resetReader());
    dispatch(setReaderDocId(doc.id));
    dispatch(loadAnnotations({ documentId: doc.id }));
    setManifest(null);
    setManifestError(null);
    setChapterHtml(null);
    setTokens(null);
    prefetchRef.current = new Map();

    Promise.all([
      fetchEpubManifestApi(doc.id),
      fetchReadingProgressApi(doc.id),
    ])
      .then(([m, progress]) => {
        if (!active) return;
        const si = Math.min(
          Math.max(0, progress?.lastPage || 0),
          Math.max(0, (m.spine?.length || 1) - 1)
        );
        pendingWordRef.current = Math.max(0, progress?.lastWordIndex || 0);
        setManifest(m);
        setSpineIndex(si);
      })
      .catch((error) => {
        if (active) setManifestError(error?.message || "Could not open the EPUB.");
      });

    return () => {
      active = false;
      stopSpeech();
      dispatch(pauseReader());
    };
  }, [doc?.id, dispatch, stopSpeech]);

  // spine → chapter html (with next-chapter preload; the previous WebView
  // content is destroyed by the source swap itself)
  useEffect(() => {
    if (!manifest || !manifest.spine?.length) return undefined;
    const entry = manifest.spine[spineIndex];
    if (!entry) return undefined;
    let active = true;

    const pageAnchorsFor = (href) =>
      (manifest.pageList || [])
        .filter((p) => p.href === href)
        .map((p) => ({ page: p.page, anchor: p.anchor }));

    const load = async () => {
      try {
        const cached = prefetchRef.current.get(entry.href);
        const xhtml = cached || (await fetchEpubChapterApi(doc.id, entry.href));
        if (!active) return;
        setChapterHtml(
          buildChapterHtml({
            chapterXhtml: xhtml,
            baseHref: epubChapterBaseUrl(doc.id, entry.href),
            themeCss: themeCssRef.current,
            pageAnchors: pageAnchorsFor(entry.href),
          })
        );
        // preload the NEXT chapter so the page turn is instant
        const next = manifest.spine[spineIndex + 1];
        if (next && !prefetchRef.current.has(next.href)) {
          fetchEpubChapterApi(doc.id, next.href)
            .then((html) => {
              prefetchRef.current.set(next.href, html);
              if (prefetchRef.current.size > 4) {
                const first = prefetchRef.current.keys().next().value;
                prefetchRef.current.delete(first);
              }
            })
            .catch(() => {});
        }
      } catch (error) {
        if (active) setManifestError(error?.message || "Could not load the chapter.");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [manifest, spineIndex, doc.id]);

  // live theme edits restyle the open chapter in place
  useEffect(() => {
    sendCmd(`window.epubTheme&&epubTheme(${JSON.stringify(themeCss)})`);
  }, [themeCss, sendCmd]);

  // saved highlights for THIS chapter → runtime highlight buckets (same
  // color order as SelectionBar: tertiary / secondary / accent / warn)
  useEffect(() => {
    if (!tokens) return;
    const buckets = [palette.tertiary, palette.secondary, palette.accent, palette.warn];
    const ranges = annotations
      .filter((a) => a.kind === "highlight")
      .map((a) => ({ s: unpackPos(a.wordStart), e: unpackPos(a.wordEnd), color: a.color }))
      .filter((a) => a.s.spine === spineIndex)
      .map((a) => ({
        start: a.s.token,
        end: a.e.token,
        colorIndex: Math.max(0, buckets.indexOf(a.color)),
      }));
    sendCmd(`window.epubSetSaved&&epubSetSaved(${JSON.stringify(ranges)})`);
  }, [annotations, tokens, spineIndex, sendCmd, palette]);

  // ---- messages from the page --------------------------------------------
  const handleMessage = useCallback(
    (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "tokens") {
        const t = {
          words: msg.words || [],
          kinds: msg.kinds || [],
          pids: msg.pids || [],
          pageAnchors: msg.pageAnchors || [],
        };
        setTokens(t);
        tokensRef.current = t;
        dispatch(setReaderTotalWords(t.words.length));
        const word = Math.min(
          Math.max(0, pendingWordRef.current),
          Math.max(0, t.words.length - 1)
        );
        pendingWordRef.current = 0;
        dispatch(setReaderWord(word));
        if (pendingAnchorRef.current) {
          const id = pendingAnchorRef.current;
          pendingAnchorRef.current = null;
          sendCmd(`window.epubSeekAnchor&&epubSeekAnchor(${JSON.stringify(id)})`);
        } else if (word > 0) {
          sendCmd(`window.epubHighlight&&epubHighlight(${word})`);
        }
        if (autoplayRef.current) {
          autoplayRef.current = false;
          dispatch(playReader());
          startPlaybackFrom(word);
        }
        persistProgress(); // resume point lands in the NEW chapter
        return;
      }
      if (msg.type === "tap") {
        seekTo(msg.index);
        return;
      }
      if (msg.type === "chrome") {
        setChromeVisible((v) => !v);
        return;
      }
      if (msg.type === "sel") {
        setSelection({ start: msg.start, end: msg.end, text: msg.text || "" });
        return;
      }
      if (msg.type === "sel-clear") {
        setSelection(null);
      }
    },
    [dispatch, sendCmd, seekTo, startPlaybackFrom, persistProgress]
  );
  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  // web: srcdoc iframe posts to the parent window
  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const onMsg = (e) => {
      if (e.data && e.data.__epub) handleMessageRef.current(e.data.__epub);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // ---- lifecycle glue (same contracts as the text reader) -----------------
  useEffect(() => {
    if (!playback.playing) stopSpeech();
  }, [playback.playing, stopSpeech]);

  useFocusEffect(
    useCallback(() => () => persistProgress(), [persistProgress])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") persistProgress();
    });
    return () => sub.remove();
  }, [persistProgress]);

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

  // speed/voice changes apply mid-playback (debounced restart)
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

  // ---- derived chrome data ------------------------------------------------
  // spine position of every toc node (flattened) → current chapter title
  const tocFlat = useMemo(() => {
    if (!manifest) return [];
    const order = new Map(manifest.spine.map((s, i) => [s.href, i]));
    const out = [];
    const walk = (nodes, depth) => {
      for (const n of nodes || []) {
        const si = n.href ? order.get(n.href) : undefined;
        out.push({ ...n, depth, spineIndex: si === undefined ? null : si });
        walk(n.children, depth + 1);
      }
    };
    walk(manifest.toc, 0);
    return out;
  }, [manifest]);

  const currentTocTitle = useMemo(() => {
    let hit = null;
    for (const e of tocFlat) {
      if (e.spineIndex !== null && e.spineIndex <= spineIndex) hit = e.title;
      if (e.spineIndex !== null && e.spineIndex > spineIndex) break;
    }
    return hit;
  }, [tocFlat, spineIndex]);

  // REAL print pages from the page-list nav — never fabricated. Books
  // without a page-list (Griffiths) show the chapter title instead.
  const pageInfo = useMemo(() => {
    const list = manifest?.pageList || [];
    if (list.length === 0) return null;
    const lastPage = list[list.length - 1].page;
    // last in-chapter anchor at/before the cursor…
    let current = null;
    if (tokens) {
      for (const a of tokens.pageAnchors) {
        if (a.index <= playback.wordIndex) current = a.page;
        else break;
      }
    }
    // …else the last anchor in any EARLIER spine chapter
    if (current === null) {
      const order = new Map(manifest.spine.map((s, i) => [s.href, i]));
      for (const p of list) {
        const si = order.get(p.href);
        if (si !== undefined && si < spineIndex) current = p.page;
        if (si !== undefined && si >= spineIndex) break;
      }
    }
    return current === null ? null : `Page ${current} of ${lastPage}`;
  }, [manifest, tokens, playback.wordIndex, spineIndex]);

  const bookmarks = useMemo(
    () => annotations.filter((a) => a.kind === "bookmark"),
    [annotations]
  );

  const paragraphAtCursor = useCallback(() => {
    const t = tokensRef.current;
    if (!t) return "";
    const idx = appStore.getState().reader.wordIndex;
    const pid = t.pids[idx];
    if (pid === undefined) return "";
    const parts = [];
    for (let i = 0; i < t.words.length; i++) {
      if (t.pids[i] === pid && t.kinds[i] === "w") parts.push(t.words[i]);
    }
    return parts.join(" ");
  }, []);

  // ---- Ask (RAG) — powered by ingest, gated until it completes ------------
  const openAsk = useCallback(() => {
    if (doc.status && doc.status !== "ready") {
      Toast.show({
        type: "info",
        text1: "Ask needs processing to finish",
        text2: "You can read now — Ask is available when processing completes.",
      });
      return;
    }
    setAskOpen(true);
  }, [doc.status]);

  const submitQuestion = useCallback(
    (question) => {
      dispatch(
        requestReaderAnswer({
          documentId: doc.id,
          paragraphId: `epub-${spineIndexRef.current}`,
          question,
          excerpt: paragraphAtCursor().slice(0, 500),
          kind: "ask",
        })
      );
    },
    [dispatch, doc.id, paragraphAtCursor]
  );

  // ---- selection actions --------------------------------------------------
  const applyHighlight = useCallback(
    async (color) => {
      const sel = selection;
      if (!sel) return;
      try {
        await dispatch(
          addAnnotation({
            documentId: doc.id,
            kind: "highlight",
            wordStart: packPos(spineIndexRef.current, sel.start),
            wordEnd: packPos(spineIndexRef.current, sel.end),
            color,
          })
        ).unwrap();
        Toast.show({ type: "success", text1: "Highlight saved" });
      } catch (error) {
        Toast.show({ type: "error", text1: "Could not save highlight", text2: error?.message });
      }
      sendCmd("window.epubClearSelection&&epubClearSelection()");
      setSelection(null);
    },
    [selection, dispatch, doc.id, sendCmd]
  );

  const explainSelection = useCallback(() => {
    if (!selection) return;
    if (doc.status && doc.status !== "ready") {
      Toast.show({
        type: "info",
        text1: "Ask needs processing to finish",
        text2: "You can read now — Ask is available when processing completes.",
      });
      return;
    }
    dispatch(
      requestReaderAnswer({
        documentId: doc.id,
        paragraphId: `epub-${spineIndexRef.current}`,
        question: "Explain this passage.",
        excerpt: selection.text.slice(0, 500),
        kind: "explain",
      })
    );
    sendCmd("window.epubClearSelection&&epubClearSelection()");
    setSelection(null);
    setAskOpen(true);
  }, [selection, doc.id, doc.status, dispatch, sendCmd]);

  const bookmarkHere = useCallback(async () => {
    const pos = packPos(
      spineIndexRef.current,
      appStore.getState().reader.wordIndex
    );
    try {
      await dispatch(
        addAnnotation({
          documentId: doc.id,
          kind: "bookmark",
          wordStart: pos,
          wordEnd: pos,
          note: currentTocTitle || `Chapter ${spineIndexRef.current + 1}`,
        })
      ).unwrap();
      Toast.show({ type: "success", text1: "Bookmarked" });
    } catch (error) {
      Toast.show({ type: "error", text1: "Could not bookmark", text2: error?.message });
    }
  }, [dispatch, doc.id, currentTocTitle]);

  const overflowItems = useMemo(
    () => [{ key: "bookmark", label: "Bookmark here", icon: "bookmark-add", onPress: bookmarkHere }],
    [bookmarkHere]
  );

  // ---- render -------------------------------------------------------------
  const spineCount = manifest?.spine?.length || 0;

  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      {manifestError ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text
            style={{
              color: palette.error,
              fontFamily: "Inter_500Medium",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            ⚠ {manifestError}
          </Text>
        </View>
      ) : !chapterHtml ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={palette.accent} />
          <Text
            style={{
              marginTop: 12,
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
            }}
          >
            Opening book…
          </Text>
        </View>
      ) : Platform.OS === "web" ? (
        <iframe
          ref={iframeRef}
          key={`${doc.id}-${spineIndex}`}
          srcDoc={chapterHtml}
          title={doc.title || "Book chapter"}
          style={{ flex: 1, width: "100%", border: "none", backgroundColor: palette.surface }}
        />
      ) : (
        <WebView
          ref={webviewRef}
          key={`${doc.id}-${spineIndex}`}
          source={{
            html: chapterHtml,
            baseUrl: epubChapterBaseUrl(doc.id, manifest.spine[spineIndex]?.href || ""),
          }}
          onMessage={(e) => {
            try {
              handleMessageRef.current(JSON.parse(e.nativeEvent.data));
            } catch (err) {}
          }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          // the runtime preventDefaults link clicks; anything that still
          // tries to navigate the WebView away is refused
          onShouldStartLoadWithRequest={(req) =>
            req.url === "about:blank" ||
            req.url.startsWith("data:") ||
            req.navigationType !== "click"
          }
          style={{ flex: 1, backgroundColor: palette.surface }}
        />
      )}

      {chromeVisible ? (
        <ReaderTopBar
          title={doc.title}
          subtitle={pageInfo || currentTocTitle}
          onMenu={() => navigation.openDrawer()}
          onBack={() => navigation.navigate("Library")}
          onToc={() => setTocOpen(true)}
          onDisplay={() => setDisplayOpen(true)}
          overflowItems={overflowItems}
        />
      ) : null}

      {/* Issue 2 — web keeps a drawer entry point with chrome hidden */}
      {Platform.OS === "web" && !chromeVisible ? (
        <Pressable
          onPress={() => navigation.openDrawer()}
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            backgroundColor: withAlpha(palette.surfaceContainer, 0.75),
            borderWidth: 1,
            borderColor: withAlpha(palette.outlineVariant, 0.5),
            zIndex: 20,
          }}
        >
          <MaterialIcons name="menu" size={20} color={palette.onSurfaceVariant} />
        </Pressable>
      ) : null}

      {chromeVisible ? (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", top: 116, right: 14, zIndex: 15 }}
        >
          <Pressable
            onPress={openAsk}
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
          onCancel={() => {
            sendCmd("window.epubClearSelection&&epubClearSelection()");
            setSelection(null);
          }}
        />
      ) : null}

      {/* re-summon affordance while chrome is hidden (P4 §5.2 contract) */}
      {!chromeVisible && !playerExpanded && tokens ? (
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

      {(chromeVisible || playerExpanded) && tokens && tokens.words.length > 0 ? (
        <TidalPlayer
          playing={playback.playing}
          wordIndex={playback.wordIndex}
          chapterIndex={spineIndex}
          chapterCount={spineCount}
          chapterStart={0}
          chapterEnd={tokens.words.length}
          sectionHeading={currentTocTitle || doc.title}
          docTitle={doc.title}
          docSubtitle={pageInfo || doc.subtitle}
          expanded={playerExpanded}
          onExpand={() => dispatch(setPlayerExpanded(true))}
          onCollapse={() => {
            dispatch(setPlayerExpanded(false));
            setChromeVisible(true);
          }}
          onAsk={openAsk}
          onSeek={seekTo}
          onTogglePlay={togglePlay}
          onPrevChapter={() => goToChapter(Math.max(0, spineIndex - 1))}
          onNextChapter={() => goToChapter(Math.min(spineCount - 1, spineIndex + 1))}
          onOpenChapters={() => setTocOpen(true)}
          wpm={wpm}
          onWpm={(value) => dispatch(setWpm(value))}
          voice={voice}
          onVoice={(value) => dispatch(setVoice(value))}
        />
      ) : null}

      <EpubTocSheet
        visible={tocOpen}
        onClose={() => setTocOpen(false)}
        tocFlat={tocFlat}
        pageList={manifest?.pageList || []}
        spineIndex={spineIndex}
        onJump={(item) => {
          if (item.spineIndex === null) return;
          setTocOpen(false);
          goToChapter(item.spineIndex, { word: 0, anchor: item.anchor || null });
        }}
        bookmarks={bookmarks}
        onJumpBookmark={(bm) => {
          const { spine, token } = unpackPos(bm.wordStart);
          setTocOpen(false);
          if (spine === spineIndexRef.current) seekTo(token);
          else goToChapter(spine, { word: token });
        }}
        onDeleteBookmark={(bm) => dispatch(removeAnnotation({ annotationId: bm._id }))}
      />

      <DisplayOptionsSheet
        visible={displayOpen}
        onClose={() => setDisplayOpen(false)}
        epub
      />

      <AskSheet
        visible={askOpen}
        onClose={() => setAskOpen(false)}
        onAsk={submitQuestion}
        messages={chat}
        asking={asking}
        contextLabel={askOpen ? paragraphAtCursor().slice(0, 140) : ""}
      />
    </View>
  );
}
