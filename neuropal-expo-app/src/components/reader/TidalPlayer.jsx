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

export function TidalPlayer({
  playing,
  wordIndex,
  totalWords,
  sectionSpans,
  sectionHeading,
  onSeek,
  onTogglePlay,
  onPrev,
  onNext,
  wpm,
  onWpm,
  voice,
  onVoice,
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const pct = totalWords > 0 ? wordIndex / totalWords : 0;

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
          {/* row 1 — scrubber */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
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
              {Math.round(pct * 100)}%
            </Text>
          </View>
          <View style={{ justifyContent: "center" }}>
            {/* chapter ticks under the track */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 14,
                right: 14,
                height: 8,
                top: 16,
              }}
            >
              {totalWords > 0 &&
                (sectionSpans || []).slice(1).map((span, i) => (
                  <View
                    key={i}
                    style={{
                      position: "absolute",
                      left: `${(span.start / totalWords) * 100}%`,
                      width: 2,
                      height: 8,
                      borderRadius: 1,
                      backgroundColor: withAlpha(palette.onSurfaceVariant, 0.45),
                    }}
                  />
                ))}
            </View>
            <Slider
              value={Math.min(wordIndex, Math.max(0, totalWords - 1))}
              minimumValue={0}
              maximumValue={Math.max(1, totalWords - 1)}
              step={1}
              onSlidingComplete={(value) => onSeek(Math.round(value))}
              minimumTrackTintColor={palette.accent}
              maximumTrackTintColor={withAlpha(palette.outlineVariant, 0.35)}
              thumbTintColor={palette.accent}
              accessibilityLabel="Reading position"
            />
          </View>

          {/* row 2 — transport */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 26,
              marginTop: 2,
            }}
          >
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
