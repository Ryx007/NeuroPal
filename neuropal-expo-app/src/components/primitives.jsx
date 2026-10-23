import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { usePalette, useTheme } from "../theme/ThemeProvider";

// ---------------------------------------------------------------------------
// v2 primitives are SKIN-AWARE. Classic renders exactly as before (liquid
// glass, gradients, pills). Signal renders brutal glass: a smoked panel with
// a hard border and an OFFSET shadow block (Android can't draw hard shadows,
// so it is a real View behind the panel), mono uppercase labels, solid
// buttons that press INTO their shadow.
// ---------------------------------------------------------------------------

// Layout props belong on the outer wrapper (so the shadow block sits in the
// right place); visual/content props stay on the inner panel.
const OUTER_KEYS = new Set([
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "marginHorizontal", "marginVertical",
  "marginStart", "marginEnd", "flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf", "position", "top", "left",
  "right", "bottom", "zIndex", "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "transform",
  "opacity", "elevation",
]);

export function splitStyle(style) {
  const flat = StyleSheet.flatten(style) || {};
  const outer = {};
  const inner = {};
  for (const [k, v] of Object.entries(flat)) (OUTER_KEYS.has(k) ? outer : inner)[k] = v;
  // When the wrapper is sized, the panel must fill it.
  if (outer.flex || outer.flexGrow || outer.height || outer.minHeight) inner.flexGrow = 1;
  return { outer, inner };
}

// Scale a Classic-era radius into the Signal corner setting (Sharp/Soft/Round).
export function skinRadius(palette, classicRadius) {
  if (palette.skin !== "signal") return classicRadius;
  if (!classicRadius) return 0;
  return Math.round(palette.shape.radius * Math.min(1, classicRadius / 24));
}

export function GlassPanel({ children, style, radius = 24, intensity = 40, tint, tintColor, flat = false }) {
  const palette = usePalette();
  const { isLight, isSignal } = useTheme();
  const resolvedTint = tint || (isLight ? "light" : "dark");

  if (isSignal) {
    return (
      <SignalPanel style={style} radius={radius} tintColor={tintColor} flat={flat} blurTint={resolvedTint} intensity={intensity}>
        {children}
      </SignalPanel>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: "hidden",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: withAlpha(palette.outlineVariant, 0.15),
        },
        style,
      ]}
    >
      {/* Real blur on every platform: Android renders nothing without the
          experimental method (the old panel was just 65% color — content
          showed straight through). The tint layer above the blur keeps the
          background a "dispersed idea", not a window. */}
      <BlurView
        intensity={intensity}
        tint={resolvedTint}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: withAlpha(tintColor || palette.surfaceContainer, 0.82),
          },
        ]}
      />
      {/* D3 — soft specular top edge, the liquid-glass signature */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: withAlpha("#FFFFFF", 0.09),
        }}
      />
      {children}
    </View>
  );
}

// Brutal glass. `radius === 0` marks edge-to-edge chrome (header, drawer):
// no border box and no shadow there, just the smoked surface.
export function SignalPanel({ children, style, radius = 24, tintColor, flat = false, blurTint = "dark", intensity = 30 }) {
  const palette = usePalette();
  const chrome = radius === 0;
  const r = chrome ? 0 : skinRadius(palette, radius);
  const sh = chrome || flat ? 0 : palette.shape.shadow;
  const { outer, inner } = splitStyle(style);

  return (
    <View style={outer}>
      {sh > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: sh,
            left: sh,
            right: -sh,
            bottom: -sh,
            borderRadius: r,
            backgroundColor: palette.shadowColor,
          }}
        />
      ) : null}
      <View
        style={[
          {
            borderRadius: r,
            overflow: "hidden",
            borderWidth: chrome ? 0 : palette.shape.border,
            borderColor: palette.line,
          },
          inner,
        ]}
      >
        <BlurView
          intensity={Math.min(intensity, 30)}
          tint={blurTint}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: withAlpha(tintColor || palette.panelColor, Math.min(0.94, palette.panelAlpha + 0.16)) },
          ]}
        />
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: withAlpha("#FFFFFF", 0.09) }}
        />
        {children}
      </View>
    </View>
  );
}

export function DataPulse({ size = 7 }) {
  const palette = usePalette();
  const { motionLevel } = useTheme();
  const progress = useSharedValue(0);
  const still = motionLevel === "Still";

  useEffect(() => {
    if (still) {
      progress.value = 1;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [progress, still]);

  const animated = useAnimatedStyle(() => {
    const value = progress.value;
    return {
      transform: [{ scale: 1 + 0.3 * value }],
      opacity: 0.4 + 0.6 * value,
    };
  });

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.skin === "signal" ? palette.accentFill : palette.accent,
          shadowColor: palette.accent,
          shadowOpacity: 0.5,
          shadowRadius: 8,
        },
        animated,
      ]}
    />
  );
}

// A solid block that presses INTO its hard shadow (Signal) or the original
// gradient pill (Classic).
export function NpPrimaryButton({ label, icon, onPress, expanded, disabled = false, accessibilityLabel }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const [down, setDown] = useState(false);

  if (isSignal) {
    const sh = palette.shape.shadow;
    const r = palette.shape.radiusControl;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        style={{ alignSelf: expanded ? "stretch" : "flex-start", opacity: disabled ? 0.45 : 1 }}
      >
        {sh > 0 ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: sh, left: sh, right: -sh, bottom: -sh, borderRadius: r, backgroundColor: palette.accentDeep }}
          />
        ) : null}
        <View
          style={{
            minHeight: 48,
            paddingHorizontal: 20,
            borderRadius: r,
            backgroundColor: palette.accentFill,
            borderWidth: Math.max(1, palette.shape.border),
            borderColor: palette.shadowColor,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            transform: down && sh ? [{ translateX: sh }, { translateY: sh }] : [],
          }}
        >
          {icon ? <MaterialIcons name={icon} size={18} color={palette.accentInk} style={{ marginRight: 8 }} /> : null}
          <Text style={{ color: palette.accentInk, fontFamily: palette.fonts.bodyBold, fontSize: 15 }}>{label}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        transform: [{ translateY: pressed ? 0 : -1 }],
        opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
      })}
    >
      <LinearGradient
        colors={[palette.primary, palette.primaryContainer]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingHorizontal: 22,
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          alignSelf: expanded ? "stretch" : "flex-start",
          shadowColor: palette.accent,
          shadowOpacity: 0.3,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        {icon ? (
          <MaterialIcons
            name={icon}
            size={18}
            color={palette.onPrimary}
            style={{ marginRight: 10 }}
          />
        ) : null}
        <Text
          style={{
            color: palette.onPrimary,
            fontFamily: palette.fonts.displaySemi,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

export function NpGhostButton({ label, icon, onPress, disabled = false, accessibilityLabel }) {
  const palette = usePalette();
  const { isSignal } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: isSignal ? 44 : undefined,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: isSignal ? palette.shape.radiusControl : 14,
        borderWidth: isSignal ? 1.5 : 1,
        borderColor: isSignal ? palette.control : withAlpha(palette.outlineVariant, 0.25),
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        opacity: disabled ? 0.45 : 1,
        backgroundColor: pressed ? withAlpha(palette.accent, 0.08) : "transparent",
      })}
    >
      {icon ? (
        <MaterialIcons
          name={icon}
          size={16}
          color={isSignal ? palette.onSurface : palette.accent}
          style={{ marginRight: 8 }}
        />
      ) : null}
      <Text
        style={{
          color: isSignal ? palette.onSurface : palette.accent,
          fontFamily: isSignal ? palette.fonts.bodyBold : palette.fonts.displaySemi,
          fontSize: isSignal ? 14 : 13,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Mono uppercase engineering label (Signal) / quiet eyebrow (Classic).
export function SignalLabel({ children, style, color, accessibilityRole }) {
  const palette = usePalette();
  const isSignal = palette.skin === "signal";
  return (
    <Text
      accessibilityRole={accessibilityRole}
      style={[
        {
          fontFamily: isSignal ? palette.fonts.label : palette.fonts.bodyMedium,
          fontSize: 11,
          letterSpacing: isSignal ? 1.6 : 2.4,
          textTransform: "uppercase",
          color: color || (isSignal ? palette.outline : withAlpha(palette.accent, 0.85)),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// Selectable chip used by the Make-it-yours screens. Selection is never
// colour-only: the selected chip also gets a check icon and the
// accessibility "selected" state.
export function Chip({ label, selected = false, onPress, icon, disabled = false, accessibilityLabel, compact = false }) {
  const palette = usePalette();
  const isSignal = palette.skin === "signal";
  const bg = selected ? (isSignal ? palette.accentFill : withAlpha(palette.accent, 0.16)) : "transparent";
  const fg = selected ? (isSignal ? palette.accentInk : palette.accent) : palette.onSurface;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: compact ? 10 : 13,
        borderRadius: palette.shape.radiusControl,
        borderWidth: 1.5,
        borderColor: selected ? (isSignal ? palette.shadowColor : palette.accent) : isSignal ? palette.control : withAlpha(palette.outline, 0.5),
        backgroundColor: pressed && !selected ? withAlpha(palette.accent, 0.08) : bg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.42 : 1,
      })}
    >
      {selected ? <MaterialIcons name="check" size={14} color={fg} style={{ marginRight: 5 }} /> : icon ? (
        <MaterialIcons name={icon} size={15} color={fg} style={{ marginRight: 5 }} />
      ) : null}
      <Text style={{ color: fg, fontFamily: palette.fonts.bodySemi, fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
}

export function SectionHeader({ label, trailing, live = false }) {
  const palette = usePalette();
  const isSignal = palette.skin === "signal";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 4,
      }}
    >
      {live ? (
        <View style={{ marginRight: 10 }}>
          <DataPulse />
        </View>
      ) : null}
      {isSignal ? (
        <SignalLabel accessibilityRole="header" style={{ fontSize: 12 }}>
          {label}
        </SignalLabel>
      ) : (
        <Text
          accessibilityRole="header"
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: palette.fonts.displaySemi,
            fontSize: 16,
            fontWeight: "500",
          }}
        >
          {label}
        </Text>
      )}
      <View style={{ flex: 1 }} />
      {trailing ? (
        <Text
          style={{
            color: isSignal ? palette.accent : withAlpha(palette.accent, 0.7),
            fontFamily: isSignal ? palette.fonts.label : palette.fonts.bodyMedium,
            fontSize: 11,
            letterSpacing: isSignal ? 1.2 : 2,
          }}
        >
          {trailing.toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}

export function withAlpha(color, alpha) {
  if (color.startsWith("rgba")) {
    return color;
  }

  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const bigint = parseInt(
      hex.length === 3
        ? hex
            .split("")
            .map((entry) => entry + entry)
            .join("")
        : hex,
      16
    );
    const red = (bigint >> 16) & 255;
    const green = (bigint >> 8) & 255;
    const blue = bigint & 255;
    return `rgba(${red},${green},${blue},${alpha})`;
  }

  return color;
}
