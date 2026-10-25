import { MaterialIcons } from "@expo/vector-icons";
import {
  DarkTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "../components/toast";

import { DataPulse, GlassPanel, withAlpha } from "../components/primitives";
import { useApiRequest } from "../store/ApiRequest";
import {
  clearSession,
  getApiStatus,
  getSessionToken,
  onUnauthorized,
  saveSessionToken,
  subscribeApi,
  wasSignedOut,
} from "../store/ApiLink";
import { clearDocTickets, describeNetworkError, USE_MOCK } from "../services/network";
import { hydrateUser, resetAuth, updateLogin } from "../store/slices/authSlice";
import { selectOnboardingCompleted } from "../store/selectors";
import { usePalette, useTheme } from "../theme/ThemeProvider";
import { Pal } from "../components/pal/Pal";
import { PalBuddyHost } from "../components/pal/PalBuddy";
import { openPalSheet } from "../components/pal/openPalSheet";
import { SignalBackdrop } from "../components/signal/Backdrop";
import { flushPendingNavigation, getPendingRoute, navRef, subscribePendingRoute } from "./navRef";
import { EmergencyScreen } from "../screens/EmergencyScreen";
import { HomeArrangeScreen } from "../screens/HomeArrangeScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { NotesScreen } from "../screens/NotesScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { PalBuilderScreen } from "../screens/PalBuilderScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReaderScreen } from "../screens/ReaderScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { StudioScreen } from "../screens/StudioScreen";
import { ToolboxScreen } from "../screens/ToolboxScreen";
import { VisualizerScreen } from "../screens/VisualizerScreen";

const RootStack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

// D1 — drawer destinations, in the locked order. `Viz` keeps its short route
// name (deep links / code references) but reads "Visualizer" in the drawer.
const DRAWER_CONFIG = [
  { route: "Home", label: "Home", icon: "home", component: HomeScreen },
  { route: "Library", label: "Library", icon: "menu-book", component: LibraryScreen },
  { route: "Reader", label: "Reader", icon: "chrome-reader-mode", component: ReaderScreen },
  { route: "Notes", label: "Notes", icon: "gesture", component: NotesScreen },
  { route: "Viz", label: "Visualizer", icon: "insights", component: VisualizerScreen },
  { route: "Toolbox", label: "Toolbox", icon: "handyman", component: ToolboxScreen },
  { route: "Profile", label: "Profile", icon: "person", component: ProfileScreen },
  // v2 — skins, Pal, Home layout (docs/PLATFORM-PLAN.md).
  { route: "Studio", label: "Make it yours", icon: "palette", component: StudioScreen },
  { route: "Settings", label: "Settings", icon: "tune", component: SettingsScreen },
];

function AppHeader({ navigation }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const insets = useSafeAreaInsets();
  const pal = useSelector((s) => s.look.pal);
  const palButton = useRef(null); // gets focus back when Pal's sheet closes

  return (
    <GlassPanel
      radius={0}
      style={{
        paddingTop: insets.top,
        paddingBottom: 10,
        borderRadius: 0,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 6,
        }}
      >
        <Pressable
          onPress={() => navigation.openDrawer()}
          style={{ padding: 6 }}
          hitSlop={5} // 34px visual + 5 → 44px target (WCAG 2.5.5)
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
        >
          <MaterialIcons name="menu" size={22} color={palette.accent} />
        </Pressable>
        <View style={{ width: 10 }} />
        <DataPulse />
        <View style={{ width: 10 }} />
        <Text
          style={{
            fontFamily: palette.fonts.display,
            fontSize: isSignal ? 19 : 20,
            color: isSignal ? palette.onSurface : palette.accent,
            letterSpacing: isSignal ? 1.2 : -0.5,
          }}
        >
          {isSignal ? "NEUROPAL" : "NeuroPal"}
        </Text>
        <View style={{ flex: 1 }} />
        {isSignal ? (
          // Signal: your own Pal sits in the header. Like the floating
          // bubble and the Home tile, it opens Pal, the assistant (whose
          // sheet links on to the builder) — one face, one meaning.
          <Pressable
            ref={palButton}
            onPress={() => openPalSheet(null, { returnFocusTo: palButton })}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Open ${pal?.name || "Pal"}, your assistant`}
            style={{ width: 44, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Pal pal={pal} size={46} decorative />
          </Pressable>
        ) : (
        <Pressable
          onPress={() => navigation.navigate("Profile")}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: palette.surfaceHigh,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: withAlpha(palette.accent, 0.28),
          }}
          hitSlop={5}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <MaterialIcons
            name="person"
            size={18}
            color={palette.onSurfaceVariant}
          />
        </Pressable>
        )}
      </View>
    </GlassPanel>
  );
}

// D1 — the drawer itself: tinted liquid glass, wordmark header, destinations
// with an accent bar on the active one, safe-area padded.
function DrawerContent({ navigation, state }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name;
  // P4: RN7's router REPLACES a screen's params on every navigate — a
  // params-less "Reader" tap used to wipe {id} and land on nothing. Forward
  // the live session's doc so the drawer re-summons what was open.
  const readerDocId = useSelector((s) => s.reader.docId);

  return (
    <GlassPanel radius={0} intensity={60} style={{ flex: 1, borderRadius: 0 }}>
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 18,
          paddingHorizontal: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            marginBottom: 22,
          }}
        >
          <DataPulse />
          <View style={{ width: 10 }} />
          <Text
            style={{
              fontFamily: palette.fonts.display,
              fontSize: 22,
              color: palette.accent,
              letterSpacing: -0.5,
            }}
          >
            NeuroPal
          </Text>
        </View>

        {DRAWER_CONFIG.map((item) => {
          const focused = activeRoute === item.route;
          return (
            <Pressable
              key={item.route}
              onPress={() =>
                navigation.navigate(
                  item.route,
                  item.route === "Reader" && readerDocId
                    ? { id: readerDocId }
                    : undefined
                )
              }
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: focused }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 13,
                paddingHorizontal: 14,
                marginVertical: 2,
                borderRadius: 14,
                backgroundColor: focused
                  ? withAlpha(palette.accent, 0.14)
                  : "transparent",
                borderLeftWidth: 3,
                borderLeftColor: focused ? palette.accent : "transparent",
              }}
            >
              <MaterialIcons
                name={item.icon}
                size={20}
                color={focused ? palette.accent : palette.onSurfaceVariant}
              />
              <Text
                style={{
                  marginLeft: 14,
                  fontSize: 15,
                  fontFamily: focused ? palette.fonts.bodySemi : palette.fonts.bodyMedium,
                  color: focused ? palette.accent : palette.onSurface,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}

        <View style={{ flex: 1 }} />
        <Text
          style={{
            paddingHorizontal: 14,
            color: withAlpha(palette.onSurfaceVariant, 0.6),
            fontFamily: palette.fonts.mono,
            fontSize: 10,
          }}
        >
          local-first · private
        </Text>
      </View>
    </GlassPanel>
  );
}

function DrawerChrome() {
  const palette = usePalette();

  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={({ route, navigation }) => ({
        header:
          route.name === "Reader"
            ? () => null // immersive reader owns its chrome (D8)
            : () => <AppHeader navigation={navigation} />,
        sceneStyle: { backgroundColor: palette.surface },
        drawerType: "front",
        drawerStyle: {
          width: 300,
          backgroundColor: "transparent",
        },
        overlayColor: withAlpha("#000000", 0.5),
        // P4 §5.3: left-edge swipe on TOUCH; on web the drawer library
        // itself defaults this off (pointer drags fight text selection) —
        // there the FAB/hamburger is the primary control.
        swipeEnabled: Platform.OS !== "web",
        swipeEdgeWidth: 60, // D1: swipe right from the left edge opens it
      })}
      // one overlay mounted per screen, wrapping ALL drawer destinations:
      // the nav FAB (+ now-playing pill) rides above every screen including
      // the header-less Reader
      screenLayout={({ route, navigation, children }) => (
        <NavOverlay route={route} navigation={navigation}>
          {children}
        </NavOverlay>
      )}
    >
      {DRAWER_CONFIG.map((item) => (
        <Drawer.Screen
          key={item.route}
          name={item.route}
          component={item.component}
          options={{ drawerLabel: item.label }}
        />
      ))}
    </Drawer.Navigator>
  );
}

// Issue 2: the floating nav FAB is REMOVED (owner-rejected). This overlay
// now carries only the now-playing pill (bottom-right, non-Reader screens)
// that jumps back to the live session — playback survives navigation since
// P4, so it needs a handle. Drawer access: native = left-edge swipe + the
// header hamburger; web = the persistent header hamburger on every screen
// (the Reader's lives in its top bar + a chrome-hidden fallback).
function NavOverlay({ route, navigation, children }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const playing = useSelector((s) => s.reader.playing);
  const readerDocId = useSelector((s) => s.reader.docId);
  const isReader = route.name === "Reader";

  return (
    <View style={{ flex: 1 }}>
      {/* v2 Signal: engineering grid on every screen, the living field on
          Home only. Renders nothing in Classic. */}
      <SignalBackdrop field={route.name === "Home"} />
      {children}
      {playing && !isReader && readerDocId ? (
        <Pressable
          onPress={() => navigation.navigate("Reader", { id: readerDocId })}
          accessibilityRole="button"
          accessibilityLabel="Now playing — back to the reader"
          style={{
            position: "absolute",
            right: 14,
            bottom: insets.bottom + 16,
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: withAlpha(palette.surfaceContainer, 0.88),
            borderWidth: 1,
            borderColor: withAlpha(palette.accent, 0.4),
            zIndex: 40,
          }}
        >
          <MaterialIcons name="graphic-eq" size={16} color={palette.accent} />
          <Text
            style={{
              marginLeft: 8,
              color: palette.accent,
              fontFamily: palette.fonts.displaySemi,
              fontSize: 13,
            }}
          >
            Now playing
          </Text>
        </Pressable>
      ) : null}
      {/* Pal as a buddy: the floating bubble + the assistant sheet. Only the
          focused screen's host draws, so there is one bubble at a time. */}
      <PalBuddyHost />
    </View>
  );
}

// Boot pipeline — runs on cold start, and again whenever loggedIn is reset to
// null (a new backend address, a fresh sign-in).
//   1. /api/auth/me with the saved session (silent). A single-user LOCAL_MODE
//      server answers with no session at all.
//   2. Answer → hydrate the user (and keep the refreshed session it may send).
//   3. 401 → this server wants a sign-in: clear the session, show it.
//   4. Anything else — no answer, or the edge answering for a server that's
//      down or restarting (502/503/521/530…) — open the app offline (the
//      banner says why): Home, check-ins, anchors, Pal and the tools all work
//      on the phone. A saved session is kept, so a deploy or an outage never
//      signs anyone out. Without one, the app still opens offline on a phone
//      that never signed in (the first answer from the server, a 401, brings
//      sign-in) — but never after a sign-out: then it waits for sign-in.
function useAuthBootstrap(loggedIn) {
  const dispatch = useDispatch();
  const { fetchData } = useApiRequest();

  const boot = useCallback(async () => {
    // Mock mode is fully offline — skip the network probe entirely and log
    // straight in as a fake user, otherwise mock mode dead-ends at Login.
    if (USE_MOCK) {
      dispatch(
        hydrateUser({ id: "mock-user", name: "Mock", email: "mock@neuropal.app" })
      );
      return;
    }
    try {
      // short timeout: the splash waits on this answer
      const me = await fetchData("auth/me", { silent: true, rethrow: true, timeout: 9000 });
      if (me && (me.id || me._id)) {
        if (me.token) await saveSessionToken(me.token).catch(() => {});
        dispatch(hydrateUser(me));
        return;
      }
      // A 200 that isn't a user (a proxy's or the edge's own page) is no
      // answer from NeuroPal: treat it like no answer, never as a sign-out.
      throw new Error("The server's answer wasn't from NeuroPal");
    } catch (error) {
      const status = error?.response?.status;
      const session = await getSessionToken().catch(() => null);
      if (status === 401) {
        await clearSession().catch(() => {});
      } else if (status === 404 && !session) {
        // Nothing NeuroPal at this address: the sign-in screen shows it and
        // lets the address be changed.
      } else {
        // Offline (or the server is down): the phone-side app still opens,
        // unless someone signed out here and hasn't signed in since.
        Toast.show({
          type: "error",
          text1: "Cannot reach the server",
          text2: describeNetworkError(error),
        });
        if (session || !(await wasSignedOut())) {
          dispatch(updateLogin(true));
          return;
        }
      }
    }
    dispatch(updateLogin(false));
  }, [dispatch, fetchData]);

  useEffect(() => {
    // Only run when we haven't determined login state yet (loggedIn=null).
    if (loggedIn === null) boot();
  }, [loggedIn, boot]);

  // Opened offline: once the server answers again, load the account (name,
  // Settings → Account, a refreshed session). A 401 there goes the usual way.
  const email = useSelector((s) => s.auth.email);
  const needsUser = loggedIn === true && !email && !USE_MOCK;
  useEffect(() => {
    if (!needsUser) return undefined;
    let last = getApiStatus().state;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const me = await fetchData("auth/me", { silent: true, rethrow: true, timeout: 9000 });
        if (me && (me.id || me._id)) {
          if (me.token) await saveSessionToken(me.token).catch(() => {});
          dispatch(hydrateUser(me));
        }
      } catch {
        // still offline, or a 401 the API layer already routes to sign-in
      }
      busy = false;
    };
    if (last === "ok") refresh();
    return subscribeApi((st) => {
      if (st.state === "ok" && last !== "ok") refresh();
      last = st.state;
    });
  }, [needsUser, fetchData, dispatch]);

  // Any data call that comes back 401 → the session is over on this server.
  useEffect(
    () =>
      onUnauthorized(() => {
        clearSession().catch(() => {});
        clearDocTickets();
        dispatch(resetAuth());
      }),
    [dispatch]
  );
}

function BootSplash() {
  const palette = usePalette();
  return (
    <View
      style={{ flex: 1, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" }}
      accessible
      accessibilityLabel="Connecting to your NeuroPal server"
    >
      <DataPulse />
      <Text
        style={{
          marginTop: 12,
          color: palette.onSurfaceVariant,
          fontFamily: palette.fonts.bodyMedium,
          fontSize: 13,
        }}
      >
        Connecting…
      </Text>
    </View>
  );
}

export function AppNavigator() {
  const palette = usePalette();
  const completed = useSelector(selectOnboardingCompleted);
  const loggedIn = useSelector((s) => s.auth.loggedIn);

  // Kick off the auth bootstrap once on mount (no-op if already resolved).
  useAuthBootstrap(loggedIn);

  const navigationTheme = useMemo(() => {
    return {
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: palette.surface,
        card: palette.surface,
        text: palette.onSurface,
        border: palette.outlineVariant,
        primary: palette.accent,
      },
    };
  }, [palette]);

  // The widget's "Overwhelmed" link waiting for the navigator: the calming
  // steps must not wait behind "Connecting…". Once shown they stay, even
  // after the waiting link is used up, until the connection check is done.
  const pendingRoute = useSyncExternalStore(subscribePendingRoute, getPendingRoute, getPendingRoute);
  const [calmDuringBoot, setCalmDuringBoot] = useState(false);
  useEffect(() => {
    if (loggedIn === null && pendingRoute === "Emergency") setCalmDuringBoot(true);
    else if (loggedIn !== null) setCalmDuringBoot(false);
  }, [loggedIn, pendingRoute]);
  const bootWithCalm = loggedIn === null && (calmDuringBoot || pendingRoute === "Emergency");

  // Sign-in gate. A single-user LOCAL_MODE server signs you in by itself, so
  // the gate only ever shows for a server that wants an account. The crisis
  // screen stays reachable when signed out — it must never sit behind a login.
  if (loggedIn === null && !bootWithCalm) return <BootSplash />;
  return (
    <NavigationContainer theme={navigationTheme} ref={navRef} onReady={flushPendingNavigation}>
      {loggedIn === null ? (
        // Still connecting, but the calming steps were asked for: show them
        // now. When the check finishes this same navigator gains the rest of
        // its screens and the calming steps stay open.
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.surface },
          }}
        >
          <RootStack.Screen name="Emergency" component={EmergencyScreen} />
        </RootStack.Navigator>
      ) : loggedIn === false ? (
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.surface },
          }}
        >
          <RootStack.Screen name="Login" component={LoginScreen} />
          <RootStack.Screen name="Emergency" component={EmergencyScreen} />
        </RootStack.Navigator>
      ) : completed ? (
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.surface },
          }}
        >
          <RootStack.Screen name="Main" component={DrawerChrome} />
          <RootStack.Screen name="Emergency" component={EmergencyScreen} />
          <RootStack.Screen name="PalBuilder" component={PalBuilderScreen} />
          <RootStack.Screen name="HomeArrange" component={HomeArrangeScreen} />
        </RootStack.Navigator>
      ) : (
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.surface },
          }}
        >
          <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
          <RootStack.Screen name="Emergency" component={EmergencyScreen} />
        </RootStack.Navigator>
      )}
    </NavigationContainer>
  );
}
