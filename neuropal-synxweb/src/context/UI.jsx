import React, { createContext, useCallback, useContext, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

// Mirrors Synxweb's `src/context/UI.jsx` — a context exposing imperative
// `confirm()` and `loading()` helpers backed by a single global Modal.
//
// Synxweb's version uses an MUI <Dialog> with glassmorphism. RN doesn't
// have MUI, so this is the equivalent built on RN's own <Modal> + an
// Animated.View backdrop. The API surface is identical:
//
//     const { confirm, loading } = useUI();
//     if (await confirm('Delete this anchor?')) { ... }

const UIContext = createContext({
    confirm: async () => false,
    loading: () => () => {},
});

export const UIProvider = ({ children }) => {
    const [confirmState, setConfirmState] = useState(null);
    const [loadingCount, setLoadingCount] = useState(0);

    const confirm = useCallback((message, opts = {}) => {
        return new Promise((resolve) => {
            setConfirmState({
                message,
                title: opts.title || 'Are you sure?',
                confirmLabel: opts.confirmLabel || 'Confirm',
                cancelLabel: opts.cancelLabel || 'Cancel',
                resolve,
            });
        });
    }, []);

    const loading = useCallback(() => {
        setLoadingCount((c) => c + 1);
        return () => setLoadingCount((c) => Math.max(0, c - 1));
    }, []);

    const handleConfirm = useCallback(() => {
        if (confirmState) confirmState.resolve(true);
        setConfirmState(null);
    }, [confirmState]);

    const handleCancel = useCallback(() => {
        if (confirmState) confirmState.resolve(false);
        setConfirmState(null);
    }, [confirmState]);

    return (
        <UIContext.Provider value={{ confirm, loading }}>
            {children}

            <Modal
                visible={!!confirmState}
                transparent
                animationType="fade"
                onRequestClose={handleCancel}
            >
                <Pressable style={styles.backdrop} onPress={handleCancel}>
                    <Pressable style={styles.dialog} onPress={() => {}}>
                        <Text style={styles.title}>
                            {confirmState?.title}
                        </Text>
                        <Text style={styles.message}>
                            {confirmState?.message}
                        </Text>
                        <View style={styles.actions}>
                            <Pressable
                                style={[styles.btn, styles.btnCancel]}
                                onPress={handleCancel}
                            >
                                <Text style={styles.btnCancelText}>
                                    {confirmState?.cancelLabel}
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[styles.btn, styles.btnConfirm]}
                                onPress={handleConfirm}
                            >
                                <Text style={styles.btnConfirmText}>
                                    {confirmState?.confirmLabel}
                                </Text>
                            </Pressable>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal visible={loadingCount > 0} transparent animationType="fade">
                <View style={[styles.backdrop, { justifyContent: 'center' }]}>
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color="#B1C5FF" />
                        <Text style={styles.loadingText}>Loading…</Text>
                    </View>
                </View>
            </Modal>
        </UIContext.Provider>
    );
};

export const useUI = () => useContext(UIContext);

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    dialog: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: '#1F2020',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        padding: 22,
    },
    title: {
        color: '#E4E2E1',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 12,
    },
    message: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 22,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
    },
    btn: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 12,
    },
    btnCancel: {
        borderWidth: 1,
        borderColor: 'rgba(102,126,234,0.5)',
    },
    btnCancelText: {
        color: '#667eea',
        fontWeight: '600',
    },
    btnConfirm: {
        backgroundColor: '#B1C5FF',
    },
    btnConfirmText: {
        color: '#002C71',
        fontWeight: '700',
    },
    loadingBox: {
        backgroundColor: '#1F2020',
        padding: 28,
        borderRadius: 16,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        color: '#E4E2E1',
    },
});
