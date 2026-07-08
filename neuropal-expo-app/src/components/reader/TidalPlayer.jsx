import { MaterialIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePalette } from "../../theme/ThemeProvider";
import { GlassPanel, withAlpha } from "../primitives";

// D10 — the Tidal-style player as ONE component with TWO heights:
//   • Variation A (default): docked mini-player (mockup.html .player)
//       labels[pos · chapter | time-left] → chapter-scoped track →
//       ◀ ⏯ ▶ centered → tone segmented + WPM pill
//   • Variation B (expand state): full-screen now-playing (mockup-v2.html .np)
//       collapse ▾ · NOW PLAYING grip · Ask ✦ → cover → title/author/chapter →
//       big scrubber (elapsed/remaining) → ◀ ⏯ ▶ big → tone row + WPM stepper
//
// Same contract & data bindings in both; A's handle/scrubber/WPM pill expand
// to B via the handle / WPM pill, B's chevron collapses back. ◀/▶ = prev/next
// chapter (Audible); the docked scrubber seeks within the chapter. The
// chapter-scoped scrubber keeps a 700-page book from compressing into one bar,
// and the chapter label/chip opens the Table of Contents.

const TONES = ["soft", "natural", "deep"];
const WPM_BASELINE = 240; // mockup shows 240 wpm = 1.0×

export function TidalPlayer({
  playing,
  wordIndex,
  chapterIndex = 0,
  chapterCount = 1,
  chapterStart = 0,
  chapterEnd = 0,
  sectionHeading,
  docTitle,
  docSubtitle,
  expanded = false,
  onExpand,
  onCollapse,
  onAsk,
  onSeek,
  onTogglePlay,
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

  // ---- shared derived values (chapter-scoped) ----
  const chapterWords = Math.max(1, chapterEnd - chapterStart);
  const inChapter = Math.min(Math.max(wordIndex - chapterStart, 0), chapterWords);
  const chapterPct = inChapter / chapterWords;
  const speedX = (wpm / WPM_BASELINE).toFixed(1);

  // words → "m:ss" (elapsed/remaining, big view) and "N min" (compact)
  const clock = (w) => {
    const sec = Math.round((w / Math.max(60, wpm)) * 60);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  const mins = (w) => {
    const m = w / Math.max(60, wpm);
    if (m < 1) return `${Math.max(0, Math.round(m * 60))}s`;
    if (m < 60) return `${Math.round(m)} min`;
    return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  };

  const clampSeek = (value) => onSeek(Math.round(value));

  if (expanded) {
    return (
      <ExpandedPlayer
        palette={palette}
        insets={insets}
        playing={playing}
        chapterIndex={chapterIndex}
        chapterCount={chapterCount}
        chapterStart={chapterStart}
        chapterEnd={chapterEnd}
        chapterWords={chapterWords}
        inChapter={inChapter}
        sectionHeading={sectionHeading}
        docTitle={docTitle}
        docSubtitle={docSubtitle}
        speedX={speedX}
        clock={clock}
        clampSeek={clampSeek}
        onCollapse={onCollapse}
        onAsk={onAsk}
        onTogglePlay={onTogglePlay}
        onPrevChapter={onPrevChapter}
        onNextChapter={onNextChapter}
        onOpenChapters={onOpenChapters}
        wpm={wpm}
        onWpm={onWpm}
        voice={voice}
        onVoice={onVoice}
      />
    );
  }

  // ============================ VARIATION A — docked ============================
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: Math.max(insets.bottom, 12),
      }}
    >
      <GlassPanel radius={26} intensity={55}>
        {/* warm liquid-glass tint (mockup .player.glass = accent/crimson
            gradient over the dark base) — matches the expanded sibling */}
        <LinearGradient
          colors={[withAlpha(palette.accent, 0.1), withAlpha(palette.primaryContainer, 0.18)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}>
          {/* grab handle — tap to expand to the full now-playing (B) */}
          <Pressable
            onPress={onExpand}
            accessibilityRole="button"
            accessibilityLabel="Expand player"
            hitSlop={10}
            style={{ alignItems: "center", paddingBottom: 8 }}
          >
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: withAlpha(palette.onSurfaceVariant, 0.4),
              }}
            />
          </Pressable>

          {/* scrubber labels */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 2,
            }}
          >
            <Pressable
              onPress={onOpenChapters}
              accessibilityRole="button"
              accessibilityLabel={`Chapter ${chapterIndex + 1} of ${chapterCount} — open contents`}
              hitSlop={8}
            >
              <Text
                style={{
                  color: palette.accent,
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 11,
                }}
              >
                {Math.round(chapterPct * 100)}% · Ch {chapterIndex + 1}/{chapterCount}
              </Text>
            </Pressable>
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "JetBrainsMono_400Regular",
                fontSize: 11,
              }}
            >
              {mins(chapterWords - inChapter)} left
            </Text>
          </View>

          {/* chapter-scoped scrubber */}
          <Slider
            value={Math.min(chapterStart + inChapter, Math.max(chapterStart, chapterEnd - 1))}
            minimumValue={chapterStart}
            maximumValue={Math.max(chapterStart + 1, chapterEnd - 1)}
            step={1}
            onSlidingComplete={clampSeek}
            minimumTrackTintColor={palette.accent}
            maximumTrackTintColor={withAlpha(palette.outlineVariant, 0.4)}
            thumbTintColor="#ffffff"
            accessibilityLabel="Position in this chapter"
            accessibilityValue={{
              min: 0,
              max: chapterWords,
              now: inChapter,
              text: `${Math.round(chapterPct * 100)} percent through chapter ${chapterIndex + 1}`,
            }}
          />

          {/* transport ◀ ⏯ ▶  (◀/▶ = previous/next chapter, Audible-style) */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 26,
              marginTop: 4,
              marginBottom: 6,
            }}
          >
            <Pressable
              onPress={onPrevChapter}
              accessibilityRole="button"
              accessibilityLabel="Previous chapter"
              hitSlop={8}
              style={{ padding: 6 }}
            >
              <MaterialIcons name="skip-previous" size={28} color={palette.onSurface} />
            </Pressable>
            <Pressable
              onPress={onTogglePlay}
              accessibilityRole="button"
              accessibilityLabel={playing ? "Pause" : "Play"}
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: palette.accent,
                shadowColor: palette.accent,
                shadowOpacity: 0.45,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
              }}
            >
              <MaterialIcons
                name={playing ? "pause" : "play-arrow"}
                size={34}
                color={palette.onPrimary}
              />
            </Pressable>
            <Pressable
              onPress={onNextChapter}
              accessibilityRole="button"
              accessibilityLabel="Next chapter"
              hitSlop={8}
              style={{ padding: 6 }}
            >
              <MaterialIcons name="skip-next" size={28} color={palette.onSurface} />
            </Pressable>
          </View>

          {/* bottom row — tone segmented (left) + WPM pill (right, tap → expand) */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 4,
            }}
          >
            <ToneSelector value={voice} onVoice={onVoice} palette={palette} />
            <Pressable
              onPress={onExpand}
              accessibilityRole="button"
              accessibilityLabel={`Reading speed ${wpm} words per minute — adjust`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                backgroundColor: withAlpha(palette.surfaceLowest, 0.7),
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              <MaterialIcons name="speed" size={14} color={palette.onSurfaceVariant} />
              <Text
                style={{
                  color: palette.onSurfaceVariant,
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 12,
                }}
              >
                <Text style={{ color: palette.accent }}>{wpm}</Text> wpm
              </Text>
            </Pressable>
          </View>
        </View>
      </GlassPanel>
    </View>
  );
}

// ============================ VARIATION B — expanded ============================
function ExpandedPlayer({
  palette,
  insets,
  playing,
  chapterIndex,
  chapterCount,
  chapterStart,
  chapterEnd,
  chapterWords,
  inChapter,
  sectionHeading,
  docTitle,
  docSubtitle,
  speedX,
  clock,
  clampSeek,
  onCollapse,
  onAsk,
  onTogglePlay,
  onPrevChapter,
  onNextChapter,
  onOpenChapters,
  wpm,
  onWpm,
  voice,
  onVoice,
}) {
  // entrance: slide up + fade
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const glyph =
    (docTitle || "").replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "✦";
  const chapterLabel =
    sectionHeading && sectionHeading !== docTitle
      ? `Chapter ${chapterIndex + 1} of ${chapterCount} · ${sectionHeading}`
      : `Chapter ${chapterIndex + 1} of ${chapterCount}`;

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [40, 0],
            }),
          },
        ],
      }}
    >
      {/* deep tinted liquid glass over the (dimmed) reading surface */}
      <GlassPanel
        radius={0}
        intensity={70}
        tintColor={palette.surfaceLowest}
        style={{ flex: 1 }}
      >
        {/* Dark base for the now-playing. NOTE: expo-blur's web BlurView
            renders a LIGHT frost regardless of tint, so a low-opacity dim
            washes the whole panel pale on web — it must stay high to read as
            the mockup's dark glass--deep. On native (real dark blur) this
            still lets the reading surface through as a faint hint. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: withAlpha(palette.surfaceLowest, 0.92),
          }}
        />
        <LinearGradient
          colors={[withAlpha(palette.primaryContainer, 0.3), "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          style={{
            flex: 1,
            paddingTop: Math.max(insets.top + 8, 40),
            paddingBottom: Math.max(insets.bottom + 12, 26),
            paddingHorizontal: 22,
          }}
        >
          {/* top row — collapse ▾ · NOW PLAYING grip · Ask ✦ */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <Pressable
              onPress={onCollapse}
              accessibilityRole="button"
              accessibilityLabel="Collapse to mini player"
              hitSlop={10}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="keyboard-arrow-down" size={28} color={palette.onSurface} />
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <View
                style={{
                  width: 38,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: withAlpha(palette.onSurfaceVariant, 0.4),
                }}
              />
              <Text
                style={{
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 10,
                  letterSpacing: 2,
                  color: palette.onSurfaceVariant,
                  marginTop: 8,
                }}
              >
                NOW PLAYING
              </Text>
            </View>
            <Pressable
              onPress={onAsk}
              accessibilityRole="button"
              accessibilityLabel="Ask about this document"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: withAlpha(palette.surfaceContainer, 0.7),
                borderWidth: 1,
                borderColor: withAlpha(palette.accent, 0.35),
              }}
            >
              <MaterialIcons name="auto-awesome" size={15} color={palette.accent} />
              <Text
                style={{
                  color: palette.accent,
                  fontFamily: "SpaceGrotesk_600SemiBold",
                  fontSize: 13,
                }}
              >
                Ask
              </Text>
            </Pressable>
          </View>

          {/* cover */}
          <View style={{ alignItems: "center", marginTop: 10 }}>
            <LinearGradient
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              colors={["#2a0f18", palette.primaryContainer, palette.accent]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{
                width: 220,
                height: 220,
                borderRadius: 26,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: palette.primaryContainer,
                shadowOpacity: 0.6,
                shadowRadius: 40,
                shadowOffset: { width: 0, height: 20 },
              }}
            >
              <Text
                style={{
                  fontFamily: "SpaceGrotesk_700Bold",
                  fontSize: 72,
                  color: "#fff",
                  textShadowColor: "rgba(0,0,0,0.35)",
                  textShadowRadius: 20,
                }}
              >
                {glyph}
              </Text>
            </LinearGradient>
          </View>

          {/* meta */}
          <View style={{ alignItems: "center", marginTop: 16 }}>
            <Text
              numberOfLines={2}
              style={{
                color: palette.onSurface,
                fontFamily: "SpaceGrotesk_700Bold",
                fontSize: 19,
                textAlign: "center",
                letterSpacing: -0.3,
              }}
            >
              {docTitle}
            </Text>
            {docSubtitle ? (
              <Text
                numberOfLines={1}
                style={{
                  color: palette.onSurfaceVariant,
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  marginTop: 3,
                }}
              >
                {docSubtitle}
              </Text>
            ) : null}
            <Pressable
              onPress={onOpenChapters}
              accessibilityRole="button"
              accessibilityLabel={`${chapterLabel} — open contents`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 12,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: withAlpha(palette.accent, 0.1),
                borderWidth: 1,
                borderColor: withAlpha(palette.accent, 0.3),
              }}
            >
              <MaterialIcons name="menu-book" size={12} color={palette.accent} />
              <Text
                numberOfLines={1}
                style={{
                  color: palette.accent,
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 11,
                  maxWidth: 260,
                }}
              >
                {chapterLabel}
              </Text>
            </Pressable>
          </View>

          {/* big scrubber */}
          <View style={{ marginTop: 22 }}>
            <Slider
              value={Math.min(chapterStart + inChapter, Math.max(chapterStart, chapterEnd - 1))}
              minimumValue={chapterStart}
              maximumValue={Math.max(chapterStart + 1, chapterEnd - 1)}
              step={1}
              onSlidingComplete={clampSeek}
              minimumTrackTintColor={palette.accent}
              maximumTrackTintColor={withAlpha(palette.outlineVariant, 0.4)}
              thumbTintColor="#ffffff"
              accessibilityLabel="Position in this chapter"
              accessibilityValue={{
                min: 0,
                max: chapterWords,
                now: inChapter,
                text: `${clock(inChapter)} elapsed of this chapter`,
              }}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={{ color: palette.accent, fontFamily: "JetBrainsMono_400Regular", fontSize: 11 }}>
                {clock(inChapter)} elapsed
              </Text>
              <Text style={{ color: palette.onSurfaceVariant, fontFamily: "JetBrainsMono_400Regular", fontSize: 11 }}>
                {clock(chapterWords - inChapter)} left
              </Text>
            </View>
          </View>

          {/* big transport */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 34,
              marginTop: 22,
              marginBottom: 8,
            }}
          >
            <Pressable
              onPress={onPrevChapter}
              accessibilityRole="button"
              accessibilityLabel="Previous chapter"
              hitSlop={8}
              style={{ padding: 8 }}
            >
              <MaterialIcons name="skip-previous" size={34} color={palette.onSurface} />
            </Pressable>
            <Pressable
              onPress={onTogglePlay}
              accessibilityRole="button"
              accessibilityLabel={playing ? "Pause" : "Play"}
              style={{
                width: 78,
                height: 78,
                borderRadius: 39,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: palette.accent,
                shadowColor: palette.accent,
                shadowOpacity: 0.5,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
              }}
            >
              <MaterialIcons
                name={playing ? "pause" : "play-arrow"}
                size={42}
                color={palette.onPrimary}
              />
            </Pressable>
            <Pressable
              onPress={onNextChapter}
              accessibilityRole="button"
              accessibilityLabel="Next chapter"
              hitSlop={8}
              style={{ padding: 8 }}
            >
              <MaterialIcons name="skip-next" size={34} color={palette.onSurface} />
            </Pressable>
          </View>

          {/* controls — tone row + WPM stepper */}
          <View style={{ marginTop: "auto", gap: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text
                style={{
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: palette.onSurfaceVariant,
                }}
              >
                Voice / tone
              </Text>
              <ToneSelector value={voice} onVoice={onVoice} palette={palette} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text
                style={{
                  fontFamily: "JetBrainsMono_400Regular",
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: palette.onSurfaceVariant,
                }}
              >
                Reading speed
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  backgroundColor: withAlpha(palette.surfaceLowest, 0.7),
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Pressable
                  onPress={() => onWpm(Math.max(120, wpm - 10))}
                  accessibilityRole="button"
                  accessibilityLabel="Slower"
                  hitSlop={6}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: palette.surfaceHigh,
                  }}
                >
                  <MaterialIcons name="remove" size={18} color={palette.onSurface} />
                </Pressable>
                <Text
                  style={{
                    color: palette.accent,
                    fontFamily: "JetBrainsMono_400Regular",
                    fontSize: 13,
                    minWidth: 96,
                    textAlign: "center",
                  }}
                >
                  {wpm} wpm · {speedX}×
                </Text>
                <Pressable
                  onPress={() => onWpm(Math.min(950, wpm + 10))}
                  accessibilityRole="button"
                  accessibilityLabel="Faster"
                  hitSlop={6}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: palette.surfaceHigh,
                  }}
                >
                  <MaterialIcons name="add" size={18} color={palette.onSurface} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

// Segmented Soft / Natural / Deep — shared by both heights.
function ToneSelector({ value, onVoice, palette }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 4,
        backgroundColor: withAlpha(palette.surfaceLowest, 0.7),
        borderRadius: 999,
        padding: 4,
      }}
    >
      {TONES.map((item) => {
        const on = item === value;
        return (
          <Pressable
            key={item}
            onPress={() => onVoice(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Tone ${item}`}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: on ? withAlpha(palette.accent, 0.16) : "transparent",
            }}
          >
            <Text
              style={{
                color: on ? palette.accent : palette.onSurfaceVariant,
                fontFamily: "Inter_600SemiBold",
                fontSize: 12,
              }}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
