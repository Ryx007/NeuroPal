import { MaterialIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { GlassPanel, withAlpha } from "../components/primitives";
import { appStore } from "../store";
import {
  selectDocumentById,
  selectReaderMessages,
  selectReaderPlayback,
  selectUiState,
} from "../store/selectors";
import {
  advanceReader,
  pauseReader,
  playReader,
  requestReaderAnswer,
  resetReader,
  setReaderTotalWords,
} from "../store/slices/readerSlice";
import { setVoice, setWpm } from "../store/slices/uiSlice";
import { usePalette, useTheme } from "../theme/ThemeProvider";

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
  const activeDocument =
    document || {
      id: "doc-empty",
      title: "No document selected",
      subtitle: "Open a document from the library to start the NeuroReader flow.",
      type: "pdf",
      progress: 0,
      pageCount: 0,
      sections: [],
    };

  const [askingId, setAskingId] = useState(null);
  const [citationOpen, setCitationOpen] = useState(false);
  const simTimerRef = useRef(null);

  const { words, ranges } = useMemo(() => {
    const nextWords = [];
    const nextRanges = [];

    (activeDocument.sections || []).forEach((section) => {
      section.paragraphs.forEach((paragraph, index) => {
        const start = nextWords.length;
        nextWords.push(...paragraph.split(/\s+/));
        nextRanges.push({
          pid: `${section.id}-${index}`,
          start,
          end: nextWords.length,
        });
      });
    });

    return { words: nextWords, ranges: nextRanges };
  }, [activeDocument]);

  useEffect(() => {
    dispatch(resetReader());
    dispatch(setReaderTotalWords(words.length));
    return () => {
      Speech.stop();
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
      }
      dispatch(pauseReader());
    };
  }, [dispatch, words.length]);

  const togglePlay = useCallback(() => {
    if (playback.playing) {
      Speech.stop();
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
      }
      dispatch(pauseReader());
      return;
    }

    dispatch(playReader());
    const remaining = words.slice(playback.wordIndex).join(" ");
    const pitch = voice === "deep" ? 0.85 : voice === "natural" ? 1 : 1.1;
    const rate = Math.min(1, Math.max(0.3, wpm / 400));

    Speech.speak(remaining, {
      pitch,
      rate,
      onDone: () => dispatch(pauseReader()),
      onStopped: () => dispatch(pauseReader()),
      onError: () => dispatch(pauseReader()),
    });

    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
    }

    simTimerRef.current = setInterval(() => {
      dispatch(advanceReader());
      if (!appStore.getState().reader.playing && simTimerRef.current) {
        clearInterval(simTimerRef.current);
      }
    }, 60000 / wpm);
  }, [dispatch, playback.playing, playback.wordIndex, voice, wpm, words]);

  const progress =
    playback.totalWords === 0 ? 0 : playback.wordIndex / playback.totalWords;

  function askAboutParagraph(paragraphId, question, excerpt) {
    dispatch(
      requestReaderAnswer({
        documentId: activeDocument.id,
        paragraphId,
        question,
        excerpt,
      })
    );
    setAskingId(paragraphId);
  }

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
      />

      <View style={{ flex: 1, flexDirection: "row" }}>
        {readerLayout !== "paginated" ? (
          <Minimap sections={activeDocument.sections || []} progress={progress} />
        ) : null}
        <ReaderBody
          document={activeDocument}
          currentWordIndex={playback.wordIndex}
          ranges={ranges}
          chat={chat}
          askingId={askingId}
          layout={readerLayout}
          readerFontFamily={readerFontFamily}
          readerFontSize={readerFontSize}
          readerLineHeight={readerLineHeight}
          readerExtraLetterSpacing={readerExtraLetterSpacing}
          onAsk={askAboutParagraph}
        />
      </View>

      <PlaybackBar
        playing={playback.playing}
        wpm={wpm}
        voice={voice}
        onPlay={togglePlay}
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

      <CitationGraphDialog
        visible={citationOpen}
        onClose={() => setCitationOpen(false)}
      />
    </View>
  );
}

function ReaderHeader({ document, onBack, onOpenGraph }) {
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
  currentWordIndex,
  ranges,
  chat,
  askingId,
  layout,
  readerFontFamily,
  readerFontSize,
  readerLineHeight,
  readerExtraLetterSpacing,
  onAsk,
}) {
  const palette = usePalette();
  const maxWidth =
    layout === "focus" ? 520 : layout === "paginated" ? 680 : 720;

  return (
    <ScrollView
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
        {(document.sections || []).map((section) => (
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
                        paragraph
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
                      currentWordIndex={currentWordIndex}
                      fontFamily={readerFontFamily}
                      fontSize={readerFontSize}
                      lineHeight={readerFontSize * readerLineHeight}
                      letterSpacing={readerExtraLetterSpacing ? 0.6 : 0}
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

function ParagraphText({
  text,
  firstWordIndex,
  currentWordIndex,
  fontFamily,
  fontSize,
  lineHeight,
  letterSpacing,
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
}

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

function PlaybackBar({ playing, wpm, voice, onPlay, onWpm, onVoice, onAsk }) {
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
            accessibilityLabel="Previous"
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
            accessibilityLabel="Next"
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
