import { MaterialIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { GlassPanel, withAlpha } from "../components/primitives";
import { StudySheet } from "../components/StudySheet";
import { documentPageUrl, USE_MOCK } from "../services/network";
import { speakWords } from "../services/tts";
import { appStore } from "../store";
import {
  selectDocumentById,
  selectReaderDoc,
  selectReaderMessages,
  selectReaderPlayback,
  selectUiState,
} from "../store/selectors";
import {
  advanceReader,
  fetchReaderDocument,
  pauseReader,
  playReader,
  requestReaderAnswer,
  resetReader,
  setReaderTotalWords,
  setReaderWord,
} from "../store/slices/readerSlice";
import { setVoice, setWpm } from "../store/slices/uiSlice";
import { usePalette, useTheme } from "../theme/ThemeProvider";

// Stable fallback so the words/ranges memo doesn't recompute when there is
// simply no content.
const EMPTY_SECTIONS = [];

export function ReaderScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const palette = usePalette();
  const dispatch = useDispatch();
  const { readerFontFamily, readerFontSize, readerLineHeight, readerExtraLetterSpacing } =
    useTheme();
  const { id } = route.params || {};

  const document = useSelector((state) => selectDocumentById(state, id));
  const { readerLayout, voice, wpm } = useSelector(selectUiState);
  const playback = useSelector(selectReaderPlayback);
  const chat = useSelector(selectReaderMessages);
  const readerDoc = useSelector(selectReaderDoc);

  // Backend documents carry no `sections` (mock ones do) — pull the ingested
  // text from GET /documents/:id/text and render that instead. Key off the
  // resolved document (the tab-bar route has no id param and falls back to
  // the first library doc). Gates:
  //  - only fetch once ingest is `ready` — before that /text serves the raw
  //    on-disk file, which for a PDF is binary mojibake that would then be
  //    cached (and spoken!) for the rest of the session. The library's
  //    ingest poll updates `document.status` live, so the fetch fires on
  //    its own the moment the doc flips to ready.
  //  - never fetch in mock mode (mock docs without sections stay empty).
  //  - the docId guard stops a rejected fetch from retrying in a loop.
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
      subtitle: "Open a document from the library to start the NeuroReader flow.",
      type: "pdf",
      progress: 0,
      pageCount: 0,
      sections: [],
    };
  const sections = baseDocument.sections || fetchedSections || EMPTY_SECTIONS;
  const activeDocument = { ...baseDocument, sections };

  const textError = needsText && readerDoc.docId === targetId ? readerDoc.error : null;
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

  const [askingId, setAskingId] = useState(null);
  const [citationOpen, setCitationOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  // 'text' = karaoke reader; 'pages' = rendered original PDF pages (true
  // visual fidelity — equations/figures exactly as printed).
  const [viewMode, setViewMode] = useState("text");
  const simTimerRef = useRef(null);
  const ttsRef = useRef(null);
  const settingsRestartRef = useRef(null);
  // Flips true on the first real word-boundary event from the TTS engine —
  // from then on the engine drives the highlight and the estimator dies.
  const boundaryLiveRef = useRef(false);

  // Depends on `sections` (a stable reference from Redux/mock data), NOT the
  // per-render activeDocument spread — otherwise this recomputes on every
  // karaoke tick. Loop-push instead of spread-push: spreading a huge word
  // array as arguments overflows the JS argument limit.
  const { words, ranges, sectionSpans } = useMemo(() => {
    const nextWords = [];
    const nextRanges = [];
    const nextSpans = [];

    sections.forEach((section) => {
      const sectionStart = nextWords.length;
      section.paragraphs.forEach((paragraph, index) => {
        const start = nextWords.length;
        for (const word of paragraph.split(/\s+/)) {
          nextWords.push(word);
        }
        nextRanges.push({
          pid: `${section.id}-${index}`,
          start,
          end: nextWords.length,
        });
      });
      nextSpans.push({ start: sectionStart, end: nextWords.length });
    });

    return { words: nextWords, ranges: nextRanges, sectionSpans: nextSpans };
  }, [sections]);

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

  useEffect(() => {
    dispatch(resetReader());
    dispatch(setReaderTotalWords(words.length));
    setActiveSection(0);
    setViewMode("text");
    return () => {
      stopSpeech();
      dispatch(pauseReader());
    };
  }, [dispatch, words.length, stopSpeech]);

  // Whatever flips `playing` off (manual pause, estimator hitting the end,
  // TTS onDone/onError) must also kill the audio — the estimator can end
  // the redux state while the chunk chain is still speaking, and a replay
  // on top of live audio double-speaks.
  useEffect(() => {
    if (!playback.playing) stopSpeech();
  }, [playback.playing, stopSpeech]);

  // The Reader is a tab — it never unmounts. Losing focus (switching to
  // Home/Library) must stop the voice; there are no playback controls
  // anywhere else.
  useFocusEffect(
    useCallback(() => {
      return () => {
        stopSpeech();
        dispatch(pauseReader());
      };
    }, [stopSpeech, dispatch])
  );

  // While playing, the visible section follows the voice: when the cursor
  // crosses out of the active section's word span, jump to the section that
  // contains it.
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

  // Start the TTS engine + estimator from a given word. Chunked utterances
  // (Android caps one utterance at ~4k chars); where the engine emits word
  // boundaries they drive the highlight exactly, otherwise the estimator
  // paces it and chunk starts resync it.
  const startPlaybackFrom = useCallback(
    (startIndex) => {
      boundaryLiveRef.current = false;
      const pitch = voice === "deep" ? 0.85 : voice === "natural" ? 1 : 1.1;
      const rate = Math.min(1, Math.max(0.3, wpm / 400));

      ttsRef.current = speakWords({
        words,
        startIndex,
        rate,
        pitch,
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
          dispatch(advanceReader());
        }
        if (!appStore.getState().reader.playing && simTimerRef.current) {
          clearInterval(simTimerRef.current);
          simTimerRef.current = null;
        }
      }, 60000 / wpm);
    },
    [dispatch, voice, wpm, words]
  );

  const togglePlay = useCallback(() => {
    if (playback.playing) {
      stopSpeech();
      dispatch(pauseReader());
      return;
    }
    dispatch(playReader());
    startPlaybackFrom(playback.wordIndex);
  }, [dispatch, playback.playing, playback.wordIndex, startPlaybackFrom, stopSpeech]);

  // Precise cursor control: jump to any word. If the voice is running it
  // restarts seamlessly from the new position.
  const seekTo = useCallback(
    (index) => {
      const clamped = Math.max(0, Math.min(Math.max(0, words.length - 1), index));
      const wasPlaying = appStore.getState().reader.playing;
      stopSpeech();
      dispatch(setReaderWord(clamped));
      if (wasPlaying) startPlaybackFrom(clamped);
    },
    [words.length, stopSpeech, dispatch, startPlaybackFrom]
  );

  // Skip back/forward one paragraph (back first jumps to the top of the
  // current paragraph, like a music player restarts the current track).
  const skipParagraph = useCallback(
    (dir) => {
      const idx = appStore.getState().reader.wordIndex;
      const ri = ranges.findIndex((r) => idx >= r.start && idx < r.end);
      if (ri < 0) return;
      if (dir < 0) {
        const intoParagraph = idx - ranges[ri].start;
        seekTo(intoParagraph > 5 ? ranges[ri].start : ranges[ri - 1]?.start ?? 0);
      } else if (ranges[ri + 1]) {
        seekTo(ranges[ri + 1].start);
      }
    },
    [ranges, seekTo]
  );

  const onWordPress = useCallback((globalIndex) => seekTo(globalIndex), [seekTo]);

  // Speed/voice changes now apply mid-playback: debounce (the slider fires
  // continuously), then restart the engine from the current word.
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

  const progress =
    playback.totalWords === 0 ? 0 : playback.wordIndex / playback.totalWords;

  function askAboutParagraph(paragraphId, question, excerpt, kind) {
    // No real document open (empty library / placeholder) — nothing to
    // query; the placeholder id would just 400 on the backend.
    if (!document) return;
    dispatch(
      requestReaderAnswer({
        documentId: activeDocument.id,
        paragraphId,
        question,
        excerpt,
        kind,
      })
    );
    setAskingId(paragraphId);
  }

  const visibleSections =
    sections.length > 1 ? [sections[Math.min(activeSection, sections.length - 1)]] : sections;

  return (
    <View className="flex-1" style={{ flex: 1, backgroundColor: palette.surface }}>
      <View style={{ height: 2, backgroundColor: palette.surfaceLow }}>
        <View
          style={{
            height: "100%",
            width: `${Math.round(progress * 100)}%`,
            backgroundColor: palette.secondary,
          }}
        />
      </View>

      <ReaderHeader
        document={activeDocument}
        onBack={() => navigation.navigate("Library")}
        onOpenGraph={() => setCitationOpen(true)}
        onOpenStudy={document ? () => setStudyOpen(true) : null}
        viewMode={viewMode}
        onToggleView={
          document && document.type === "pdf" && document.pageCount > 0 && !USE_MOCK
            ? () => setViewMode((m) => (m === "text" ? "pages" : "text"))
            : null
        }
      />

      {viewMode === "text" && sections.length > 1 ? (
        <PartNav
          index={activeSection}
          total={sections.length}
          onChange={(next) => {
            // Manual navigation wins over the voice: stop playback and move
            // the cursor to the chosen part's start, so Play resumes there
            // (and the auto-follow effect has nothing to fight).
            if (playback.playing) {
              stopSpeech();
              dispatch(pauseReader());
            }
            const span = sectionSpans[next];
            if (span) dispatch(setReaderWord(span.start));
            setActiveSection(next);
          }}
        />
      ) : null}

      {viewMode === "pages" ? (
        <PdfPagesView
          documentId={activeDocument.id}
          pageCount={activeDocument.pageCount}
        />
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>
          {readerLayout !== "paginated" ? (
            <Minimap sections={activeDocument.sections || []} progress={progress} />
          ) : null}
          <ReaderBody
            document={activeDocument}
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
            onAsk={askAboutParagraph}
            onWordPress={onWordPress}
          />
        </View>
      )}

      {viewMode === "pages" ? null : (
      <PlaybackBar
        playing={playback.playing}
        wpm={wpm}
        voice={voice}
        onPlay={togglePlay}
        onPrev={() => skipParagraph(-1)}
        onNext={() => skipParagraph(1)}
        onWpm={(value) => dispatch(setWpm(value))}
        onVoice={(value) => dispatch(setVoice(value))}
        onAsk={() => {
          const firstRange = ranges[0];
          const firstSection = activeDocument.sections?.[0];
          const excerpt = firstSection?.paragraphs?.[0] || "";
          askAboutParagraph(
            firstRange?.pid || "doc",
            "Summarise the current paragraph in plain language.",
            excerpt
          );
        }}
      />
      )}

      <CitationGraphDialog
        visible={citationOpen}
        onClose={() => setCitationOpen(false)}
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

// "Original pages" view — the actual PDF pages rendered server-side
// (GET /documents/:id/page/:n). Equations, figures, and layout appear
// exactly as printed; lazily loads pages as you scroll.
function PdfPagesView({ documentId, pageCount }) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width - 16, 900);
  const pageHeight = Math.round(pageWidth * 1.35);
  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i + 1),
    [pageCount]
  );

  return (
    <FlatList
      data={pages}
      keyExtractor={(n) => String(n)}
      initialNumToRender={2}
      maxToRenderPerBatch={3}
      windowSize={5}
      contentContainerStyle={{ paddingBottom: 40, alignItems: "center" }}
      renderItem={({ item: n }) => (
        <View style={{ marginTop: 8, alignItems: "center" }}>
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
        </View>
      )}
    />
  );
}

function PartNav({ index, total, onChange }) {
  const palette = usePalette();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        paddingVertical: 6,
      }}
    >
      <Pressable
        onPress={() => onChange(Math.max(0, index - 1))}
        disabled={index === 0}
        accessibilityRole="button"
        accessibilityLabel="Previous part"
        style={{ padding: 6, opacity: index === 0 ? 0.3 : 1 }}
      >
        <MaterialIcons name="chevron-left" size={22} color={palette.onSurfaceVariant} />
      </Pressable>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "JetBrainsMono_400Regular",
          fontSize: 12,
        }}
      >
        Part {index + 1} / {total}
      </Text>
      <Pressable
        onPress={() => onChange(Math.min(total - 1, index + 1))}
        disabled={index >= total - 1}
        accessibilityRole="button"
        accessibilityLabel="Next part"
        style={{ padding: 6, opacity: index >= total - 1 ? 0.3 : 1 }}
      >
        <MaterialIcons name="chevron-right" size={22} color={palette.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

function ReaderHeader({ document, onBack, onOpenGraph, onOpenStudy, viewMode, onToggleView }) {
  const palette = usePalette();

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Pressable
        onPress={onBack}
        accessibilityLabel="Back to library"
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: palette.surfaceHigh,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name="arrow-back" size={18} color={palette.accent} />
      </Pressable>
      <View style={{ width: 12 }} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_500Medium",
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          SCIENTIFIC JOURNAL • {Math.max(1, Math.round(document.pageCount / 2))} MIN
        </Text>
        <Text
          numberOfLines={2}
          style={{
            color: palette.onSurface,
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: 18,
            lineHeight: 22,
          }}
        >
          {document.title}
        </Text>
      </View>
      {onToggleView ? (
        <Pressable
          onPress={onToggleView}
          style={{ padding: 8 }}
          accessibilityLabel={
            viewMode === "text"
              ? "Show original pages (equations and figures as printed)"
              : "Show text reader"
          }
        >
          <MaterialIcons
            name={viewMode === "text" ? "auto-stories" : "subject"}
            size={20}
            color={viewMode === "pages" ? palette.accent : palette.onSurfaceVariant}
          />
        </Pressable>
      ) : null}
      {onOpenStudy ? (
        <Pressable
          onPress={onOpenStudy}
          style={{ padding: 8 }}
          accessibilityLabel="Open study tools: summary, quiz, cheatsheet"
        >
          <MaterialIcons name="school" size={20} color={palette.accent} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={onOpenGraph}
        style={{ padding: 8 }}
        accessibilityLabel="Open citation graph"
      >
        <MaterialIcons name="hub" size={20} color={palette.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

function Minimap({ sections, progress }) {
  const palette = usePalette();

  if (!sections.length) {
    return <View style={{ width: 40 }} />;
  }

  return (
    <View style={{ width: 88, paddingLeft: 16, paddingVertical: 16 }}>
      <View style={{ flexDirection: "row", flex: 1 }}>
        <View
          style={{
            width: 4,
            borderRadius: 2,
            backgroundColor: withAlpha(palette.outlineVariant, 0.3),
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
              backgroundColor: palette.accent,
              shadowColor: palette.accent,
              shadowOpacity: 0.8,
              shadowRadius: 10,
            }}
          />
        </View>
      </View>
    </View>
  );
}

function ReaderBody({
  document,
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
  onAsk,
  onWordPress,
}) {
  const palette = usePalette();
  const scrollRef = useRef(null);
  const maxWidth =
    layout === "focus" ? 520 : layout === "paginated" ? 680 : 720;

  // New part → back to the top, otherwise the karaoke highlight lands at
  // the old scroll offset, off-screen.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [sectionKey]);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingVertical: 8,
        paddingBottom: 220,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ maxWidth, width: "100%" }}>
        {!document.sections?.length && emptyNotice ? (
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
        {(visibleSections || document.sections || []).map((section) => (
          <View key={section.id}>
            <Text
              style={{
                color: palette.onSurface,
                fontFamily: "SpaceGrotesk_700Bold",
                fontSize: 22,
                marginTop: 28,
                marginBottom: 14,
                letterSpacing: -0.4,
              }}
            >
              {section.heading}
            </Text>
            {section.paragraphs.map((paragraph, index) => {
              const paragraphId = `${section.id}-${index}`;
              const range =
                ranges.find((entry) => entry.pid === paragraphId) || {
                  start: 0,
                  end: 0,
                };
              const notesForParagraph = chat.filter(
                (message) => message.paragraphId === paragraphId
              );

              return (
                <View key={paragraphId}>
                  <Pressable
                    onLongPress={() =>
                      onAsk(
                        paragraphId,
                        `Explain: "${paragraph.slice(0, 120)}..."`,
                        paragraph,
                        "explain"
                      )
                    }
                    style={{
                      paddingLeft: 14,
                      marginVertical: 10,
                      borderLeftWidth: 2,
                      borderLeftColor:
                        askingId === paragraphId
                          ? withAlpha(palette.accent, 0.6)
                          : "transparent",
                    }}
                  >
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
                    />
                  </Pressable>
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
      </View>
    </ScrollView>
  );
}

// A real paper is thousands of words across hundreds of paragraphs; without
// memoisation every word <Text> re-renders on every karaoke tick. Only the
// cursor's position RELATIVE to this paragraph matters: clamp it to
// [-1, wordCount] and skip the re-render when that value hasn't moved.
function paragraphHighlightEqual(prev, next) {
  if (
    prev.text !== next.text ||
    prev.firstWordIndex !== next.firstWordIndex ||
    prev.wordCount !== next.wordCount ||
    prev.fontFamily !== next.fontFamily ||
    prev.fontSize !== next.fontSize ||
    prev.lineHeight !== next.lineHeight ||
    prev.letterSpacing !== next.letterSpacing ||
    prev.onWordPress !== next.onWordPress
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
}) {
  const palette = usePalette();
  const words = text.split(/\s+/);

  return (
    <Text
      selectable
      style={{
        fontFamily,
        fontSize,
        lineHeight,
        letterSpacing,
        color: palette.onSurface,
      }}
    >
      {words.map((word, index) => {
        const globalIndex = firstWordIndex + index;
        const isRead = globalIndex < currentWordIndex;
        const isCurrent = globalIndex === currentWordIndex;
        return (
          <Text
            key={`${word}-${index}`}
            onPress={onWordPress ? () => onWordPress(globalIndex) : undefined}
            style={{
              color: isRead
                ? withAlpha(palette.onSurfaceVariant, 0.55)
                : palette.onSurface,
              backgroundColor: isCurrent
                ? withAlpha(palette.accent, 0.2)
                : "transparent",
              textDecorationLine: isCurrent ? "underline" : "none",
              textDecorationColor: palette.accent,
            }}
          >
            {word}
            {index === words.length - 1 ? "" : " "}
          </Text>
        );
      })}
    </Text>
  );
}, paragraphHighlightEqual);

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
      {note.citations.length ? (
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

function PlaybackBar({ playing, wpm, voice, onPlay, onPrev, onNext, onWpm, onVoice, onAsk }) {
  const palette = usePalette();

  return (
    <View
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 90,
      }}
    >
      <GlassPanel radius={28} style={{ paddingHorizontal: 10, paddingVertical: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={onPrev}
            accessibilityLabel="Previous paragraph"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: withAlpha(palette.onSurface, 0.04),
            }}
          >
            <MaterialIcons
              name="skip-previous"
              size={22}
              color={palette.onSurfaceVariant}
            />
          </Pressable>
          <Pressable
            onPress={onPlay}
            accessibilityLabel={playing ? "Pause" : "Play"}
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              marginHorizontal: 4,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: palette.primary,
              shadowColor: palette.accent,
              shadowOpacity: 0.4,
              shadowRadius: 18,
            }}
          >
            <MaterialIcons
              name={playing ? "pause" : "play-arrow"}
              size={30}
              color={palette.onPrimary}
            />
          </Pressable>
          <Pressable
            onPress={onNext}
            accessibilityLabel="Next paragraph"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: withAlpha(palette.onSurface, 0.04),
            }}
          >
            <MaterialIcons
              name="skip-next"
              size={22}
              color={palette.onSurfaceVariant}
            />
          </Pressable>

          <View style={{ width: 10 }} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 10,
                letterSpacing: 2,
              }}
            >
              SPEED · {wpm} WPM
            </Text>
            <Slider
              value={wpm}
              minimumValue={120}
              maximumValue={400}
              step={10}
              onValueChange={(value) => onWpm(Math.round(value))}
              minimumTrackTintColor={palette.accent}
              maximumTrackTintColor={withAlpha(palette.outlineVariant, 0.3)}
              thumbTintColor={palette.accent}
            />
          </View>

          <View style={{ width: 6 }} />
          <View
            style={{
              flexDirection: "row",
              backgroundColor: palette.surfaceLowest,
              borderRadius: 12,
              padding: 3,
            }}
          >
            {["soft", "natural", "deep"].map((item) => {
              const selected = item === voice;
              return (
                <Pressable
                  key={item}
                  onPress={() => onVoice(item)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 10,
                    backgroundColor: selected
                      ? withAlpha(palette.accent, 0.14)
                      : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: selected ? palette.accent : palette.onSurfaceVariant,
                      fontSize: 11,
                      fontFamily: "Inter_500Medium",
                    }}
                  >
                    {item[0].toUpperCase() + item.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ width: 6 }} />
          <Pressable
            onPress={onAsk}
            accessibilityLabel="Ask about this text"
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: withAlpha(palette.secondary, 0.1),
              borderWidth: 1,
              borderColor: withAlpha(palette.secondary, 0.3),
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <MaterialIcons
              name="auto-awesome"
              size={14}
              color={palette.secondary}
            />
            <View style={{ width: 6 }} />
            <Text
              style={{
                color: palette.secondary,
                fontFamily: "SpaceGrotesk_600SemiBold",
                fontSize: 13,
              }}
            >
              Ask
            </Text>
          </Pressable>
        </View>
      </GlassPanel>
    </View>
  );
}

function CitationGraphDialog({ visible, onClose }) {
  const palette = usePalette();
  const { width: viewportWidth } = useWindowDimensions();

  if (!visible) {
    return null;
  }

  const width = Math.min(viewportWidth - 32, 420);
  const height = 280;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;
  const nodes = Array.from({ length: 8 }).map((_, index) => {
    const angle = (index / 8) * Math.PI * 2;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: withAlpha("#000000", 0.6),
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width,
            borderRadius: 24,
            backgroundColor: palette.surfaceContainer,
            padding: 20,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <MaterialIcons name="hub" size={20} color={palette.accent} />
            <View style={{ width: 8 }} />
            <Text
              style={{
                flex: 1,
                color: palette.onSurface,
                fontFamily: "SpaceGrotesk_600SemiBold",
                fontSize: 18,
              }}
            >
              Citation graph
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Close">
              <MaterialIcons
                name="close"
                size={20}
                color={palette.onSurfaceVariant}
              />
            </Pressable>
          </View>
          <View style={{ height: 12 }} />
          <Svg width={width - 40} height={height}>
            {nodes.map((node, index) => (
              <Line
                key={`edge-${index}`}
                x1={centerX}
                y1={centerY}
                x2={node.x}
                y2={node.y}
                stroke={palette.accent}
                strokeOpacity={0.35}
                strokeWidth={1}
              />
            ))}
            {nodes.map((node, index) => (
              <Circle
                key={`node-${index}`}
                cx={node.x}
                cy={node.y}
                r={6}
                fill={palette.accent}
              />
            ))}
            <Circle cx={centerX} cy={centerY} r={10} fill={palette.accent} />
          </Svg>
          <View style={{ height: 8 }} />
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              lineHeight: 20,
            }}
          >
            Placeholder preview. Wire this to your document query backend when
            the real citation graph service is available.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
