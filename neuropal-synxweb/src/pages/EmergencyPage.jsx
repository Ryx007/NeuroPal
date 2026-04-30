import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NpGhostButton, NpPrimaryButton } from '../components/primitives';
import { usePalette } from '../theme/ThemeProvider';
import { withAlpha } from '../utils/helpers';

const STEPS = [
    {
        letter: 'T',
        title: 'Temperature',
        body: 'Hold your breath, dunk your face in cold water — or press a cold pack over your eyes and upper cheeks. 30 seconds. Keep breathing slowly after.',
        seconds: 30,
    },
    {
        letter: 'I',
        title: 'Intense exercise',
        body: 'Move hard for 60 seconds. Jumping jacks, sprint in place, push-ups on the wall. You are trying to burn the chemical surge, not get fit.',
        seconds: 60,
    },
    {
        letter: 'P',
        title: 'Paced breathing',
        body: 'In for 4, out for 8. Five rounds. The exhale is the medicine — long out-breaths trip your parasympathetic system.',
        seconds: 60,
    },
    {
        letter: 'P',
        title: 'Paired muscle relaxation',
        body: 'Tense every muscle group for 5 seconds, then release for 10. Shoulders, jaw, hands, quads, feet. Notice the contrast.',
        seconds: 60,
    },
];

export default function EmergencyPage({ navigation }) {
    const palette = usePalette();
    const [step, setStep] = useState(0);
    const current = STEPS[step];

    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: palette.surface }}
        >
            <View style={{ flex: 1, padding: 24 }}>
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}
                >
                    <Pressable onPress={() => navigation.navigate('Home')}>
                        <MaterialIcons
                            name="close"
                            size={26}
                            color={palette.onSurface}
                        />
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <Text
                        style={{
                            color: palette.error,
                            fontFamily: 'Inter_600SemiBold',
                            fontSize: 11,
                            letterSpacing: 3,
                        }}
                    >
                        TIPP PROTOCOL
                    </Text>
                </View>

                <View style={{ height: 28 }} />
                <Text
                    style={{
                        color: palette.onSurface,
                        fontFamily: 'SpaceGrotesk_700Bold',
                        fontSize: 40,
                        letterSpacing: -1.2,
                    }}
                >
                    You are safe.
                </Text>
                <View style={{ height: 6 }} />
                <Text
                    style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: 'Inter_400Regular',
                        fontSize: 15,
                        lineHeight: 22,
                    }}
                >
                    This is the body's alarm system — not a decision to make.
                    Follow the steps, one at a time.
                </Text>

                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <View
                        style={{
                            padding: 28,
                            borderRadius: 28,
                            backgroundColor: palette.surfaceContainer,
                            borderWidth: 1,
                            borderColor: withAlpha(palette.error, 0.25),
                        }}
                    >
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                            }}
                        >
                            <View
                                style={{
                                    width: 72,
                                    height: 72,
                                    borderRadius: 20,
                                    backgroundColor: withAlpha(palette.error, 0.12),
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Text
                                    style={{
                                        color: palette.error,
                                        fontFamily: 'SpaceGrotesk_700Bold',
                                        fontSize: 42,
                                    }}
                                >
                                    {current.letter}
                                </Text>
                            </View>
                            <View style={{ width: 16 }} />
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={{
                                        color: palette.onSurface,
                                        fontFamily: 'SpaceGrotesk_700Bold',
                                        fontSize: 22,
                                    }}
                                >
                                    {current.title}
                                </Text>
                                <Text
                                    style={{
                                        color: palette.onSurfaceVariant,
                                        fontFamily: 'JetBrainsMono_400Regular',
                                        fontSize: 12,
                                    }}
                                >
                                    ~{current.seconds}s
                                </Text>
                            </View>
                        </View>
                        <View style={{ height: 20 }} />
                        <Text
                            style={{
                                color: palette.onSurface,
                                fontFamily: 'Inter_400Regular',
                                fontSize: 16,
                                lineHeight: 24,
                            }}
                        >
                            {current.body}
                        </Text>
                    </View>
                </View>

                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}
                >
                    {step > 0 && (
                        <NpGhostButton
                            label="Previous"
                            icon="arrow-back"
                            onPress={() => setStep(step - 1)}
                        />
                    )}
                    <View style={{ flex: 1 }} />
                    {step < STEPS.length - 1 ? (
                        <NpPrimaryButton
                            label="Next step"
                            icon="arrow-forward"
                            onPress={() => setStep(step + 1)}
                        />
                    ) : (
                        <NpPrimaryButton
                            label="I'm steadier"
                            icon="check"
                            onPress={() => navigation.navigate('Home')}
                        />
                    )}
                </View>
                <View style={{ height: 14 }} />
                <View style={{ flexDirection: 'row', gap: 6 }}>
                    {STEPS.map((_, i) => (
                        <View
                            key={i}
                            style={{
                                flex: 1,
                                height: 3,
                                borderRadius: 2,
                                backgroundColor:
                                    i <= step
                                        ? palette.error
                                        : withAlpha(palette.outlineVariant, 0.3),
                            }}
                        />
                    ))}
                </View>
            </View>
        </SafeAreaView>
    );
}
