import { MaterialIcons } from "@expo/vector-icons";
import {
  DarkTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "../components/toast";

import { DataPulse, GlassPanel, withAlpha } from "../components/primitives";
import { useApiRequest } from "../store/ApiRequest";
import { clearSession } from "../store/ApiLink";
import { describeNetworkError, USE_MOCK } from "../services/network";
import { hydrateUser, updateLogin } from "../store/slices/authSlice";
import { selectOnboardingCompleted } from "../store/selectors";
import { usePalette } from "../theme/ThemeProvider";
import { EmergencyScreen } from "../screens/EmergencyScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { NotesScreen } from "../screens/NotesScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReaderScreen } from "../screens/ReaderScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
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
  { route: "Settings", label: "Settings", icon: "tune", component: SettingsScreen },
];

function AppHeader({ navigation }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

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
            fontFamily: "SpaceGrotesk_700Bold",
            fontSize: 20,
            color: palette.accent,
            letterSpacing: -0.5,
          }}
        >
          NeuroPal
        </Text>
        <View style={{ flex: 1 }} />
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
              fontFamily: "SpaceGrotesk_700Bold",
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
                  fontFamily: focused ? "Inter_600SemiBold" : "Inter_500Medium",
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
            fontFamily: "JetBrainsMono_400Regular",
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
              fontFamily: "SpaceGrotesk_600SemiBold",
              fontSize: 13,
            }}
          >
            Now playing
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Boot pipeline — runs once on cold start.
//   1. Call /api/auth/me with the persisted JWT (silent, no toast on 401)
//   2. If it resolves → hydrate user into Redux + loggedIn=true
//   3. If it 401s / 404s / no token  → clearSession + loggedIn=false
//   4. If the backend never answered → loggedIn=false too, but keep the
//      session and say so — landing on Login with no explanation is exactly
//      the "built but disconnected" failure mode this build is removing.
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
      const me = await fetchData("auth/me", { silent: true, rethrow: true });
      if (me && (me.id || me._id)) {
        dispatch(hydrateUser(me));
        return;
      }
      await clearSession().catch(() => {});
    } catch (error) {
      if (!error?.response) {
        Toast.show({
          type: "error",
          text1: "Cannot reach the backend",
          text2: describeNetworkError(error),
        });
      } else {
        await clearSession().catch(() => {});
      }
    }
    dispatch(updateLogin(false));
  }, [dispatch, fetchData]);

  useEffect(() => {
    // Only run when we haven't determined login state yet (loggedIn=null).
    if (loggedIn === null) boot();
  }, [loggedIn, boot]);
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

  // No auth gate: this is a single-user local app (Build Brief §2.7 — "no
  // login screen friction"). The bootstrap above hydrates the user's
  // name/tweaks in the background when the backend answers; when it
  // doesn't, the app still opens and the Library banner / boot toast say
  // exactly what's wrong. (LoginScreen still exists in src/screens for a
  // future LOCAL_MODE=false build — it's just never routed to.)
  return (
    <NavigationContainer theme={navigationTheme}>
      {completed ? (
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.surface },
          }}
        >
          <RootStack.Screen name="Main" component={DrawerChrome} />
          <RootStack.Screen name="Emergency" component={EmergencyScreen} />
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
