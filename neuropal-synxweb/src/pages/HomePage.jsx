import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { connect, useDispatch } from 'react-redux';

import {
    DataPulse,
    SectionHeader,
} from '../components/primitives';
import TweaksSheet from '../components/TweaksSheet';
import { useUI } from '../context/UI';
import { MockAnchors } from '../data/mock';
import {
    toggleMvdTask,
    updateNervousState,
} from '../store/slices/configSlice';
import { usePalette } from '../theme/ThemeProvider';
import { formatTime12, withAlpha } from '../utils/helpers';

// Home page — Stitch wireframe equivalent. Uses connect(mapStateToProps) at
// the bottom (Synxweb-style) plus `useDispatch` + `useUI` inside.
function HomePage({ navigation, mvdTasks, documents, nervousState, userName }) {
    const palette = usePalette();
    const dispatch = useDispatch();
    const { confirm } = useUI();
    const [tweaksOpen, setTweaksOpen] = useState(false);

    const remaining = mvdTasks.filter((t) => !t.done).length;
    const anchors = MockAnchors;
    const nextAnchor =
        anchors.find((a) => a.status === 'current') ||
        anchors.find((a) => a.status === 'pending') ||
        anchors[anchors.length - 1];
    const resume =
        documents.find((d) => d.progress > 0 && d.progress < 1) ||
        documents[0];

    const hour = new Date().getHours();
    const greeting =
        hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    const onPickRed = async () => {
        const ok = await confirm(
            'Open the TIPP protocol now? This pauses everything else.',
            { title: 'Switch to red', confirmLabel: 'Open TIPP' },
        );
        if (ok) {
            dispatch(updateNervousState('red'));
            navigation.navigate('Emergency');
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: palette.surface }}>
            <Topbar
                title="NeuroPal"
                onTweaks={() => setTweaksOpen(true)}
                onProfile={() => navigation.navigate('Profile')}
            />
            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingTop: 16,
                    paddingBottom: 160,
                }}
            >
                <Text
                    style={{
                        color: palette.onSurface,
                        fontFamily: 'SpaceGrotesk_700Bold',
                        fontSize: 34,
                        letterSpacing: -0.8,
                    }}
                >
                    {greeting}
                </Text>
                <Text
                    style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: 'Inter_400Regular',
                        fontSize: 16,
                        marginTop: 4,
                    }}
                >
                    One step at a time today.
                </Text>

                {nervousState === 'yellow' && (
                    <View
                        style={{
                            marginTop: 20,
                            padding: 16,
                            borderRadius: 18,
                            backgroundColor: withAlpha(palette.warn, 0.1),
                            borderWidth: 1,
                            borderColor: withAlpha(palette.warn, 0.35),
                            flexDirection: 'row',
                        }}
                    >
                        <MaterialIcons
                            name="lightbulb"
                            size={18}
                            color={palette.warn}
                            style={{ marginRight: 10, marginTop: 2 }}
                        />
                        <Text
                            style={{
                                flex: 1,
                                color: palette.onSurface,
                                fontFamily: 'Inter_400Regular',
                                fontSize: 13,
                                lineHeight: 19,
                            }}
                        >
                            Starting from yellow. Reader is set to cocoon
                            mode — change anything from Tweaks.
                        </Text>
                    </View>
                )}

                <View
                    style={{
                        marginTop: 26,
                        padding: 20,
                        borderRadius: 26,
                        backgroundColor: palette.surfaceLow,
                    }}
                >
                    <Text
                        style={{
                            color: palette.onSurfaceVariant,
                            fontFamily: 'SpaceGrotesk_600SemiBold',
                            fontSize: 16,
                        }}
                    >
                        How are you feeling right now?
                    </Text>
                    <View style={{ height: 14 }} />
                    <StateOption
                        selected={nervousState === 'green'}
                        icon="sentiment-satisfied"
                        label="I feel okay"
                        tint={palette.secondary}
                        onPress={() => dispatch(updateNervousState('green'))}
                    />
                    <View style={{ height: 10 }} />
                    <StateOption
                        selected={nervousState === 'yellow'}
                        icon="sentiment-neutral"
                        label="Feeling a bit off"
                        tint={palette.tertiary}
                        onPress={() => dispatch(updateNervousState('yellow'))}
                    />
                    <View style={{ height: 10 }} />
                    <StateOption
                        selected={nervousState === 'red'}
                        icon="sentiment-very-dissatisfied"
                        label="Help, I'm overwhelmed"
                        tint={palette.error}
                        onPress={onPickRed}
                    />
                </View>

                <View style={{ marginTop: 30 }}>
                    <SectionHeader
                        label="Minimum viable day"
                        trailing={`${remaining} remaining`}
                        live
                    />
                    <View style={{ height: 12 }} />
                    {mvdTasks.map((t) => (
                        <MvdRow
                            key={t.id}
                            task={t}
                            onToggle={() => dispatch(toggleMvdTask(t.id))}
                        />
                    ))}
                </View>

                <View style={{ marginTop: 24 }}>
                    <NextAnchor anchor={nextAnchor} />
                </View>
                {resume && (
                    <Pressable
                        style={{
                            marginTop: 16,
                            padding: 16,
                            borderRadius: 22,
                            backgroundColor: palette.surfaceContainer,
                        }}
                        onPress={() =>
                            navigation.navigate('Reader', { id: resume.id })
                        }
                    >
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                            }}
                        >
                            <View
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 12,
                                    backgroundColor: withAlpha(palette.accent, 0.12),
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <MaterialIcons
                                    name="chrome-reader-mode"
                                    size={22}
                                    color={palette.accent}
                                />
                            </View>
                            <View style={{ width: 12 }} />
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={{
                                        color: withAlpha(palette.accent, 0.7),
                                        fontFamily: 'Inter_500Medium',
                                        fontSize: 11,
                                        letterSpacing: 2,
                                    }}
                                >
                                    RESUME READING
                                </Text>
                                <Text
                                    numberOfLines={2}
                                    style={{
                                        color: palette.onSurface,
                                        fontFamily: 'SpaceGrotesk_600SemiBold',
                                        fontSize: 16,
                                        marginTop: 4,
                                    }}
                                >
                                    {resume.title}
                                </Text>
                            </View>
                        </View>
                        <View
                            style={{
                                height: 6,
                                marginTop: 12,
                                borderRadius: 3,
                                backgroundColor: palette.surfaceHigh,
                                overflow: 'hidden',
                            }}
                        >
                            <View
                                style={{
                                    width: `${Math.round((resume.progress || 0) * 100)}%`,
                                    height: '100%',
                                    backgroundColor: palette.accent,
                                }}
                            />
                        </View>
                    </Pressable>
                )}
            </ScrollView>

            <TweaksSheet
                visible={tweaksOpen}
                onClose={() => setTweaksOpen(false)}
            />
        </View>
    );
}

// ---- subcomponents ----

const Topbar = ({ title, onTweaks, onProfile }) => {
    const palette = usePalette();
    return (
        <View
            style={{
                paddingTop: 16,
                paddingBottom: 8,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
            }}
        >
            <DataPulse />
            <View style={{ width: 10 }} />
            <Text
                style={{
                    flex: 1,
                    color: palette.accent,
                    fontFamily: 'SpaceGrotesk_700Bold',
                    fontSize: 20,
                    letterSpacing: -0.5,
                }}
            >
                {title}
            </Text>
            <Pressable onPress={onTweaks} style={{ padding: 6 }}>
                <MaterialIcons
                    name="tune"
                    size={22}
                    color={palette.onSurfaceVariant}
                />
            </Pressable>
            <Pressable onPress={onProfile} style={{ padding: 6 }}>
                <MaterialIcons
                    name="person"
                    size={22}
                    color={palette.onSurfaceVariant}
                />
            </Pressable>
        </View>
    );
};

const StateOption = ({ selected, icon, label, tint, onPress }) => {
    const palette = usePalette();
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={{
                padding: 14,
                borderRadius: 18,
                backgroundColor: selected
                    ? withAlpha(tint, 0.08)
                    : palette.surfaceContainer,
                borderWidth: 1,
                borderColor: selected ? withAlpha(tint, 0.4) : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
            }}
        >
            <View
                style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: withAlpha(tint, 0.12),
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <MaterialIcons name={icon} size={24} color={tint} />
            </View>
            <View style={{ width: 12 }} />
            <Text
                style={{
                    flex: 1,
                    color: palette.onSurface,
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 15,
                }}
            >
                {label}
            </Text>
            <MaterialIcons
                name="chevron-right"
                size={18}
                color={palette.outlineVariant}
            />
        </Pressable>
    );
};

const MvdRow = ({ task, onToggle }) => {
    const palette = usePalette();
    return (
        <Pressable
            onPress={onToggle}
            style={{
                marginBottom: 10,
                padding: 14,
                borderRadius: 20,
                backgroundColor: palette.surfaceHigh,
                flexDirection: 'row',
                alignItems: 'center',
            }}
        >
            <View
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: task.done
                        ? palette.accent
                        : withAlpha(palette.accent, 0.35),
                    backgroundColor: task.done ? palette.accent : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {task.done && (
                    <MaterialIcons
                        name="check"
                        size={18}
                        color={palette.onPrimary}
                    />
                )}
            </View>
            <View style={{ width: 14 }} />
            <View style={{ flex: 1 }}>
                <Text
                    style={{
                        color: task.done
                            ? palette.onSurfaceVariant
                            : palette.onSurface,
                        fontFamily: 'Inter_600SemiBold',
                        fontSize: 15,
                        textDecorationLine: task.done ? 'line-through' : 'none',
                    }}
                >
                    {task.title}
                </Text>
                <Text
                    style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: 'Inter_400Regular',
                        fontSize: 12,
                    }}
                >
                    {task.subtitle}
                </Text>
            </View>
        </Pressable>
    );
};

const NextAnchor = ({ anchor }) => {
    const palette = usePalette();
    if (!anchor) return null;
    return (
        <View
            style={{
                padding: 20,
                borderRadius: 26,
                backgroundColor: withAlpha(palette.primaryContainer, 0.28),
                overflow: 'hidden',
            }}
        >
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                }}
            >
                <View style={{ flex: 1 }}>
                    <Text
                        style={{
                            color: withAlpha(palette.accent, 0.75),
                            fontFamily: 'Inter_500Medium',
                            fontSize: 11,
                            letterSpacing: 3,
                        }}
                    >
                        NEXT ANCHOR
                    </Text>
                    <Text
                        style={{
                            marginTop: 6,
                            color: palette.onSurface,
                            fontFamily: 'SpaceGrotesk_700Bold',
                            fontSize: 20,
                        }}
                    >
                        {anchor.title} — {formatTime12(anchor.time)}
                    </Text>
                </View>
                <View
                    style={{
                        width: 60,
                        height: 60,
                        borderRadius: 16,
                        backgroundColor: withAlpha(palette.accent, 0.18),
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <MaterialIcons
                        name="anchor"
                        size={32}
                        color={palette.accent}
                    />
                </View>
            </View>
        </View>
    );
};

const mapStateToProps = (state) => ({
    mvdTasks: state.configs.mvdTasks,
    documents: state.configs.documents,
    nervousState: state.configs.nervousState,
    userName: state.configs.userName,
});

export default connect(mapStateToProps)(HomePage);
