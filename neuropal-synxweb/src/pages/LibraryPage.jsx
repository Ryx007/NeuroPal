import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import {
    Dimensions,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { connect, useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';

import { addDocument } from '../store/slices/configSlice';
import { usePalette } from '../theme/ThemeProvider';
import { typeFromExt, withAlpha } from '../utils/helpers';

function LibraryPage({ navigation, documents }) {
    const palette = usePalette();
    const dispatch = useDispatch();
    const [activeFilter, setActiveFilter] = useState(0);

    const width = Dimensions.get('window').width;
    const cols = width > 900 ? 3 : width > 600 ? 2 : 1;

    const pickDoc = async () => {
        const res = await DocumentPicker.getDocumentAsync({
            type: [
                'application/pdf',
                'application/epub+zip',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain',
            ],
            copyToCacheDirectory: true,
            multiple: false,
        });
        if (res.canceled) return;
        const asset = res.assets[0];
        dispatch(
            addDocument({
                id: `doc-${Date.now()}`,
                title: asset.name,
                subtitle: 'Just added',
                type: typeFromExt(asset.name),
                progress: 0,
                pageCount: 0,
            }),
        );
        Toast.show({
            type: 'success',
            text1: 'Document added',
            text2: asset.name,
        });
    };

    return (
        <View style={{ flex: 1, backgroundColor: palette.surface }}>
            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: 20,
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
                    Document Library
                </Text>
                <Text
                    style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: 'Inter_400Regular',
                        fontSize: 16,
                        marginTop: 4,
                    }}
                >
                    Continue your cognitive journey where you left off.
                </Text>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginTop: 20 }}
                    contentContainerStyle={{ gap: 8 }}
                >
                    {['All', 'In progress', 'Unread', 'PDF', 'EPUB', 'arXiv'].map((f, i) => {
                        const selected = i === activeFilter;
                        return (
                            <Pressable
                                key={f}
                                onPress={() => setActiveFilter(i)}
                                style={{
                                    paddingHorizontal: 14,
                                    paddingVertical: 10,
                                    borderRadius: 99,
                                    backgroundColor: selected
                                        ? withAlpha(palette.accent, 0.14)
                                        : palette.surfaceContainer,
                                    borderWidth: 1,
                                    borderColor: selected
                                        ? withAlpha(palette.accent, 0.45)
                                        : 'transparent',
                                }}
                            >
                                <Text
                                    style={{
                                        color: selected
                                            ? palette.accent
                                            : palette.onSurfaceVariant,
                                        fontFamily: 'Inter_500Medium',
                                        fontSize: 13,
                                    }}
                                >
                                    {f}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                <View
                    style={{
                        marginTop: 22,
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 16,
                    }}
                >
                    {documents.map((d) => (
                        <View
                            key={d.id}
                            style={{
                                width:
                                    cols === 1
                                        ? '100%'
                                        : (width - 40 - 16 * (cols - 1)) / cols,
                            }}
                        >
                            <DocCard
                                doc={d}
                                onPress={() =>
                                    navigation.navigate('Reader', { id: d.id })
                                }
                            />
                        </View>
                    ))}
                    <View
                        style={{
                            width:
                                cols === 1
                                    ? '100%'
                                    : (width - 40 - 16 * (cols - 1)) / cols,
                        }}
                    >
                        <UploadCard onPress={pickDoc} />
                    </View>
                </View>
            </ScrollView>

            <Pressable
                onPress={pickDoc}
                style={[styles.fab, { backgroundColor: palette.primary }]}
            >
                <MaterialIcons
                    name="add"
                    size={30}
                    color={palette.onPrimary}
                />
            </Pressable>
        </View>
    );
}

const DocCard = ({ doc, onPress }) => {
    const palette = usePalette();
    const tint =
        doc.type === 'pdf'
            ? palette.primary
            : doc.type === 'epub'
                ? palette.secondary
                : doc.type === 'docx'
                    ? palette.tertiary
                    : palette.onSurfaceVariant;
    const icon =
        doc.type === 'pdf'
            ? 'picture-as-pdf'
            : doc.type === 'epub'
                ? 'menu-book'
                : doc.type === 'docx'
                    ? 'description'
                    : 'science';
    return (
        <Pressable
            onPress={onPress}
            style={{
                padding: 16,
                borderRadius: 22,
                backgroundColor: palette.surfaceContainer,
                minHeight: 200,
            }}
        >
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                }}
            >
                <View
                    style={{
                        padding: 10,
                        borderRadius: 12,
                        backgroundColor: withAlpha(tint, 0.12),
                    }}
                >
                    <MaterialIcons name={icon} size={22} color={tint} />
                </View>
                <View style={{ flex: 1 }} />
                <View
                    style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: palette.surfaceHighest,
                    }}
                >
                    <Text
                        style={{
                            color: palette.onSurfaceVariant,
                            fontFamily: 'Inter_500Medium',
                            fontSize: 10,
                            letterSpacing: 1.4,
                        }}
                    >
                        {doc.type.toUpperCase()}
                    </Text>
                </View>
            </View>
            <View style={{ height: 14 }} />
            <Text
                numberOfLines={2}
                style={{
                    color: palette.onSurface,
                    fontFamily: 'SpaceGrotesk_600SemiBold',
                    fontSize: 16,
                }}
            >
                {doc.title}
            </Text>
            <Text
                numberOfLines={1}
                style={{
                    color: palette.onSurfaceVariant,
                    fontFamily: 'Inter_400Regular',
                    fontSize: 12,
                    marginTop: 4,
                }}
            >
                {doc.subtitle}
            </Text>
            <View style={{ flex: 1, minHeight: 8 }} />
            <View
                style={{
                    flexDirection: 'row',
                    marginTop: 12,
                }}
            >
                <Text
                    style={{
                        flex: 1,
                        color: palette.onSurfaceVariant,
                        fontFamily: 'Inter_500Medium',
                        fontSize: 11,
                    }}
                >
                    {Math.round((doc.progress || 0) * 100)}% complete
                </Text>
                <Text
                    style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: 'JetBrainsMono_400Regular',
                        fontSize: 11,
                    }}
                >
                    {doc.pageCount > 0 ? `${doc.pageCount} pp` : '—'}
                </Text>
            </View>
            <View
                style={{
                    height: 4,
                    marginTop: 8,
                    borderRadius: 2,
                    backgroundColor: palette.surfaceHigh,
                    overflow: 'hidden',
                }}
            >
                <View
                    style={{
                        width: `${Math.round((doc.progress || 0) * 100)}%`,
                        height: '100%',
                        backgroundColor: tint,
                    }}
                />
            </View>
        </Pressable>
    );
};

const UploadCard = ({ onPress }) => {
    const palette = usePalette();
    return (
        <Pressable
            onPress={onPress}
            style={{
                minHeight: 200,
                borderRadius: 22,
                borderWidth: 1.4,
                borderStyle: 'dashed',
                borderColor: withAlpha(palette.outlineVariant, 0.35),
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
            }}
        >
            <View
                style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: palette.surfaceHigh,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <MaterialIcons
                    name="add"
                    size={28}
                    color={palette.onSurfaceVariant}
                />
            </View>
            <View style={{ height: 12 }} />
            <Text
                style={{
                    color: palette.onSurface,
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 14,
                }}
            >
                Add new resource
            </Text>
            <Text
                style={{
                    color: palette.onSurfaceVariant,
                    fontFamily: 'Inter_400Regular',
                    fontSize: 12,
                    textAlign: 'center',
                    marginTop: 6,
                    maxWidth: 200,
                }}
            >
                PDF · EPUB · DOCX · arXiv link
            </Text>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 110,
        width: 60,
        height: 60,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const mapStateToProps = (state) => ({
    documents: state.configs.documents,
});

export default connect(mapStateToProps)(LibraryPage);
