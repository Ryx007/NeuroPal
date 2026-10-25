import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import Toast from '../components/toast';

import { BackendAddressField } from '../components/ConnectionStatus';
import { DataPulse, NpGhostButton, NpPrimaryButton } from '../components/primitives';
import { announce } from '../services/announce';
import { apiClient, describeNetworkError } from '../services/network';
import { apiHost, labelForCandidate, recheckApi, saveSessionToken, subscribeApi } from '../store/ApiLink';
import { hydrateUser, updateLogin } from '../store/slices/authSlice';
import { usePalette } from '../theme/ThemeProvider';
import { KeyboardSafeScrollView } from '../components/KeyboardSafeScrollView';

// Sign-in for a server that wants an account (a public NeuroPal server; a
// single-user LOCAL_MODE server never shows this). Email + password, or
// create an account — with the invite code when the server asks for one.
// The server address is editable right here, so a wrong default is never a
// dead end, and the crisis screen is one tap away even when signed out.

function useServerConfig() {
    // { state: 'checking' | 'ok' | 'down', localMode, signup }
    const [config, setConfig] = useState({ state: 'checking', localMode: false, signup: 'invite' });
    const [host, setHost] = useState(apiHost);
    const hostRef = useRef(apiHost);

    const load = useCallback(async () => {
        setConfig((c) => ({ ...c, state: 'checking' }));
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
        try {
            const res = await fetch(`${apiHost}/api/auth/config`, { signal: controller?.signal });
            if (!res.ok) {
                // An older server without /config: assume sign-in with an invite.
                setConfig({ state: 'ok', localMode: false, signup: 'invite' });
                return;
            }
            const data = await res.json();
            setConfig({ state: 'ok', localMode: Boolean(data.localMode), signup: data.signup || 'invite' });
        } catch (e) {
            setConfig((c) => ({ ...c, state: 'down' }));
        } finally {
            if (timer) clearTimeout(timer);
        }
    }, []);

    useEffect(() => {
        load();
        // the probe may switch hosts, or the address may be edited here
        return subscribeApi((st) => {
            if (st.host === hostRef.current) return;
            hostRef.current = st.host;
            setHost(st.host);
            load();
        });
    }, [load]);

    return { ...config, host, reload: load };
}

// Sign-in and sign-up report their own errors, in a line that stays on screen
// (the API layer's toast leaves after 5 s): the server's words when it sent
// some ("invalid email or password"), else what went wrong on the way.
async function postAuth(endpoint, body) {
    try {
        const { data } = await apiClient.post(endpoint, body);
        return { data };
    } catch (e) {
        const serverMsg = e?.response?.data?.error;
        if (serverMsg) return { error: serverMsg.charAt(0).toUpperCase() + serverMsg.slice(1) };
        if (e?.response) return { error: describeNetworkError(e) };
        // No answer: the address may be the wrong one for where this device
        // is now; re-probe so the next try can ride a fallback.
        recheckApi();
        return {
            error:
                e?.code === 'ECONNABORTED'
                    ? 'The server took too long to answer. Try again.'
                    : 'Can’t reach the server. Check the address under Server below, then try again.',
        };
    }
}

export function LoginScreen() {
    const palette = usePalette();
    const dispatch = useDispatch();
    const navigation = useNavigation();
    const server = useServerConfig();

    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [name, setName] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [editServer, setEditServer] = useState(false);
    // What went wrong, on screen until the next try: { text, fields: [...] }.
    const [error, setError] = useState(null);
    const errorShown = useRef('');

    // A single-user server signs you in by itself — hand back to the boot check.
    useEffect(() => {
        if (server.state === 'ok' && server.localMode) dispatch(updateLogin(null));
    }, [server.state, server.localMode, dispatch]);

    const signupOpen = server.signup !== 'closed';
    const needsInvite = server.signup === 'invite';
    const signingUp = mode === 'signup' && signupOpen;
    const invalid = (field) => Boolean(error?.fields?.includes(field));

    // The error line is a live region (TalkBack, web). iOS has none, and the
    // same words twice leave the line unchanged, so say those out loud.
    const showError = (text, fields = []) => {
        if (Platform.OS === 'ios' || errorShown.current === text) announce(text, { assertive: true });
        errorShown.current = text;
        setError({ text, fields });
    };
    const clearError = () => {
        errorShown.current = '';
        setError(null);
    };

    const submit = async () => {
        if (busy) return;
        if (!email.trim() || !password) {
            showError(
                'Email and password, please',
                [!email.trim() && 'email', !password && 'password'].filter(Boolean),
            );
            return;
        }
        if (signingUp && password.length < 8) {
            showError('Use at least 8 characters for the password', ['password']);
            return;
        }
        if (signingUp && needsInvite && !inviteCode.trim()) {
            showError('This server needs an invite code to create an account', ['invite']);
            return;
        }
        clearError();
        setBusy(true);
        const endpoint = signingUp ? 'auth/register' : 'auth/login';
        const body = signingUp
            ? {
                  email: email.trim(),
                  password,
                  name: name.trim() || undefined,
                  inviteCode: needsInvite ? inviteCode.trim() : undefined,
              }
            : { email: email.trim(), password };
        const { data: resp, error: failure } = await postAuth(endpoint, body);
        setBusy(false);
        if (failure) {
            showError(failure);
            return;
        }

        const token = resp?.token || resp?.accessToken;
        if (!token) {
            showError('The server sent no session — try again');
            return;
        }
        await saveSessionToken(token);
        dispatch(hydrateUser(resp.user || {}));
        dispatch(updateLogin(true));
        Toast.show({
            type: 'success',
            text1: signingUp ? 'Account created' : 'Welcome back',
        });
    };

    const serverLine =
        server.state === 'checking'
            ? 'Checking the server…'
            : server.state === 'down'
              ? `Can’t reach ${labelForCandidate(server.host)}`
              : labelForCandidate(server.host);

    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: palette.surface }}
            edges={['top', 'left', 'right', 'bottom']}
        >
            <KeyboardSafeScrollView
                bottomOffset={24}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                    flexGrow: 1,
                    justifyContent: 'center',
                    padding: 28,
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 28 }}>
                    <DataPulse />
                    <View style={{ width: 10 }} />
                    <Text
                        accessibilityRole="header"
                        style={{
                            color: palette.accent,
                            fontFamily: palette.fonts.display,
                            fontSize: 32,
                            letterSpacing: -0.8,
                        }}
                    >
                        NeuroPal
                    </Text>
                </View>

                <Text
                    accessibilityRole="header"
                    aria-level={2}
                    style={{
                        color: palette.onSurface,
                        fontFamily: palette.fonts.display,
                        fontSize: 28,
                        marginBottom: 6,
                    }}
                >
                    {signingUp ? 'Create your account' : 'Welcome back'}
                </Text>
                <Text
                    style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: palette.fonts.body,
                        fontSize: 14,
                        lineHeight: 20,
                        marginBottom: 24,
                    }}
                >
                    {signingUp
                        ? 'No marketing emails. Your library stays on your NeuroPal server.'
                        : 'Sign in to pick up where you left off.'}
                </Text>

                {signingUp && (
                    <Field
                        label="Name"
                        value={name}
                        onChangeText={setName}
                        placeholder="What should Pal call you?"
                        autoCapitalize="words"
                        textContentType="name"
                        autoComplete="name"
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
                    textContentType="emailAddress"
                    autoComplete="email"
                    palette={palette}
                    invalid={invalid('email')}
                    errorId="login-error"
                />
                <Field
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder={signingUp ? 'Choose a password' : 'Your password'}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType={signingUp ? 'newPassword' : 'password'}
                    autoComplete={signingUp ? 'new-password' : 'current-password'}
                    onSubmitEditing={signingUp && needsInvite ? undefined : submit}
                    palette={palette}
                    invalid={invalid('password')}
                    errorId="login-error"
                    helper={signingUp ? 'At least 8 characters' : undefined}
                    helperId="login-password-help"
                    trailing={
                        <Pressable
                            onPress={() => setShowPassword((v) => !v)}
                            accessibilityRole="button"
                            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                            hitSlop={10}
                            style={{ padding: 8 }}
                        >
                            <MaterialIcons
                                name={showPassword ? 'visibility-off' : 'visibility'}
                                size={20}
                                color={palette.onSurfaceVariant}
                            />
                        </Pressable>
                    }
                />
                {signingUp && needsInvite && (
                    <Field
                        label="Invite code"
                        value={inviteCode}
                        onChangeText={setInviteCode}
                        placeholder="From whoever runs this server"
                        autoCapitalize="none"
                        autoCorrect={false}
                        onSubmitEditing={submit}
                        palette={palette}
                        invalid={invalid('invite')}
                        errorId="login-error"
                    />
                )}

                {/* What went wrong, until the next try. Always mounted: a live
                    region is only read when its text changes. */}
                <Text
                    id="login-error"
                    accessibilityLiveRegion="assertive"
                    aria-live="assertive"
                    style={[
                        {
                            marginLeft: 4,
                            color: palette.error,
                            fontFamily: palette.fonts.bodyMedium,
                            fontSize: 14,
                            lineHeight: 20,
                        },
                        // empty: no room taken (Android measures an empty Text as a line)
                        error ? { marginBottom: 2 } : { height: 0 },
                    ]}
                >
                    {error?.text || ''}
                </Text>
                <View style={{ height: 12 }} />
                {/* Stays put while busy (disabled, saying what it's doing), so
                    focus never lands on nothing. */}
                <NpPrimaryButton
                    label={
                        busy
                            ? signingUp
                                ? 'Creating account…'
                                : 'Signing in…'
                            : signingUp
                              ? 'Create account'
                              : 'Sign in'
                    }
                    icon="arrow-forward"
                    onPress={submit}
                    disabled={busy}
                    expanded
                />

                {signupOpen ? (
                    <Pressable
                        onPress={() => {
                            clearError();
                            setMode((m) => (m === 'login' ? 'signup' : 'login'));
                        }}
                        accessibilityRole="button"
                        hitSlop={8}
                        style={{ marginTop: 22, alignSelf: 'center', paddingVertical: 8 }}
                    >
                        <Text
                            style={{
                                color: palette.accent,
                                fontFamily: palette.fonts.bodyMedium,
                                fontSize: 14,
                            }}
                        >
                            {mode === 'login' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
                        </Text>
                    </Pressable>
                ) : (
                    <Text
                        style={{
                            marginTop: 22,
                            alignSelf: 'center',
                            color: palette.onSurfaceVariant,
                            fontFamily: palette.fonts.body,
                            fontSize: 13,
                        }}
                    >
                        New accounts are closed on this server.
                    </Text>
                )}

                {/* Which server this is — and a way to change it. */}
                <View
                    style={{
                        marginTop: 28,
                        padding: 14,
                        borderRadius: 14,
                        backgroundColor: palette.surfaceContainer,
                    }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons
                            name={server.state === 'down' ? 'cloud-off' : 'dns'}
                            size={18}
                            color={palette.onSurfaceVariant}
                        />
                        <Text
                            accessibilityLiveRegion="polite"
                            numberOfLines={2}
                            style={{
                                flex: 1,
                                marginLeft: 8,
                                color: palette.onSurfaceVariant,
                                fontFamily: palette.fonts.body,
                                fontSize: 13,
                            }}
                        >
                            Server · {serverLine}
                        </Text>
                        <Pressable
                            onPress={() => setEditServer((v) => !v)}
                            accessibilityRole="button"
                            accessibilityLabel={editServer ? 'Close the server address' : 'Change the server address'}
                            hitSlop={10}
                            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                        >
                            <Text style={{ color: palette.accent, fontFamily: palette.fonts.bodySemi, fontSize: 13 }}>
                                {editServer ? 'Done' : 'Change'}
                            </Text>
                        </Pressable>
                    </View>
                    {server.state === 'down' && !editServer ? (
                        <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
                            <NpGhostButton label="Try again" icon="refresh" onPress={server.reload} />
                        </View>
                    ) : null}
                    {editServer ? <BackendAddressField onChanged={server.reload} /> : null}
                </View>

                <Pressable
                    onPress={() => navigation.navigate('Emergency')}
                    accessibilityRole="button"
                    accessibilityLabel="I need help right now — open the calming steps"
                    hitSlop={8}
                    style={{ marginTop: 18, alignSelf: 'center', paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}
                >
                    <MaterialIcons name="favorite" size={16} color={palette.onSurfaceVariant} />
                    <Text
                        style={{
                            marginLeft: 6,
                            color: palette.onSurfaceVariant,
                            fontFamily: palette.fonts.bodyMedium,
                            fontSize: 13,
                        }}
                    >
                        Need help right now?
                    </Text>
                </Pressable>

                <Text
                    style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: palette.fonts.body,
                        fontSize: 11,
                        textAlign: 'center',
                        marginTop: 18,
                        lineHeight: 17,
                    }}
                >
                    Your documents and notes are stored on your NeuroPal server, never sold. Questions you
                    ask are answered by the AI service that server uses.
                </Text>
            </KeyboardSafeScrollView>
        </SafeAreaView>
    );
}

// ids for aria-describedby, or nothing (kept out of the component: React
// Compiler can't lower `[a && b].join() || c` and would skip the component).
function describedByIds(...ids) {
    const list = ids.filter(Boolean);
    return list.length > 0 ? list.join(' ') : undefined;
}

// A visible label over a field whose edge reads at 3:1 on the page (outline
// on Classic, the control colour on Signal; the error colour while it is the
// field at fault), and any rule as helper text under it, never only in the
// placeholder.
function Field({ label, palette, trailing, invalid = false, errorId, helper, helperId, ...props }) {
    const edge = invalid ? palette.error : palette.skin === 'signal' ? palette.control : palette.outline;
    const describedBy = describedByIds(invalid ? errorId : null, helper ? helperId : null);
    return (
        <View style={{ marginBottom: 14 }}>
            <Text
                style={{
                    color: palette.onSurfaceVariant,
                    fontFamily: palette.fonts.bodyMedium,
                    fontSize: 11,
                    letterSpacing: 2,
                    marginBottom: 6,
                    marginLeft: 4,
                }}
            >
                {label.toUpperCase()}
            </Text>
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: palette.surfaceContainer,
                    borderWidth: 1,
                    borderColor: edge,
                    borderRadius: 14,
                    paddingRight: trailing ? 4 : 0,
                }}
            >
                <TextInput
                    {...props}
                    accessibilityLabel={label}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    placeholderTextColor={palette.onSurfaceVariant}
                    style={{
                        flex: 1,
                        minHeight: 48,
                        paddingHorizontal: 14,
                        paddingVertical: Platform.OS === 'ios' ? 14 : 10,
                        color: palette.onSurface,
                        fontFamily: palette.fonts.body,
                        fontSize: 15,
                    }}
                />
                {trailing}
            </View>
            {helper ? (
                <Text
                    id={helperId}
                    style={{
                        marginTop: 6,
                        marginLeft: 4,
                        color: palette.onSurfaceVariant,
                        fontFamily: palette.fonts.body,
                        fontSize: 12.5,
                        lineHeight: 17,
                    }}
                >
                    {helper}
                </Text>
            ) : null}
        </View>
    );
}

export default LoginScreen;
