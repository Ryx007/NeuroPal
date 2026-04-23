import { MaterialIcons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import Svg, { Circle, Line } from "react-native-svg";

import {
  GlassPanel,
  withAlpha,
} from "@/components/primitives";
import type { ChatMessage, NpDocument, Voice } from "@/models/types";
import { appStore } from "@/store";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectDocumentById,
  selectReaderMessages,
  selectReaderPlayback,
  selectUiState,
} from "@/store/selectors";
import {
  addReaderMessage,
  advanceReader,
  pauseReader,
  playReader,
  resetReader,
  setReaderTotalWords,
} from "@/store/slices/readerSlice";
import { setVoice, setWpm } from "@/store/slices/uiSlice";
import { usePalette, useTheme } from "@/theme/ThemeProvider";

/**
 * Reader — the heart of the product.
 *
 *   • Karaoke-style TTS word highlighting (real TTS via `expo-speech`,
 *     with a simulated fallback timer calibrated to WPM so the highlight
 *     still works on platforms that don't emit progress events).
 *   • Section-jump minimap on the left rail.
 *   • Inline margin Q&A anchored to individual paragraphs (split layout).
 *   • Select-to-ask chip that spawns a margin note.
 *   • Tactile playback bar with WPM slider, voice pills, Ask button.
 *   • Reader layouts: Split / Focus / Paginated (switched from Tweaks).
 *   • Citation graph dialog.
 */
export default function ReaderScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const palette = usePalette();
  const dispatch = useAppDispatch();
  const { readerFontFamily, readerFontSize, readerLineHeight, readerExtraLetterSpacing } = useTheme();

  const doc = useAppSelector((state) => selectDocumentById(state, params.id));
  const { readerLayout, voice, wpm } = useAppSelector(selectUiState);
  const playback = useAppSelector(selectReaderPlayback);
  const chat = useAppSelector(selectReaderMessages);
  const activeDoc =
    doc ??
    ({
      id: "doc-empty",
      title: "No document selected",
      subtitle: "Open a document from the library to start the NeuroReader flow.",
      type: "pdf",
      progress: 0,
      pageCount: 0,
      sections: [],
    } satisfies NpDocument);

  const [askingId, setAskingId] = useState<string | null>(null);
  const [citationOpen, setCitationOpen] = useState(false);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build the word token list + paragraph ranges.
  const { words, ranges } = useMemo(() => {
    const w: string[] = [];
    const r: { pid: string; start: number; end: number }[] = [];
    for (const s of activeDoc.sections ?? []) {
      for (let i = 0; i < s.paragraphs.length; i++) {
        const start = w.length;
        w.push(...s.paragraphs[i].split(/\s+/));
        r.push({ pid: `${s.id}-${i}`, start, end: w.length });
      }
    }
    return { words: w, ranges: r };
  }, [activeDoc]);

  useEffect(() => {
    dispatch(resetReader());
    dispatch(setReaderTotalWords(words.length));
    return () => {
      Speech.stop();
      if (simTimerRef.current) clearInterval(simTimerRef.current);
      dispatch(pauseReader());
    };
  }, [dispatch, words.length]);

  const togglePlay = useCallback(async () => {
    if (playback.playing) {
      Speech.stop();
      if (simTimerRef.current) clearInterval(simTimerRef.current);
      dispatch(pauseReader());
      return;
    }

    dispatch(playReader());
    const remaining = words.slice(playback.wordIndex).join(" ");
    const pitch = voice === "deep" ? 0.85 : voice === "natural" ? 1.0 : 1.1;
    const rate = Math.min(1, Math.max(0.3, wpm / 400));
    Speech.speak(remaining, {
      pitch,
      rate,
      onDone: () => dispatch(pauseReader()),
      onStopped: () => dispatch(pauseReader()),
      onError: () => dispatch(pauseReader()),
    });

    if (simTimerRef.current) clearInterval(simTimerRef.current);
    simTimerRef.current = setInterval(() => {
      dispatch(advanceReader());
      if (!appStore.getState().reader.playing && simTimerRef.current) {
        clearInterval(simTimerRef.current);
      }
    }, 60000 / wpm);
  }, [dispatch, playback.playing, playback.wordIndex, voice, wpm, words]);

  const progress = playback.totalWords === 0 ? 0 : playback.wordIndex / playback.totalWords;

  return (
    <View className="flex-1" style={{ flex: 1, backgroundColor: palette.surface }}>
      {/* Thin progress strip */}
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
        doc={activeDoc}
        onBack={() => router.push("/library")}
        onOpenGraph={() => setCitationOpen(true)}
      />

      <View style={{ flex: 1, flexDirection: "row" }}>
        {readerLayout !== "paginated" ? (
          <Minimap sections={activeDoc.sections ?? []} progress={progress} />
        ) : null}
        <ReaderBody
          doc={activeDoc}
          progress={progress}
          currentWordIndex={playback.wordIndex}
          ranges={ranges}
          chat={chat}
          askingId={askingId}
          layout={readerLayout}
          readerFontFamily={readerFontFamily}
          readerFontSize={readerFontSize}
          readerLineHeight={readerLineHeight}
          readerExtraLetterSpacing={readerExtraLetterSpacing}
          onAsk={(pid, question) => {
            dispatch(addReaderMessage({ paragraphId: pid, question }));
            setAskingId(pid);
          }}
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
          const pid = ranges[0]?.pid ?? "doc";
          dispatch(
            addReaderMessage({
            paragraphId: pid,
            question: "Summarise the current paragraph in plain language.",
            })
          );
          setAskingId(pid);
        }}
      />

      <CitationGraphDialog
        visible={citationOpen}
        onClose={() => setCitationOpen(false)}
      />
    </View>
  );
}

// ---- subcomponents -------------------------------------------------------

function ReaderHeader({
  doc,
  onBack,
  onOpenGraph,
}: {
  doc: NpDocument;
  onBack: () => void;
  onOpenGraph: () => void;
}) {
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
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: palette.surfaceHigh,
          alignItems: "center",
          justifyContent: "center",
        }}
        accessibilityLabel="Back"
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
          {doc.type.toUpperCase()} • {doc.pageCount} PP
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: palette.onSurface,
            fontFamily: "SpaceGrotesk_600SemiBold",
            fontSize: 16,
          }}
        >
          {doc.title}
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

function Minimap({
  sections,
  progress,
}: {
  sections: { id: string; heading: string }[];
  progress: number;
}) {
  const palette = usePalette();
  if (sections.length === 0) return <View style={{ width: 40 }} />;
  return (
    <View style={{ width: 140, paddingLeft: 16, paddingVertical: 16 }}>
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
        <View style={{ width: 8 }} />
        <View style={{ flex: 1 }}>
          {sections.map((s) => (
            <Text
              key={s.id}
              numberOfLines={2}
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                marginBottom: 16,
              }}
            >
              {s.heading}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function ReaderBody({
  doc,
  progress,
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
}: {
  doc: NpDocument;
  progress: number;
  currentWordIndex: number;
  ranges: { pid: string; start: number; end: number }[];
  chat: ChatMessage[];
  askingId: string | null;
  layout: "split" | "focus" | "paginated";
  readerFontFamily: string;
  readerFontSize: number;
  readerLineHeight: number;
  readerExtraLetterSpacing: boolean;
  onAsk: (pid: string, question: string) => void;
}) {
  const palette = usePalette();
  const maxWidth = layout === "focus" ? 520 : layout === "paginated" ? 680 : 720;

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
        {(doc.sections ?? []).map((section) => (
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
            {section.paragraphs.map((para, i) => {
              const pid = `${section.id}-${i}`;
              const range =
                ranges.find((r) => r.pid === pid) ??
                { pid, start: 0, end: 0 };
              const notesForPara = chat.filter((m) => m.paragraphId === pid);
              return (
                <View key={pid}>
                  <Pressable
                    onLongPress={() =>
                      onAsk(pid, `Explain: "${para.slice(0, 120)}..."`)
                    }
                    style={{
                      paddingLeft: 14,
                      marginVertical: 10,
                      borderLeftWidth: 2,
                      borderLeftColor:
                        askingId === pid
                          ? withAlpha(palette.accent, 0.6)
                          : "transparent",
                    }}
                  >
                    <ParagraphText
                      text={para}
                      firstWordIndex={range.start}
                      lastWordIndex={range.end}
                      currentWordIndex={currentWordIndex}
                      fontFamily={readerFontFamily}
                      fontSize={readerFontSize}
                      lineHeight={readerFontSize * readerLineHeight}
                      letterSpacing={readerExtraLetterSpacing ? 0.6 : 0}
                    />
                  </Pressable>
                  {layout === "split"
                    ? notesForPara.map((n) => (
                        <MarginNote key={n.id} note={n} />
                      ))
                    : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      {layout === "focus" ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "transparent",
          }}
        />
      ) : null}
    </ScrollView>
  );
}

function ParagraphText({
  text,
  firstWordIndex,
  lastWordIndex,
  currentWordIndex,
  fontFamily,
  fontSize,
  lineHeight,
  letterSpacing,
}: {
  text: string;
  firstWordIndex: number;
  lastWordIndex: number;
  currentWordIndex: number;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
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
      {words.map((w, i) => {
        const global = firstWordIndex + i;
        const readAlready = global < currentWordIndex;
        const isCurrent = global === currentWordIndex;
        return (
          <Text
            key={`${w}-${i}`}
            style={{
              color: readAlready
                ? withAlpha(palette.onSurfaceVariant, 0.55)
                : palette.onSurface,
              backgroundColor: isCurrent
                ? withAlpha(palette.accent, 0.2)
                : "transparent",
              textDecorationLine: isCurrent ? "underline" : "none",
              textDecorationColor: palette.accent,
            }}
          >
            {w}{i === words.length - 1 ? "" : " "}
          </Text>
        );
      })}
    </Text>
  );
}

function MarginNote({ note }: { note: ChatMessage }) {
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
      {note.citations.length > 0 ? (
        <View style={{ flexDirection: "row", marginTop: 8, flexWrap: "wrap", gap: 6 }}>
          {note.citations.map((c) => (
            <View
              key={c}
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
                {c}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PlaybackBar({
  playing,
  wpm,
  voice,
  onPlay,
  onWpm,
  onVoice,
  onAsk,
}: {
  playing: boolean;
  wpm: number;
  voice: Voice;
  onPlay: () => void;
  onWpm: (v: number) => void;
  onVoice: (v: Voice) => void;
  onAsk: () => void;
}) {
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
      <GlassPanel
        radius={28}
        style={{ paddingHorizontal: 10, paddingVertical: 10 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: withAlpha(palette.onSurface, 0.04),
            }}
            accessibilityLabel="Previous"
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
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: withAlpha(palette.onSurface, 0.04),
            }}
            accessibilityLabel="Next"
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
              onValueChange={(v) => onWpm(Math.round(v))}
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
            {(["soft", "natural", "deep"] as Voice[]).map((v) => {
              const selected = v === voice;
              return (
                <Pressable
                  key={v}
                  onPress={() => onVoice(v)}
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
                    {v[0].toUpperCase() + v.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ width: 6 }} />
          <Pressable
            onPress={onAsk}
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
            accessibilityLabel="Ask about this text"
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

function CitationGraphDialog({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const palette = usePalette();
  if (!visible) return null;
  const { width: viewportWidth } = useWindowDimensions();
  const width = Math.min(viewportWidth - 32, 420);
  const h = 280;
  const cx = width / 2;
  const cy = h / 2;
  const radius = Math.min(width, h) * 0.35;
  const nodes = Array.from({ length: 8 }).map((_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
  });

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
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
          <Svg width={width - 40} height={h}>
            {nodes.map((n, i) => (
              <Line
                key={`e-${i}`}
                x1={cx}
                y1={cy}
                x2={n.x}
                y2={n.y}
                stroke={palette.accent}
                strokeOpacity={0.35}
                strokeWidth={1}
              />
            ))}
            {nodes.map((n, i) => (
              <Circle
                key={`n-${i}`}
                cx={n.x}
                cy={n.y}
                r={6}
                fill={palette.accent}
              />
            ))}
            <Circle cx={cx} cy={cy} r={10} fill={palette.accent} />
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
            Placeholder. Replaced by live Claude + Scopus graph in Phase 6
            (see Plan §Phase 6 — Science Resource Library).
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
