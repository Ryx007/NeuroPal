import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, Stack, StyleSheet, Text, View } from 'react-native';
import { connect, useDispatch } from 'react-redux';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useApiRequest } from './store/ApiRequest';
import { setSocketUser, socket } from './store/Socket';
import {
    setMvdTasks,
    setDocuments,
    updateLogin,
    updateUserId,
    updateUserName,
    updateWorkerName,
    updateCompanyName,
    updateCompanyLogo,
    updateBillUrl,
    updateThemeColor,
    updatePlans,
    updateActivePlans,
    updateWorkers,
    updateStoreWorkers,
} from './store/slices/configSlice';
import { MockAnchors, MockDocuments, MockMvd } from './data/mock';

import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import ReaderPage from './pages/ReaderPage';
import AnchorsPage from './pages/AnchorsPage';
import ProfilePage from './pages/ProfilePage';
import OnboardingPage from './pages/OnboardingPage';
import EmergencyPage from './pages/EmergencyPage';
import NotFound from './pages/NotFound';
import Navbar from './components/Navbar';
import { usePalette } from './theme/ThemeProvider';

const Stack_ = createNativeStackNavigator();

// `App` mirrors Synxweb's `src/App.jsx` — wrapped in `connect(mapStateToProps)`
// at the bottom, with hooks (`useDispatch`, `useApiRequest`) inside for the
// imperative bits. Reads boot config, populates Redux, decides which screen
// tree to mount.
function App({ loggedIn, themeMode, userName, workerName, onboardingComplete }) {
    const dispatch = useDispatch();
    const { fetchData, postData } = useApiRequest();
    const palette = usePalette();

    const getConfig = useCallback(async () => {
        // Pre-Phase-2 NeuroPal has no auth backend yet, so we boot directly
        // into a "logged in" state with the seed data dispatched into Redux.
        // This matches Synxweb's pattern: `app/preview` (no session) or
        // `store/app/config` (with session) populates configSlice on boot.
        //
        // When Sprint 2.1 lands, replace these mock dispatches with the
        // real `fetchData('app/config')` chain — see Synxweb App.jsx for
        // the exact pattern to follow.

        dispatch(updateCompanyName('NeuroPal'));
        dispatch(updateCompanyLogo(''));
        dispatch(updateThemeColor('#B1C5FF'));
        dispatch(updateBillUrl(''));
        dispatch(setMvdTasks(MockMvd()));
        dispatch(setDocuments(MockDocuments));
        dispatch(updatePlans([]));
        dispatch(updateActivePlans([]));
        dispatch(updateWorkers({}));
        dispatch(updateStoreWorkers({}));
        dispatch(updateUserName('You'));
        dispatch(updateWorkerName(''));
        dispatch(updateUserId('local-user'));
        dispatch(updateLogin(true));
        // setSocketUser('local-user'); // wire after backend lands
    }, [dispatch, fetchData, postData]);

    useEffect(() => {
        getConfig();
    }, [getConfig]);

    useEffect(() => {
        const updateSession = () => getConfig();
        socket.on('sessioncheck', updateSession);
        return () => {
            socket.off('sessioncheck', updateSession);
            socket.disconnect();
        };
    }, [getConfig]);

    if (loggedIn === null) {
        return (
            <View
                style={[
                    styles.center,
                    { backgroundColor: palette.surface },
                ]}
            >
                <ActivityIndicator size="large" color={palette.accent} />
                <Text
                    style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: 'Inter_400Regular',
                        marginTop: 16,
                    }}
                >
                    Loading NeuroPal…
                </Text>
            </View>
        );
    }

    if (loggedIn === false || !onboardingComplete) {
        // Synxweb mounts `<Login/>` here. NeuroPal has no auth in Phase 1,
        // so the equivalent gate is "have you finished onboarding?".
        return (
            <Stack_.Navigator screenOptions={{ headerShown: false }}>
                <Stack_.Screen name="Onboarding" component={OnboardingPage} />
            </Stack_.Navigator>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: palette.surface }}>
            <Stack_.Navigator
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: palette.surface },
                }}
            >
                <Stack_.Screen name="Home" component={HomePage} />
                <Stack_.Screen name="Library" component={LibraryPage} />
                <Stack_.Screen name="Reader" component={ReaderPage} />
                <Stack_.Screen name="Anchors" component={AnchorsPage} />
                <Stack_.Screen name="Profile" component={ProfilePage} />
                <Stack_.Screen
                    name="Emergency"
                    component={EmergencyPage}
                    options={{ animation: 'slide_from_bottom' }}
                />
                <Stack_.Screen name="NotFound" component={NotFound} />
            </Stack_.Navigator>
            <Navbar />
        </View>
    );
}

// `mapStateToProps` matches Synxweb line-for-line — `state.configs.<key>`.
const mapStateToProps = (state) => ({
    loggedIn: state.configs.loggedIn,
    themeMode: state.configs.theme,
    userName: state.configs.userName,
    workerName: state.configs.workerName,
    onboardingComplete: state.configs.onboardingComplete,
});

export default connect(mapStateToProps)(App);

const styles = StyleSheet.create({
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
