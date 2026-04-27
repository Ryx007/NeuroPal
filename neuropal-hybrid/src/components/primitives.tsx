import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import {
  Pressable,
  StyleProp,
  Text,
  View,
  ViewStyle,
  StyleSheet,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";

import { usePalette, useTheme } from "@/theme/ThemeProvider";

// ---- GlassPanel -----------------------------------------------------------

interface GlassPanelProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  tint?: "dark" | "light";
  /** Fallback tint color used behind the blur (70% opacity) */
  tintColor?: string;
}

export function GlassPanel({
  children,
  style,
  radius = 24,
  intensity = 40,
  tint,
  tintColor,
}: GlassPanelProps) {
  const palette = usePalette();
  const { isLight } = useTheme();
  const resolvedTint = tint ?? (isLight ? "light" : "dark");
  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: "hidden",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: withAlpha(palette.outlineVariant, 0.15),
          backgroundColor: withAlpha(
            tintColor ?? palette.surfaceContainer,
            0.65
          ),
        },
        style,
      ]}
    >
      <BlurView intensity={intensity} tint={resolvedTint} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

// ---- DataPulse ------------------------------------------------------------

export function DataPulse({ size = 7 }: { size?: number }) {
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
    const t = progress.value;
    return {
      transform: [{ scale: 1 + 0.3 * t }],
      opacity: 0.4 + 0.6 * t,
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

// ---- NpPrimaryButton ------------------------------------------------------

interface NpPrimaryButtonProps {
  label: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  onPress?: () => void;
  expanded?: boolean;
}

export function NpPrimaryButton({
  label,
  icon,
  onPress,
  expanded,
}: NpPrimaryButtonProps) {
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

// ---- NpGhostButton --------------------------------------------------------

interface NpGhostButtonProps {
  label: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  onPress?: () => void;
}

export function NpGhostButton({ label, icon, onPress }: NpGhostButtonProps) {
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

// ---- SectionHeader --------------------------------------------------------

export function SectionHeader({
  label,
  trailing,
  live = false,
}: {
  label: string;
  trailing?: string;
  live?: boolean;
}) {
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

// ---- Striped placeholder --------------------------------------------------

export function PhImage({
  label = "image",
  aspectRatio = 16 / 9,
}: {
  label?: string;
  aspectRatio?: number;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        aspectRatio,
        backgroundColor: palette.surfaceHigh,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "JetBrainsMono_400Regular",
          fontSize: 11,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ---- helpers --------------------------------------------------------------

export function withAlpha(hexOrRgba: string, alpha: number): string {
  if (hexOrRgba.startsWith("rgba")) return hexOrRgba;
  if (hexOrRgba.startsWith("#")) {
    const h = hexOrRgba.replace("#", "");
    const bigint = parseInt(
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h,
      16
    );
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hexOrRgba;
}
