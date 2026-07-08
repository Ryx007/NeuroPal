import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { usePalette, useTheme } from "../theme/ThemeProvider";

export function GlassPanel({
  children,
  style,
  radius = 24,
  intensity = 40,
  tint,
  tintColor,
}) {
  const palette = usePalette();
  const { isLight } = useTheme();
  const resolvedTint = tint || (isLight ? "light" : "dark");

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
            backgroundColor: withAlpha(
              tintColor || palette.surfaceContainer,
              0.82
            ),
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

export function DataPulse({ size = 7 }) {
  const palette = usePalette();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [progress]);

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
          backgroundColor: palette.accent,
          shadowColor: palette.accent,
          shadowOpacity: 0.5,
          shadowRadius: 8,
        },
        animated,
      ]}
    />
  );
}

export function NpPrimaryButton({ label, icon, onPress, expanded }) {
  const palette = usePalette();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        transform: [{ translateY: pressed ? 0 : -1 }],
        opacity: pressed ? 0.9 : 1,
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
            fontFamily: "SpaceGrotesk_600SemiBold",
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

export function NpGhostButton({ label, icon, onPress }) {
  const palette = usePalette();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: withAlpha(palette.outlineVariant, 0.25),
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: pressed
          ? withAlpha(palette.accent, 0.08)
          : "transparent",
      })}
    >
      {icon ? (
        <MaterialIcons
          name={icon}
          size={16}
          color={palette.accent}
          style={{ marginRight: 8 }}
        />
      ) : null}
      <Text
        style={{
          color: palette.accent,
          fontFamily: "SpaceGrotesk_600SemiBold",
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionHeader({ label, trailing, live = false }) {
  const palette = usePalette();

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
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "SpaceGrotesk_600SemiBold",
          fontSize: 16,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
      <View style={{ flex: 1 }} />
      {trailing ? (
        <Text
          style={{
            color: withAlpha(palette.accent, 0.7),
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            letterSpacing: 2,
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
