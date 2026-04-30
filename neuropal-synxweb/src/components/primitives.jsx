import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { useTheme, usePalette } from '../theme/ThemeProvider';
import { withAlpha } from '../utils/helpers';

// Glass panel — frosted background panel for the bottom nav, playback bar,
// any floating chrome.
export const GlassPanel = ({
    children,
    style,
    radius = 24,
    intensity = 40,
    tint,
    tintColor,
}) => {
    const palette = usePalette();
    const { isLight } = useTheme();
    const resolvedTint = tint || (isLight ? 'light' : 'dark');
    return (
        <View
            style={[
                {
                    borderRadius: radius,
                    overflow: 'hidden',
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: withAlpha(palette.outlineVariant, 0.15),
                    backgroundColor: withAlpha(
                        tintColor || palette.surfaceContainer,
                        0.65,
                    ),
                },
                style,
            ]}
        >
            <BlurView
                intensity={intensity}
                tint={resolvedTint}
                style={StyleSheet.absoluteFill}
            />
            {children}
        </View>
    );
};

// Animated dot used to flag a "live" surface (state check-in, MVD).
export const DataPulse = ({ size = 7 }) => {
    const palette = usePalette();
    const opacity = useRef(new Animated.Value(0.4)).current;
    const scale = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(opacity, {
                        toValue: 1,
                        duration: 900,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale, {
                        toValue: 1.3,
                        duration: 900,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ]),
                Animated.parallel([
                    Animated.timing(opacity, {
                        toValue: 0.4,
                        duration: 900,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(scale, {
                        toValue: 1,
                        duration: 900,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ]),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [opacity, scale]);
    return (
        <Animated.View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: palette.accent,
                opacity,
                transform: [{ scale }],
            }}
        />
    );
};

// Primary CTA — gradient, mirrors the web prototype's btn-primary.
export const NpPrimaryButton = ({ label, icon, onPress, expanded }) => {
    const palette = usePalette();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
        >
            <LinearGradient
                colors={[palette.primary, palette.primaryContainer]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                    paddingHorizontal: 22,
                    paddingVertical: 14,
                    borderRadius: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    alignSelf: expanded ? 'stretch' : 'flex-start',
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
                        fontFamily: 'SpaceGrotesk_600SemiBold',
                        fontSize: 14,
                        fontWeight: '600',
                    }}
                >
                    {label}
                </Text>
            </LinearGradient>
        </Pressable>
    );
};

export const NpGhostButton = ({ label, icon, onPress }) => {
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
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                backgroundColor: pressed
                    ? withAlpha(palette.accent, 0.08)
                    : 'transparent',
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
                    fontFamily: 'SpaceGrotesk_600SemiBold',
                    fontSize: 13,
                    fontWeight: '600',
                }}
            >
                {label}
            </Text>
        </Pressable>
    );
};

export const SectionHeader = ({ label, trailing, live }) => {
    const palette = usePalette();
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
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
                    fontFamily: 'SpaceGrotesk_600SemiBold',
                    fontSize: 16,
                    fontWeight: '500',
                }}
            >
                {label}
            </Text>
            <View style={{ flex: 1 }} />
            {trailing ? (
                <Text
                    style={{
                        color: withAlpha(palette.accent, 0.7),
                        fontFamily: 'Inter_500Medium',
                        fontSize: 11,
                        letterSpacing: 2,
                    }}
                >
                    {trailing.toUpperCase()}
                </Text>
            ) : null}
        </View>
    );
};
