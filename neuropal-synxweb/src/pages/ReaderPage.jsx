import { MaterialIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { connect, useDispatch } from 'react-redux';

import { GlassPanel } from '../components/primitives';
import {
    advanceReader,
    appendReaderChat,
    pauseReader,
    playReader,
    setReaderTotalWords,
    updateVoice,
    updateWpm,
} from '../store/slices/configSlice';
import { usePalette, useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../utils/helpers';

// Reader page — karaoke TTS with sim-timer fallback. Uses Redux for word
// index + playing flag (matches Synxweb's "everything in configSlice"
// philosophy) and pulls dispatch via hooks.

function ReaderPage({
    route,
    navigation,
    documents,
    readerChat,
    playing,
    wordIndex,
    totalWords,
    wpm,
    voice,
    layout,
}) {
    const palette = usePalette();
    const theme = useTheme();
    const dispatch = useDispatch();

    const docId = route?.params?.id;
    const doc =
        documents.find((d) => d.id === docId) ||
        documents[0];

    const [askingId, setAskingId] = useState(null);
    const simTimerRef = useRef(null);

    const { words, ranges } = useMemo(() => {
        const w = [];
        const r = [];
        for (const s of doc?.sections || []) {
            for (let i = 0; i < s.paragraphs.length; i++) {
                const start = w.length;
                w.push(...s.paragraphs[i].split(/\s+/));
                r.push({ pid: `${s.id}-${i}`, start, end: w.length });
            }
        }
        return { words: w, ranges: r };
    }, [doc]);

    useEffect(() => {
        dispatch(setReaderTotalWords(words.length));
        return () => {
            Speech.stop();
            if (simTimerRef.current) clearInterval(simTimerRef.current);
        };
    }, [dispatch, words.length]);

    const togglePlay = useCallback(async () => {
        if (playing) {
            Speech.stop();
            if (simTimerRef.current) clearInterval(simTimerRef.current);
            dispatch(pauseReader());
            return;
        }
        dispatch(playReader());
        const remaining = words.slice(wordIndex).join(' ');
        const pitch = voice === 'deep' ? 0.85 : voice === 'natural' ? 1.0 : 1.1;
        const rate = Math.min(1, Math.max(0.3, wpm / 400));
        Speech.speak(remaining, {
            pitch,
            rate,
            onDone: () => dispatch(pauseReader()),
            onStopped: () => dispatch(pauseReader()),
            onError: () => dispatch(pauseReader()),
        });
        if (simTimerRef.current) clearInterval(simTimerRef.current);
        simTimerRef.current = setInterval(() => {
            dispatch(advanceReader());
        }, 60000 / wpm);
    }, [dispatch, playing, wordIndex, wpm, voice, words]);

    const ask = useCallback(
        (paragraphId, question) => {
            dispatch(
                appendReaderChat({
                    id: `c-${Date.now()}`,
                    paragraphId,
                    question,
                    answer:
                        'Pending Claude API call. When the RAG pipeline is wired up this will return source-grounded answers (Plan §Sprint 1.3).',
                    citations: [],
                }),
            );
            setAskingId(paragraphId);
        },
        [dispatch],
    );

    const progress = totalWords === 0 ? 0 : wordIndex / totalWords;

    return (
        <View style={{ flex: 1, backgroundColor: palette.surface }}>
            <View
                style={{
                    height: 2,
                    backgroundColor: palette.surfaceLow,
                }}
            >
                <View
                    style={{
                        height: '100%',
                        width: `${Math.round(progress * 100)}%`,
                        backgroundColor: palette.secondary,
                    }}
                />
            </View>

            <View
                style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                }}
            >
                <Pressable
                    onPress={() => navigation.navigate('Library')}
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: palette.surfaceHigh,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <MaterialIcons
                        name="arrow-back"
                        size={18}
                        color={palette.accent}
                    />
                </Pressable>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                    <Text
                        style={{
                            color: palette.onSurfaceVariant,
                            fontFamily: 'Inter_500Medium',
                            fontSize: 10,
                            letterSpacing: 2,
                        }}
                    >
                        {doc?.type?.toUpperCase()} • {doc?.pageCount} PP
                    </Text>
                    <Text
                        numberOfLines={1}
                        style={{
                            color: palette.onSurface,
                            fontFamily: 'SpaceGrotesk_600SemiBold',
                            fontSize: 16,
                        }}
                    >
                        {doc?.title}
                    </Text>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingTop: 8,
                    paddingBottom: 220,
                }}
            >
                {(doc?.sections || []).map((section) => (
                    <View key={section.id}>
                        <Text
                            style={{
                                color: palette.onSurface,
                                fontFamily: 'SpaceGrotesk_700Bold',
                                fontSize: 22,
                                marginTop: 28,
                                marginBottom: 14,
                                letterSpacing: -0.4,
                            }}
                        >
                            {section.heading}
                        </Text>
                        {section.paragraphs.map((para, i) => {
                            const pid = `${section.id}-${i}`;
                            const range = ranges.find((r) => r.pid === pid) || {
                                start: 0,
                                end: 0,
                            };
                            const notes = readerChat.filter(
                                (m) => m.paragraphId === pid,
                            );
                            return (
                                <View key={pid}>
                                    <Pressable
                                        onLongPress={() =>
                                            ask(pid, `Explain: "${para.slice(0, 80)}..."`)
                                        }
                                        style={{
                                            paddingLeft: 14,
                                            marginVertical: 10,
                                            borderLeftWidth: 2,
                                            borderLeftColor:
                                                askingId === pid
                                                    ? withAlpha(palette.accent, 0.6)
                                                    : 'transparent',
                                        }}
                                    >
                                        <ParagraphText
                                            text={para}
                                            firstWordIndex={range.start}
                                            currentWordIndex={wordIndex}
                                            fontFamily={theme.readerFontFamily}
                                            fontSize={theme.readerFontSize}
                                            lineHeight={
                                                theme.readerFontSize * theme.readerLineHeight
                                            }
                                            letterSpacing={
                                                theme.readerExtraLetterSpacing ? 0.6 : 0
                                            }
                                        />
                                    </Pressable>
                                    {layout === 'split' &&
                                        notes.map((n) => (
                                            <MarginNote key={n.id} note={n} />
                                        ))}
                                </View>
                            );
                        })}
                    </View>
                ))}
            </ScrollView>

            <PlaybackBar
                playing={playing}
                wpm={wpm}
                voice={voice}
                onPlay={togglePlay}
                onWpm={(v) => dispatch(updateWpm(v))}
                onVoice={(v) => dispatch(updateVoice(v))}
                onAsk={() => {
                    const pid = ranges[0]?.pid || 'doc';
                    ask(
                        pid,
                        'Summarise the current paragraph in plain language.',
                    );
                }}
            />
        </View>
    );
}

const ParagraphText = ({
    text,
    firstWordIndex,
    currentWordIndex,
    fontFamily,
    fontSize,
    lineHeight,
    letterSpacing,
}) => {
    const palette = usePalette();
    const words = text.split(/\s+/);
    return (
        <Text
            selectable
            style={{
                fontFamily,
                fontSize,
                lineHeight,
                letterSpacing,
                color: palette.onSurface,
            }}
        >
            {words.map((w, i) => {
                const global = firstWordIndex + i;
                const readAlready = global < currentWordIndex;
                const isCurrent = global === currentWordIndex;
                return (
                    <Text
                        key={`${w}-${i}`}
                        style={{
                            color: readAlready
                                ? withAlpha(palette.onSurfaceVariant, 0.55)
                                : palette.onSurface,
                            backgroundColor: isCurrent
                                ? withAlpha(palette.accent, 0.2)
                                : 'transparent',
                            textDecorationLine: isCurrent ? 'underline' : 'none',
                            textDecorationColor: palette.accent,
                        }}
                    >
                        {w}
                        {i === words.length - 1 ? '' : ' '}
                    </Text>
                );
            })}
        </Text>
    );
};

const MarginNote = ({ note }) => {
    const palette = usePalette();
    return (
        <View
            style={{
                padding: 14,
                borderRadius: 14,
                marginVertical: 6,
                backgroundColor: withAlpha(palette.accent, 0.06),
                borderLeftWidth: 2,
                borderLeftColor: palette.accent,
            }}
        >
            <Text
                style={{
                    color: palette.accent,
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 10,
                    letterSpacing: 2,
                }}
            >
                ASKED
            </Text>
            <View style={{ height: 6 }} />
            <Text
                style={{
                    color: palette.onSurface,
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 14,
                }}
            >
                {note.question}
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
                {note.answer}
            </Text>
        </View>
    );
};

const PlaybackBar = ({ playing, wpm, voice, onPlay, onWpm, onVoice, onAsk }) => {
    const palette = usePalette();
    return (
        <View
            style={{
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: 90,
            }}
        >
            <GlassPanel
                radius={28}
                style={{
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                }}
            >
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}
                >
                    <Pressable
                        onPress={onPlay}
                        style={{
                            width: 52,
                            height: 52,
                            borderRadius: 26,
                            marginHorizontal: 4,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: palette.primary,
                        }}
                    >
                        <MaterialIcons
                            name={playing ? 'pause' : 'play-arrow'}
                            size={30}
                            color={palette.onPrimary}
                        />
                    </Pressable>
                    <View style={{ width: 8, flex: 1 }}>
                        <Text
                            style={{
                                color: palette.onSurfaceVariant,
                                fontFamily: 'Inter_500Medium',
                                fontSize: 10,
                                letterSpacing: 2,
                            }}
                        >
                            SPEED · {wpm} WPM
                        </Text>
                        <Slider
                            value={wpm}
                            minimumValue={120}
                            maximumValue={400}
                            step={10}
                            onValueChange={(v) => onWpm(Math.round(v))}
                            minimumTrackTintColor={palette.accent}
                            maximumTrackTintColor={withAlpha(
                                palette.outlineVariant,
                                0.3,
                            )}
                            thumbTintColor={palette.accent}
                        />
                    </View>
                    <View
                        style={{
                            flexDirection: 'row',
                            backgroundColor: palette.surfaceLowest,
                            borderRadius: 12,
                            padding: 3,
                            marginRight: 6,
                        }}
                    >
                        {['soft', 'natural', 'deep'].map((v) => {
                            const selected = v === voice;
                            return (
                                <Pressable
                                    key={v}
                                    onPress={() => onVoice(v)}
                                    style={{
                                        paddingHorizontal: 10,
                                        paddingVertical: 6,
                                        borderRadius: 10,
                                        backgroundColor: selected
                                            ? withAlpha(palette.accent, 0.14)
                                            : 'transparent',
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: selected
                                                ? palette.accent
                                                : palette.onSurfaceVariant,
                                            fontSize: 11,
                                            fontFamily: 'Inter_500Medium',
                                        }}
                                    >
                                        {v[0].toUpperCase() + v.slice(1)}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                    <Pressable
                        onPress={onAsk}
                        style={{
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderRadius: 14,
                            backgroundColor: withAlpha(palette.secondary, 0.1),
                            borderWidth: 1,
                            borderColor: withAlpha(palette.secondary, 0.3),
                        }}
                    >
                        <Text
                            style={{
                                color: palette.secondary,
                                fontFamily: 'SpaceGrotesk_600SemiBold',
                                fontSize: 13,
                            }}
                        >
                            Ask
                        </Text>
                    </Pressable>
                </View>
            </GlassPanel>
        </View>
    );
};

const mapStateToProps = (state) => ({
    documents: state.configs.documents,
    readerChat: state.configs.readerChat,
    playing: state.configs.readerPlaying,
    wordIndex: state.configs.readerWordIndex,
    totalWords: state.configs.readerTotalWords,
    wpm: state.configs.wpm,
    voice: state.configs.voice,
    layout: state.configs.readerLayout,
});

export default connect(mapStateToProps)(ReaderPage);
