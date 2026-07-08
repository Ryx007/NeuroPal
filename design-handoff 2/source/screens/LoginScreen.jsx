import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';

import { DataPulse, NpPrimaryButton, withAlpha } from '../components/primitives';
import { saveSessionToken } from '../store/ApiLink';
import { useApiRequest } from '../store/ApiRequest';
import {
    hydrateUser,
    updateLogin,
} from '../store/slices/authSlice';
import { usePalette } from '../theme/ThemeProvider';

// Email + password auth, toggle between login and signup. On success:
// saves the JWT to AsyncStorage, dispatches user fields into Redux, and
// flips loggedIn=true. The navigator's auth gate routes onward to the
// onboarding flow (or Home if onboarding is already complete).

export function LoginScreen() {
    const palette = usePalette();
    const dispatch = useDispatch();
    const { postData } = useApiRequest();

    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!email || !password) {
            Toast.show({ type: 'error', text1: 'Email and password required' });
            return;
        }
        if (mode === 'signup' && password.length < 8) {
            Toast.show({ type: 'error', text1: 'Password must be ≥ 8 characters' });
            return;
        }
        setBusy(true);
        const endpoint = mode === 'signup' ? 'auth/register' : 'auth/login';
        const body =
            mode === 'signup'
                ? { email: email.trim(), password, name: name.trim() || undefined }
                : { email: email.trim(), password };
        const resp = await postData(endpoint, body);
        setBusy(false);
        if (!resp) return; // useApiRequest already toasted

        const token = resp.token || resp.accessToken;
        if (!token) {
            Toast.show({ type: 'error', text1: 'Server returned no token' });
            return;
        }
        await saveSessionToken(token);

        // Hydrate Redux from the returned user object. Falls back to safe
        // defaults if the backend trims fields.
        const u = resp.user || {};
        dispatch(hydrateUser(u));
        dispatch(updateLogin(true));

        Toast.show({
            type: 'success',
            text1: mode === 'signup' ? 'Account created' : 'Welcome back',
        });
    };

    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: palette.surface }}
            edges={['top', 'left', 'right', 'bottom']}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={{
                        flexGrow: 1,
                        justifyContent: 'center',
                        padding: 28,
                    }}
                    keyboardShouldPersistTaps="handled"
                >
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginBottom: 28,
                        }}
                    >
                        <DataPulse />
                        <View style={{ width: 10 }} />
                        <Text
                            style={{
                                color: palette.accent,
                                fontFamily: 'SpaceGrotesk_700Bold',
                                fontSize: 32,
                                letterSpacing: -0.8,
                            }}
                        >
                            NeuroPal
                        </Text>
                    </View>

                    <Text
                        style={{
                            color: palette.onSurface,
                            fontFamily: 'SpaceGrotesk_700Bold',
                            fontSize: 28,
                            marginBottom: 6,
                        }}
                    >
                        {mode === 'signup' ? 'Create your account' : 'Welcome back'}
                    </Text>
                    <Text
                        style={{
                            color: palette.onSurfaceVariant,
                            fontFamily: 'Inter_400Regular',
                            fontSize: 14,
                            lineHeight: 20,
                            marginBottom: 24,
                        }}
                    >
                        {mode === 'signup'
                            ? 'No marketing emails, no shared data. Just you and your library.'
                            : 'Sign in to pick up where you left off.'}
                    </Text>

                    {mode === 'signup' && (
                        <Field
                            label="Name"
                            value={name}
                            onChangeText={setName}
                            placeholder="Ryx"
                            autoCapitalize="words"
                            palette={palette}
                        />
                    )}
                    <Field
                        label="Email"
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        palette={palette}
                    />
                    <Field
                        label="Password"
                        value={password}
                        onChangeText={setPassword}
                        placeholder="At least 8 characters"
                        secureTextEntry
                        palette={palette}
                    />

                    <View style={{ height: 12 }} />
                    {busy ? (
                        <View
                            style={{
                                paddingVertical: 14,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <ActivityIndicator color={palette.accent} />
                            <View style={{ width: 10 }} />
                            <Text style={{ color: palette.onSurfaceVariant }}>
                                {mode === 'signup' ? 'Creating account…' : 'Signing in…'}
                            </Text>
                        </View>
                    ) : (
                        <NpPrimaryButton
                            label={mode === 'signup' ? 'Sign up' : 'Sign in'}
                            icon="arrow-forward"
                            onPress={submit}
                            expanded
                        />
                    )}

                    <Pressable
                        onPress={() =>
                            setMode((m) => (m === 'login' ? 'signup' : 'login'))
                        }
                        style={{ marginTop: 22, alignSelf: 'center' }}
                    >
                        <Text
                            style={{
                                color: palette.accent,
                                fontFamily: 'Inter_500Medium',
                                fontSize: 14,
                            }}
                        >
                            {mode === 'login'
                                ? 'No account yet? Create one'
                                : 'Already have an account? Sign in'}
                        </Text>
                    </Pressable>

                    <Text
                        style={{
                            color: withAlpha(palette.onSurfaceVariant, 0.6),
                            fontFamily: 'Inter_400Regular',
                            fontSize: 11,
                            textAlign: 'center',
                            marginTop: 28,
                            lineHeight: 17,
                        }}
                    >
                        By continuing you agree your data is processed on the
                        NeuroPal server only — never resold, never used to train
                        outside models.
                    </Text>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function Field({ label, palette, ...props }) {
    return (
        <View style={{ marginBottom: 14 }}>
            <Text
                style={{
                    color: palette.onSurfaceVariant,
                    fontFamily: 'Inter_500Medium',
                    fontSize: 11,
                    letterSpacing: 2,
                    marginBottom: 6,
                    marginLeft: 4,
                }}
            >
                {label.toUpperCase()}
            </Text>
            <TextInput
                {...props}
                placeholderTextColor={withAlpha(palette.onSurfaceVariant, 0.5)}
                style={{
                    backgroundColor: palette.surfaceContainer,
                    borderWidth: 1,
                    borderColor: withAlpha(palette.outlineVariant, 0.2),
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
                    color: palette.onSurface,
                    fontFamily: 'Inter_400Regular',
                    fontSize: 15,
                }}
            />
        </View>
    );
}

export default LoginScreen;
