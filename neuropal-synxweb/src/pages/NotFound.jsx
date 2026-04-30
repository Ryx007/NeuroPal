import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { NpGhostButton } from '../components/primitives';
import { usePalette } from '../theme/ThemeProvider';

// Mirrors Synxweb's `src/pages/NotFound.jsx` — the catch-all 404.
export default function NotFound({ navigation }) {
    const palette = usePalette();
    return (
        <View
            style={[
                styles.center,
                { backgroundColor: palette.surface },
            ]}
        >
            <Text
                style={{
                    color: palette.onSurface,
                    fontFamily: 'SpaceGrotesk_700Bold',
                    fontSize: 36,
                    marginBottom: 6,
                }}
            >
                404
            </Text>
            <Text
                style={{
                    color: palette.onSurfaceVariant,
                    fontFamily: 'Inter_400Regular',
                    fontSize: 15,
                    marginBottom: 24,
                }}
            >
                That route doesn't exist.
            </Text>
            <NpGhostButton
                label="Back to Home"
                icon="home"
                onPress={() => navigation?.navigate('Home')}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
