import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { connect } from 'react-redux';

import { NpGhostButton, SectionHeader } from '../components/primitives';
import { useUI } from '../context/UI';
import { usePalette } from '../theme/ThemeProvider';

function ProfilePage({ navigation, conditions, energyPattern, primaryUse }) {
    const palette = usePalette();
    const { confirm } = useUI();

    return (
        <ScrollView
            style={{ backgroundColor: palette.surface }}
            contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 24,
                paddingBottom: 160,
            }}
        >
            <Pressable
                onPress={() => navigation.navigate('Home')}
                style={{ marginBottom: 12 }}
            >
                <MaterialIcons
                    name="arrow-back"
                    size={22}
                    color={palette.accent}
                />
            </Pressable>

            <Text
                style={{
                    color: palette.onSurface,
                    fontFamily: 'SpaceGrotesk_700Bold',
                    fontSize: 34,
                    letterSpacing: -0.8,
                }}
            >
                Profile
            </Text>
            <View style={{ height: 20 }} />

            <ProfileCard
                title="Conditions"
                value={
                    conditions.length === 0
                        ? 'Not set'
                        : conditions.join(' · ').toUpperCase()
                }
            />
            <ProfileCard
                title="Energy pattern"
                value={energyPattern || 'Not set'}
            />
            <ProfileCard
                title="Primary use"
                value={primaryUse || 'Not set'}
            />

            <View style={{ height: 24 }} />
            <SectionHeader label="Privacy" />
            <View style={{ height: 10 }} />
            <View
                style={{
                    padding: 18,
                    borderRadius: 20,
                    backgroundColor: palette.surfaceContainer,
                }}
            >
                <Text
                    style={{
                        color: palette.onSurface,
                        fontFamily: 'SpaceGrotesk_600SemiBold',
                        fontSize: 16,
                    }}
                >
                    Your data never trains anyone else's model.
                </Text>
                <View style={{ height: 6 }} />
                <Text
                    style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: 'Inter_400Regular',
                        fontSize: 13,
                        lineHeight: 20,
                    }}
                >
                    Supabase row-level security + on-device cache. The AI
                    companion reads only the context bundle you approve.
                </Text>
                <View style={{ height: 12 }} />
                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 10,
                    }}
                >
                    <NpGhostButton
                        label="Export my data"
                        icon="download"
                        onPress={() => {}}
                    />
                    <NpGhostButton
                        label="Delete account"
                        icon="delete-outline"
                        onPress={async () => {
                            const ok = await confirm(
                                'This permanently deletes your account, anchors, and reading history. There is no undo.',
                                {
                                    title: 'Delete account?',
                                    confirmLabel: 'Delete',
                                },
                            );
                            if (ok) {
                                // wire to backend in Phase 2.1
                            }
                        }}
                    />
                </View>
            </View>
        </ScrollView>
    );
}

const ProfileCard = ({ title, value }) => {
    const palette = usePalette();
    return (
        <View
            style={{
                padding: 16,
                marginBottom: 10,
                borderRadius: 16,
                backgroundColor: palette.surfaceContainer,
                flexDirection: 'row',
                alignItems: 'center',
            }}
        >
            <View style={{ flex: 1 }}>
                <Text
                    style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: 'Inter_500Medium',
                        fontSize: 11,
                        letterSpacing: 2,
                    }}
                >
                    {title.toUpperCase()}
                </Text>
                <View style={{ height: 4 }} />
                <Text
                    style={{
                        color: palette.onSurface,
                        fontFamily: 'Inter_600SemiBold',
                        fontSize: 15,
                    }}
                >
                    {value}
                </Text>
            </View>
            <MaterialIcons name="edit" size={18} color={palette.outline} />
        </View>
    );
};

const mapStateToProps = (state) => ({
    conditions: state.configs.conditions,
    energyPattern: state.configs.energyPattern,
    primaryUse: state.configs.primaryUse,
});

export default connect(mapStateToProps)(ProfilePage);
