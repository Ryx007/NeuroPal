import { MaterialIcons } from "@expo/vector-icons";
import { forwardRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Svg, { Circle, Polygon, Rect } from "react-native-svg";

import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { SignalLabel, skinRadius, withAlpha } from "../primitives";

// Small skin-aware pieces shared by the Pal sheet's panels. Colours, fonts
// and radii come from the theme tokens only (Classic stays soft glass;
// Signal gets hard borders, mono labels and an offset shadow block).

// The three states, never colour-only: a word and a shape (as on Home).
export const STATES = [
  { id: "green", shape: "circle", label: "Okay", a11y: "I feel okay" },
  { id: "yellow", shape: "triangle", label: "A bit off", a11y: "Feeling a bit off" },
  { id: "red", shape: "square", label: "Overwhelmed", a11y: "Overwhelmed" },
];

export function StateGlyph({ shape, color, size = 12 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      {shape === "circle" ? <Circle cx={6} cy={6} r={5} fill={color} /> : null}
      {shape === "triangle" ? <Polygon points="6,1 11.5,11 0.5,11" fill={color} /> : null}
      {shape === "square" ? <Rect x={1} y={1} width={10} height={10} fill={color} /> : null}
    </Svg>
  );
}

export function PanelTitle({ children, eyebrow }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  return (
    <View>
      {eyebrow ? <SignalLabel>{eyebrow}</SignalLabel> : null}
      <Text
        accessibilityRole="header"
        style={{
          marginTop: eyebrow ? 4 : 0,
          color: palette.onSurface,
          fontFamily: isSignal ? palette.fonts.display : palette.fonts.displaySemi,
          fontSize: isSignal ? 22 : 20,
          letterSpacing: isSignal ? -0.2 : -0.3,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export function Intro({ children, style, ...rest }) {
  const palette = usePalette();
  return (
    <Text {...rest} style={[{ marginTop: 4, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 14, lineHeight: 20 }, style]}>
      {children}
    </Text>
  );
}

// A quiet block for one thing (the suggestion, a step list, the timer).
export function PalCard({ children, style, accent = false }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  if (!isSignal) {
    return (
      <View
        style={[
          {
            marginTop: 14,
            padding: 16,
            borderRadius: 18,
            backgroundColor: accent ? withAlpha(palette.accent, 0.1) : palette.surfaceHigh,
            borderWidth: accent ? 1 : 0,
            borderColor: withAlpha(palette.accent, 0.35),
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  const sh = Math.min(5, palette.shape.shadow);
  const r = palette.shape.radiusMedium;
  return (
    <View style={[{ marginTop: 14, marginRight: sh, marginBottom: sh }, style]}>
      {sh > 0 ? (
        <View pointerEvents="none" style={{ position: "absolute", top: sh, left: sh, right: -sh, bottom: -sh, borderRadius: r, backgroundColor: palette.shadowColor }} />
      ) : null}
      <View
        style={{
          padding: 14,
          borderRadius: r,
          borderWidth: Math.max(1, palette.shape.border),
          borderColor: accent ? palette.accent : palette.line,
          backgroundColor: palette.surfaceHigh,
        }}
      >
        {children}
      </View>
    </View>
  );
}

// Text field in the sheet's style (PalBuilder's name field, both skins).
// Its edge is ≥ 3:1 in every skin (WCAG 1.4.11): Classic's fill alone was
// 1.12:1 against the sheet. Placeholder: onSurfaceVariant, no alpha.
export const PalField = forwardRef(function PalField({ style, ...props }, ref) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={palette.onSurfaceVariant}
      style={[
        {
          minHeight: 48,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: isSignal ? palette.shape.radiusControl : 14,
          borderWidth: isSignal ? 1.5 : 1,
          borderColor: isSignal ? palette.control : palette.outline,
          backgroundColor: isSignal ? withAlpha(palette.surfaceLowest, 0.6) : palette.surfaceHigh,
          color: palette.onSurface,
          fontFamily: palette.fonts.body,
          fontSize: 15,
        },
        style,
      ]}
      {...props}
    />
  );
});

// Square 44+ px icon button with a spoken label (and an optional short
// visible label for the less obvious actions).
export function IconAction({ icon, label, accessibilityLabel, onPress, disabled = false, done = false, tone }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const fg = done ? palette.accent : tone || palette.onSurface;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        paddingHorizontal: label ? 10 : 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: isSignal ? palette.shape.radiusControl : 12,
        borderWidth: isSignal ? 1.5 : 1,
        borderColor: isSignal ? palette.control : withAlpha(palette.outlineVariant, 0.5),
        backgroundColor: pressed ? withAlpha(palette.accent, 0.12) : "transparent",
        opacity: disabled && !done ? 0.45 : 1,
      })}
    >
      <MaterialIcons name={icon} size={18} color={fg} />
      {label ? <Text style={{ marginLeft: 6, color: fg, fontFamily: palette.fonts.bodySemi, fontSize: 13 }}>{label}</Text> : null}
    </Pressable>
  );
}

// Plain one-line link-style button (e.g. "Clear chat", "Undo").
export function TextAction({ label, onPress, accessibilityLabel, tone }) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      hitSlop={6}
      style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 2 }}
    >
      <Text style={{ color: tone || palette.accent, fontFamily: palette.fonts.bodySemi, fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
}

// The 3-tap check-in, inline (for "What now?" when the user hasn't checked in).
export function CheckInRow({ value, onPick }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  return (
    <View accessibilityRole="radiogroup" aria-label="How are you right now?" style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
      {STATES.map((s) => {
        const on = value === s.id;
        const fg = on ? (isSignal ? palette.accentInk : palette.accent) : palette.onSurface;
        return (
          <Pressable
            key={s.id}
            onPress={() => onPick(s.id)}
            accessibilityRole="radio"
            aria-checked={on}
            accessibilityLabel={s.a11y}
            style={{
              flex: 1,
              minHeight: 52,
              paddingHorizontal: 6,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: isSignal ? palette.shape.radiusControl : 16,
              borderWidth: on ? 2 : 1.5,
              borderColor: on ? (isSignal ? palette.shadowColor : palette.accent) : isSignal ? palette.control : withAlpha(palette.outline, 0.5),
              backgroundColor: on ? (isSignal ? palette.accentFill : withAlpha(palette.accent, 0.14)) : "transparent",
            }}
          >
            <StateGlyph shape={s.shape} color={fg} />
            <Text numberOfLines={1} style={{ marginTop: 4, color: fg, fontFamily: palette.fonts.bodySemi, fontSize: 12.5 }}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Thin, static progress bar (no animation; it just fills as time passes).
export function ProgressBar({ value, accessibilityLabel }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const pct = Math.max(0, Math.min(1, Number(value) || 0));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{
        height: 8,
        marginTop: 14,
        borderRadius: isSignal ? skinRadius(palette, 4) : 4,
        overflow: "hidden",
        backgroundColor: isSignal ? withAlpha(palette.surfaceLowest, 0.8) : withAlpha(palette.outlineVariant, 0.35),
        borderWidth: isSignal ? 1 : 0,
        borderColor: palette.line,
      }}
    >
      <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: isSignal ? palette.accentFill : palette.accent }} />
    </View>
  );
}
