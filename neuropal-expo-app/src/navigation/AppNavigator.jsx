import { MaterialIcons } from "@expo/vector-icons";
import {
  DarkTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

import { TweaksSheet } from "../components/TweaksSheet";
import { DataPulse, GlassPanel, withAlpha } from "../components/primitives";
import { useApiRequest } from "../store/ApiRequest";
import { clearSession } from "../store/ApiLink";
import { describeNetworkError, USE_MOCK } from "../services/network";
import {
  hydrateUser,
  updateLogin,
} from "../store/slices/authSlice";
import { selectOnboardingCompleted, selectTweaksOpen } from "../store/selectors";
import { setTweaksOpen } from "../store/slices/uiSlice";
import { usePalette } from "../theme/ThemeProvider";
import { AnchorsScreen } from "../screens/AnchorsScreen";
import { EmergencyScreen } from "../screens/EmergencyScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { NotesScreen } from "../screens/NotesScreen";
import { VisualizerScreen } from "../screens/VisualizerScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReaderScreen } from "../screens/ReaderScreen";

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_CONFIG = {
  Home: { label: "Home", icon: "home" },
  Library: { label: "Library", icon: "menu-book" },
  Reader: { label: "Reader", icon: "chrome-reader-mode" },
  Notes: { label: "Notes", icon: "gesture" },
  Viz: { label: "Viz", icon: "insights" },
  Anchors: { label: "Anchors", icon: "anchor" },
  Profile: { label: "Profile", icon: "person" },
};

function AppHeader({ navigation }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();

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
          onPress={() => dispatch(setTweaksOpen(true))}
          style={{ padding: 6 }}
          accessibilityLabel="Open tweaks menu"
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

function AppTabBar({ state, navigation }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const currentRouteName = state.routes[state.index]?.name;

  if (currentRouteName === "Reader") {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <View
        style={{
          paddingHorizontal: 12,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
          paddingTop: 8,
        }}
      >
        <GlassPanel radius={28} style={{ borderRadius: 28 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            {state.routes.map((route, index) => {
              const config = TAB_CONFIG[route.name];
              const focused = state.index === index;

              return (
                <Pressable
                  key={route.key}
                  onPress={() => navigation.navigate(route.name)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 8,
                    borderRadius: 18,
                    backgroundColor: focused
                      ? withAlpha(palette.accent, 0.12)
                      : "transparent",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={config.label}
                >
                  <MaterialIcons
                    name={config.icon}
                    size={20}
                    color={
                      focused
                        ? palette.accent
                        : withAlpha(palette.onSurfaceVariant, 0.7)
                    }
                  />
                  <Text
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      fontFamily: "Inter_500Medium",
                      color: focused
                        ? palette.accent
                        : withAlpha(palette.onSurfaceVariant, 0.7),
                    }}
                  >
                    {config.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassPanel>
      </View>
    </View>
  );
}

function TabsChrome() {
  const palette = usePalette();
  const tweaksOpen = useSelector(selectTweaksOpen);
  const dispatch = useDispatch();

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route, navigation }) => ({
          header:
            route.name === "Reader"
              ? () => null
              : () => <AppHeader navigation={navigation} />,
          sceneStyle: {
            backgroundColor: palette.surface,
          },
        })}
        tabBar={(props) => <AppTabBar {...props} />}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Library" component={LibraryScreen} />
        <Tab.Screen name="Reader" component={ReaderScreen} />
        <Tab.Screen name="Notes" component={NotesScreen} />
        <Tab.Screen name="Viz" component={VisualizerScreen} />
        <Tab.Screen name="Anchors" component={AnchorsScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
      <TweaksSheet
        visible={tweaksOpen}
        onClose={() => dispatch(setTweaksOpen(false))}
      />
    </>
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
          visibilityTime: 8000,
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
          <RootStack.Screen name="Tabs" component={TabsChrome} />
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
