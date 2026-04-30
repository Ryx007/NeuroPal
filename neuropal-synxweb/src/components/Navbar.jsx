import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';

import { GlassPanel } from './primitives';
import { usePalette } from '../theme/ThemeProvider';
import { withAlpha } from '../utils/helpers';

// RN equivalent of Synxweb's left-rail Navbar — rendered as a glass tab bar
// pinned to the bottom of the screen. Same component name, same role: a
// chrome element above the page content that handles primary navigation.

const TABS = [
    { route: 'Home', icon: 'home', label: 'Home' },
    { route: 'Library', icon: 'menu-book', label: 'Library' },
    { route: 'Reader', icon: 'chrome-reader-mode', label: 'Reader' },
    { route: 'Anchors', icon: 'anchor', label: 'Anchors' },
    { route: 'Profile', icon: 'person', label: 'Profile' },
];

export default function Navbar() {
    const palette = usePalette();
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const route = useRoute();
    const currentRoute = route.name;

    return (
        <View
            style={[
                styles.wrap,
                {
                    paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
                },
            ]}
        >
            <GlassPanel radius={28} style={styles.bar}>
                {TABS.map((tab) => {
                    const active = tab.route === currentRoute;
                    return (
                        <Pressable
                            key={tab.route}
                            onPress={() => navigation.navigate(tab.route)}
                            style={[
                                styles.tab,
                                active && {
                                    backgroundColor: withAlpha(
                                        palette.accent,
                                        0.12,
                                    ),
                                },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={tab.label}
                        >
                            <MaterialIcons
                                name={tab.icon}
                                size={22}
                                color={
                                    active
                                        ? palette.accent
                                        : withAlpha(palette.onSurfaceVariant, 0.7)
                                }
                            />
                            <Text
                                style={{
                                    fontSize: 11,
                                    fontWeight: '500',
                                    marginTop: 2,
                                    color: active
                                        ? palette.accent
                                        : withAlpha(palette.onSurfaceVariant, 0.7),
                                }}
                            >
                                {tab.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </GlassPanel>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 0,
    },
    bar: {
        flexDirection: 'row',
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 18,
        alignItems: 'center',
    },
});
