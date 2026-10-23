import { MaterialIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line, Path } from "react-native-svg";

import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { GlassPanel, SignalLabel, withAlpha } from "../primitives";

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
  words,
}) {
  const palette = usePalette();
  const { isSignal } = useTheme();
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

  if (expanded && isSignal) {
    return (
      <SignalExpandedPlayer
        insets={insets}
        playing={playing}
        wordIndex={wordIndex}
        words={words}
        chapterIndex={chapterIndex}
        chapterCount={chapterCount}
        chapterStart={chapterStart}
        chapterEnd={chapterEnd}
        chapterWords={chapterWords}
        inChapter={inChapter}
        chapterPct={chapterPct}
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
            gradient over the dark base) — matches the expanded sibling.
            Signal keeps its panels flat. */}
        {!isSignal ? (
          <LinearGradient
            colors={[withAlpha(palette.accent, 0.1), withAlpha(palette.primaryContainer, 0.18)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : null}
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
                  fontFamily: palette.fonts.mono,
                  fontSize: 11,
                }}
              >
                {Math.round(chapterPct * 100)}% · Ch {chapterIndex + 1}/{chapterCount}
              </Text>
            </Pressable>
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: palette.fonts.mono,
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
            {isSignal ? (
              <Pressable onPress={onTogglePlay} accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"}>
                {({ pressed }) => {
                  const sh = Math.max(3, palette.shape.shadow);
                  const r = Math.min(16, palette.shape.radiusControl);
                  return (
                    <View style={{ width: 64, height: 64 }}>
                      <View style={{ position: "absolute", top: sh, left: sh, width: 64, height: 64, borderRadius: r, backgroundColor: palette.shadowColor }} />
                      <View
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: r,
                          borderWidth: 2,
                          borderColor: palette.shadowColor,
                          backgroundColor: palette.accentFill,
                          alignItems: "center",
                          justifyContent: "center",
                          transform: pressed ? [{ translateX: sh }, { translateY: sh }] : [],
                        }}
                      >
                        <MaterialIcons name={playing ? "pause" : "play-arrow"} size={34} color={palette.accentInk} />
                      </View>
                    </View>
                  );
                }}
              </Pressable>
            ) : (
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
            )}
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
                  fontFamily: palette.fonts.mono,
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
                  fontFamily: palette.fonts.mono,
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
                  fontFamily: palette.fonts.displaySemi,
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
                  fontFamily: palette.fonts.display,
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
                fontFamily: palette.fonts.display,
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
                  fontFamily: palette.fonts.body,
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
                  fontFamily: palette.fonts.mono,
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
              <Text style={{ color: palette.accent, fontFamily: palette.fonts.mono, fontSize: 11 }}>
                {clock(inChapter)} elapsed
              </Text>
              <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 11 }}>
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
                  fontFamily: palette.fonts.mono,
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
                  fontFamily: palette.fonts.mono,
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
                    fontFamily: palette.fonts.mono,
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
                fontFamily: palette.fonts.bodySemi,
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

// ======================= Signal — expanded (S-Reader board) =================
// Same contract as ExpandedPlayer. The scope draws the chapter as a 3:2
// Lissajous figure whose bright part grows with progress (no animation of
// its own — it moves only as you read). "Reading along" shows the current
// sentence with the spoken word marked.

function readingWindow(words, idx) {
  if (!Array.isArray(words) || !words.length) return null;
  const i = Math.max(0, Math.min(words.length - 1, idx || 0));
  const ends = (w) => /[.!?…]["”’)]*$/.test(w || "");
  let s = i;
  while (s > 0 && i - s < 28 && !ends(words[s - 1])) s -= 1;
  let e = i;
  while (e < words.length - 1 && e - i < 28 && !ends(words[e])) e += 1;
  return {
    before: words.slice(s, i).join(" "),
    word: words[i] || "",
    after: words.slice(i + 1, e + 1).join(" "),
    pos: i - s + 1,
    len: e - s + 1,
  };
}

function lissajousPath(fromT, toT, steps = 160) {
  const pts = [];
  for (let k = 0; k <= steps; k += 1) {
    const t = fromT + ((toT - fromT) * k) / steps;
    pts.push(`${(150 + 136 * Math.sin(3 * t + 0.6)).toFixed(1)},${(100 + 84 * Math.sin(2 * t)).toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

function BoxButton({ icon, label, onPress, size = 56, iconSize = 28 }) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: Math.min(14, palette.shape.radiusControl),
        borderWidth: 1.5,
        borderColor: palette.control,
        backgroundColor: pressed ? withAlpha(palette.accent, 0.14) : withAlpha(palette.surfaceContainer, 0.7),
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <MaterialIcons name={icon} size={iconSize} color={palette.onSurface} />
    </Pressable>
  );
}

function SignalExpandedPlayer({
  insets,
  playing,
  wordIndex,
  words,
  chapterIndex,
  chapterCount,
  chapterStart,
  chapterEnd,
  chapterWords,
  inChapter,
  chapterPct,
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
  const palette = usePalette();
  const sh = Math.max(3, palette.shape.shadow);
  const ctx = readingWindow(words, wordIndex);
  const heading = sectionHeading && sectionHeading !== docTitle ? sectionHeading : null;
  const chip = `CH ${chapterIndex + 1}${heading ? ` · ${heading}` : ""}`.toUpperCase();
  const T = Math.PI * 2;
  const r = Math.min(14, palette.shape.radiusControl);

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, backgroundColor: palette.surface }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: Math.max(insets.top + 8, 24),
          paddingBottom: Math.max(insets.bottom + 16, 24),
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* top row */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <BoxButton icon="keyboard-arrow-down" label="Collapse to mini player" onPress={onCollapse} size={46} />
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: playing ? palette.accentFill : palette.outline, marginRight: 8 }} />
            <SignalLabel>{playing ? "Now playing" : "Paused"}</SignalLabel>
          </View>
          <Pressable
            onPress={onAsk}
            accessibilityRole="button"
            accessibilityLabel="Ask about this document"
            style={({ pressed }) => ({
              minHeight: 46,
              paddingHorizontal: 14,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: r,
              borderWidth: 1.5,
              borderColor: palette.control,
              backgroundColor: pressed ? withAlpha(palette.accent, 0.14) : withAlpha(palette.surfaceContainer, 0.7),
            })}
          >
            <MaterialIcons name="auto-awesome" size={16} color={palette.accent} />
            <Text style={{ marginLeft: 6, color: palette.accent, fontFamily: palette.fonts.bodyBold, fontSize: 15 }}>Ask</Text>
          </Pressable>
        </View>

        {/* scope: the chapter as a Lissajous figure, bright up to here */}
        <GlassPanel style={{ marginTop: 16, padding: 10 }}>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Chapter ${chapterIndex + 1} of ${chapterCount}, ${Math.round(chapterPct * 100)} percent read`}
            style={{ height: 196, borderRadius: Math.min(10, r), borderWidth: 1, borderColor: palette.line, overflow: "hidden", backgroundColor: withAlpha(palette.surfaceLowest, 0.8) }}
          >
            <Svg width="100%" height="100%" viewBox="0 0 300 200" preserveAspectRatio="none">
              {[50, 100, 150].map((y) => (
                <Line key={`h${y}`} x1={0} y1={y} x2={300} y2={y} stroke={palette.grid} strokeOpacity={y === 100 ? 0.22 : 0.1} strokeWidth={1} />
              ))}
              {[75, 150, 225].map((x) => (
                <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={200} stroke={palette.grid} strokeOpacity={x === 150 ? 0.22 : 0.1} strokeWidth={1} />
              ))}
              <Path d={lissajousPath(0, T)} fill="none" stroke={palette.accentFill} strokeOpacity={0.28} strokeWidth={2} />
              {chapterPct > 0.004 ? (
                <Path d={lissajousPath(0, T * chapterPct, Math.max(12, Math.round(160 * chapterPct)))} fill="none" stroke={palette.accentFill} strokeWidth={5} strokeLinecap="round" />
              ) : null}
            </Svg>
            <Text style={{ position: "absolute", top: 8, left: 10, color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 11 }}>X:Y 3:2</Text>
            <Text style={{ position: "absolute", top: 8, right: 10, color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 11 }}>
              {`CH ${chapterIndex + 1}/${chapterCount}`}
            </Text>
            <Text style={{ position: "absolute", bottom: 8, left: 10, color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 11 }}>
              {`VOICE ${String(voice || "").toUpperCase()} · ${wpm} WPM`}
            </Text>
            <Text style={{ position: "absolute", bottom: 2, right: 10, color: withAlpha(palette.onSurface, 0.22), fontFamily: palette.fonts.display, fontSize: 30 }}>Ψ</Text>
          </View>
        </GlassPanel>

        {/* title + meta */}
        <Text numberOfLines={2} accessibilityRole="header" style={{ marginTop: 18, color: palette.onSurface, fontFamily: palette.fonts.display, fontSize: 28, lineHeight: 31 }}>
          {docTitle}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 12 }}>
            {docSubtitle || ""}
          </Text>
          <Pressable
            onPress={onOpenChapters}
            accessibilityRole="button"
            accessibilityLabel={`Chapter ${chapterIndex + 1} of ${chapterCount}${heading ? `, ${heading}` : ""}. Open contents`}
            style={{ marginLeft: 10, minHeight: 32, maxWidth: 200, paddingHorizontal: 8, justifyContent: "center", borderWidth: 1.5, borderColor: palette.control }}
          >
            <Text numberOfLines={1} style={{ color: palette.onSurface, fontFamily: palette.fonts.label, fontSize: 11, letterSpacing: 1 }}>
              {chip}
            </Text>
          </Pressable>
        </View>

        {/* reading along */}
        {ctx ? (
          <GlassPanel style={{ marginTop: 14, padding: 14 }}>
            <SignalLabel>{`Reading along · word ${ctx.pos} of ${ctx.len}`}</SignalLabel>
            <Text style={{ marginTop: 8, color: palette.onSurface, fontFamily: palette.fonts.body, fontSize: 17, lineHeight: 26 }}>
              {ctx.before ? `${ctx.before} ` : ""}
              <Text style={{ color: palette.accentInk, backgroundColor: palette.accentFill, fontFamily: palette.fonts.bodyBold }}>{` ${ctx.word} `}</Text>
              {ctx.after ? ` ${ctx.after}` : ""}
            </Text>
          </GlassPanel>
        ) : null}

        {/* scrubber */}
        <View style={{ marginTop: 16 }}>
          <Slider
            value={Math.min(chapterStart + inChapter, Math.max(chapterStart, chapterEnd - 1))}
            minimumValue={chapterStart}
            maximumValue={Math.max(chapterStart + 1, chapterEnd - 1)}
            step={1}
            onSlidingComplete={clampSeek}
            minimumTrackTintColor={palette.accentFill}
            maximumTrackTintColor={palette.outline}
            thumbTintColor={palette.onSurface}
            accessibilityLabel="Position in this chapter"
            accessibilityValue={{ min: 0, max: chapterWords, now: inChapter, text: `${clock(inChapter)} elapsed of this chapter` }}
          />
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, marginTop: 2 }}>
            {Array.from({ length: 31 }, (_, k) => (
              <View key={k} style={{ width: k % 5 === 0 ? 2 : 1, height: k % 5 === 0 ? 10 : 6, backgroundColor: k / 30 <= chapterPct ? palette.accentFill : palette.outline }} />
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ color: palette.accent, fontFamily: palette.fonts.label, fontSize: 13 }}>{clock(inChapter)}</Text>
            <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.label, fontSize: 13 }}>{`−${clock(chapterWords - inChapter)}`}</Text>
          </View>
        </View>

        {/* transport */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 26, marginTop: 14 }}>
          <BoxButton icon="fast-rewind" label="Previous chapter" onPress={onPrevChapter} size={60} />
          <Pressable onPress={onTogglePlay} accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"}>
            {({ pressed }) => (
              <View style={{ width: 88, height: 88 }}>
                <View style={{ position: "absolute", top: sh, left: sh, width: 88, height: 88, borderRadius: Math.min(18, palette.shape.radiusControl), backgroundColor: palette.shadowColor }} />
                <View
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: Math.min(18, palette.shape.radiusControl),
                    borderWidth: 2,
                    borderColor: palette.shadowColor,
                    backgroundColor: palette.accentFill,
                    alignItems: "center",
                    justifyContent: "center",
                    transform: pressed ? [{ translateX: sh }, { translateY: sh }] : [],
                  }}
                >
                  <MaterialIcons name={playing ? "pause" : "play-arrow"} size={44} color={palette.accentInk} />
                </View>
              </View>
            )}
          </Pressable>
          <BoxButton icon="fast-forward" label="Next chapter" onPress={onNextChapter} size={60} />
        </View>

        {/* reading speed */}
        <GlassPanel style={{ marginTop: 20, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <SignalLabel style={{ flex: 1 }}>Reading speed</SignalLabel>
            <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.display, fontSize: 18 }}>{wpm}</Text>
            <Text style={{ marginLeft: 6, color: palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 12 }}>{`WPM · ${speedX}×`}</Text>
          </View>
          <Slider
            value={wpm}
            minimumValue={120}
            maximumValue={950}
            step={10}
            onSlidingComplete={(v) => onWpm(Math.round(v))}
            minimumTrackTintColor={palette.accentFill}
            maximumTrackTintColor={palette.outline}
            thumbTintColor={palette.accentFill}
            accessibilityLabel="Reading speed"
            accessibilityValue={{ min: 120, max: 950, now: wpm, text: `${wpm} words per minute` }}
            style={{ marginTop: 6, height: 40 }}
          />
        </GlassPanel>

        {/* voice */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }}>
          <SignalLabel style={{ width: 64 }}>Voice</SignalLabel>
          <View accessibilityRole="radiogroup" accessibilityLabel="Voice tone" style={{ flex: 1, flexDirection: "row", gap: 6, padding: 4, borderRadius: r, borderWidth: 1.5, borderColor: palette.control }}>
            {TONES.map((item) => {
              const on = item === voice;
              return (
                <Pressable
                  key={item}
                  onPress={() => onVoice(item)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Tone ${item}`}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: Math.max(2, r - 4),
                    borderWidth: on ? 1.5 : 0,
                    borderColor: palette.shadowColor,
                    backgroundColor: on ? palette.accentFill : "transparent",
                  }}
                >
                  <Text style={{ color: on ? palette.accentInk : palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 14 }}>
                    {item[0].toUpperCase() + item.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
