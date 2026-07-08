import { MaterialIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePalette } from "../../theme/ThemeProvider";
import { GlassPanel, withAlpha } from "../primitives";

// D10 — the Tidal-style docked player (Variation A):
//   row 1: position scrubber with chapter ticks + position label
//   row 2: ◀ (jump back) · ⏯ (large, centered) · ▶ (skip ahead)
//   row 3: tone selector (Soft/Natural/Deep) · compact WPM stepper
// Tinted liquid glass; hides with the reader chrome (D8).

const VOICES = ["soft", "natural", "deep"];

// Chapter-scoped, Audible-style: the scrubber covers ONLY the current
// chapter, with elapsed/remaining listening time at the current wpm, and
// prev/next-chapter transport buttons. Book-level position lives in the tiny
// "CH n/N · x%" caption — hundreds of pages never compress into one bar.
export function TidalPlayer({
  playing,
  wordIndex,
  totalWords,
  chapterIndex = 0,
  chapterCount = 1,
  chapterStart = 0,
  chapterEnd = 0,
  sectionHeading,
  onSeek,
  onTogglePlay,
  onPrev,
  onNext,
  onPrevChapter,
  onNextChapter,
  onOpenChapters,
  wpm,
  onWpm,
  voice,
  onVoice,
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const bookPct = totalWords > 0 ? wordIndex / totalWords : 0;
  const chapterWords = Math.max(1, chapterEnd - chapterStart);
  const inChapter = Math.min(
    Math.max(wordIndex - chapterStart, 0),
    chapterWords
  );
  const minutes = (words) => {
    const m = words / Math.max(60, wpm);
    if (m < 1) return `${Math.max(0, Math.round(m * 60))}s`;
    if (m < 60) return `${Math.round(m)}m`;
    return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        bottom: Math.max(insets.bottom, 10),
      }}
    >
      <GlassPanel radius={24} intensity={55}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 }}>
          {/* row 1 — chapter title (tap = chapter list) + book position */}
          <Pressable
            onPress={onOpenChapters}
            accessibilityRole="button"
            accessibilityLabel="Open chapter list"
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <MaterialIcons
              name="menu-book"
              size={12}
              color={palette.onSurfaceVariant}
            />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                marginLeft: 6,
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 10,
                letterSpacing: 1.2,
              }}
            >
              {(sectionHeading || "").toUpperCase()}
            </Text>
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "JetBrainsMono_400Regular",
                fontSize: 10,
              }}
            >
              CH {chapterIndex + 1}/{chapterCount} · {Math.round(bookPct * 100)}%
            </Text>
          </Pressable>
          <Slider
            value={Math.min(chapterStart + inChapter, Math.max(chapterStart, chapterEnd - 1))}
            minimumValue={chapterStart}
            maximumValue={Math.max(chapterStart + 1, chapterEnd - 1)}
            step={1}
            onSlidingComplete={(value) => onSeek(Math.round(value))}
            minimumTrackTintColor={palette.accent}
            maximumTrackTintColor={withAlpha(palette.outlineVariant, 0.35)}
            thumbTintColor={palette.accent}
            accessibilityLabel="Position in this chapter"
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "JetBrainsMono_400Regular",
                fontSize: 10,
              }}
            >
              {minutes(inChapter)}
            </Text>
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "JetBrainsMono_400Regular",
                fontSize: 10,
              }}
            >
              -{minutes(chapterWords - inChapter)}
            </Text>
          </View>

          {/* row 2 — transport */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              marginTop: 2,
            }}
          >
            <Pressable
              onPress={onPrevChapter}
              accessibilityRole="button"
              accessibilityLabel="Previous chapter"
              hitSlop={8}
              style={{ padding: 6 }}
            >
              <MaterialIcons name="skip-previous" size={24} color={palette.onSurfaceVariant} />
            </Pressable>
            <Pressable
              onPress={onPrev}
              accessibilityRole="button"
              accessibilityLabel="Jump back a paragraph"
              hitSlop={8}
              style={{ padding: 8 }}
            >
              <MaterialIcons name="replay-5" size={26} color={palette.onSurfaceVariant} />
            </Pressable>
            <Pressable
              onPress={onTogglePlay}
              accessibilityRole="button"
              accessibilityLabel={playing ? "Pause" : "Play"}
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: palette.primary,
                shadowColor: palette.accent,
                shadowOpacity: 0.45,
                shadowRadius: 16,
              }}
            >
              <MaterialIcons
                name={playing ? "pause" : "play-arrow"}
                size={34}
                color={palette.onPrimary}
              />
            </Pressable>
            <Pressable
              onPress={onNext}
              accessibilityRole="button"
              accessibilityLabel="Skip ahead a paragraph"
              hitSlop={8}
              style={{ padding: 8 }}
            >
              <MaterialIcons name="forward-5" size={26} color={palette.onSurfaceVariant} />
            </Pressable>
            <Pressable
              onPress={onNextChapter}
              accessibilityRole="button"
              accessibilityLabel="Next chapter"
              hitSlop={8}
              style={{ padding: 6 }}
            >
              <MaterialIcons name="skip-next" size={24} color={palette.onSurfaceVariant} />
            </Pressable>
          </View>

          {/* row 3 — tone selector + WPM */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                backgroundColor: withAlpha(palette.surfaceLowest, 0.7),
                borderRadius: 12,
                padding: 3,
              }}
            >
              {VOICES.map((item) => {
                const selected = item === voice;
                return (
                  <Pressable
                    key={item}
                    onPress={() => onVoice(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Voice ${item}`}
                    accessibilityState={{ selected }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: selected
                        ? withAlpha(palette.accent, 0.16)
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
            <View style={{ flex: 1 }} />
            {/* compact WPM stepper */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: withAlpha(palette.surfaceLowest, 0.7),
                borderRadius: 12,
                paddingHorizontal: 4,
              }}
            >
              <Pressable
                onPress={() => onWpm(Math.max(120, wpm - 25))}
                accessibilityLabel="Slower"
                hitSlop={6}
                style={{ padding: 6 }}
              >
                <MaterialIcons name="remove" size={16} color={palette.onSurfaceVariant} />
              </Pressable>
              <Text
                style={{
                  color: palette.accent,
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 12,
                  minWidth: 64,
                  textAlign: "center",
                }}
              >
                {wpm} wpm
              </Text>
              <Pressable
                onPress={() => onWpm(Math.min(950, wpm + 25))}
                accessibilityLabel="Faster"
                hitSlop={6}
                style={{ padding: 6 }}
              >
                <MaterialIcons name="add" size={16} color={palette.onSurfaceVariant} />
              </Pressable>
            </View>
          </View>
        </View>
      </GlassPanel>
    </View>
  );
}
