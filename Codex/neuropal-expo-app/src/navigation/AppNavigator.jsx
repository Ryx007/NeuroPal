import { MaterialIcons } from "@expo/vector-icons";
import {
  DarkTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TweaksSheet } from "../components/TweaksSheet";
import { DataPulse, GlassPanel, withAlpha } from "../components/primitives";
import { selectOnboardingCompleted, selectTweaksOpen } from "../store/selectors";
import { setTweaksOpen } from "../store/slices/uiSlice";
import { usePalette } from "../theme/ThemeProvider";
import { AnchorsScreen } from "../screens/AnchorsScreen";
import { EmergencyScreen } from "../screens/EmergencyScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ReaderScreen } from "../screens/ReaderScreen";

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_CONFIG = {
  Home: { label: "Home", icon: "home" },
  Library: { label: "Library", icon: "menu-book" },
  Reader: { label: "Reader", icon: "chrome-reader-mode" },
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

export function AppNavigator() {
  const palette = usePalette();
  const completed = useSelector(selectOnboardingCompleted);

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

  return (
    <NavigationContainer theme={navigationTheme}>
      {completed ? (
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: palette.surface,
            },
          }}
        >
          <RootStack.Screen name="Tabs" component={TabsChrome} />
          <RootStack.Screen name="Emergency" component={EmergencyScreen} />
        </RootStack.Navigator>
      ) : (
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: palette.surface,
            },
          }}
        >
          <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
          <RootStack.Screen name="Emergency" component={EmergencyScreen} />
        </RootStack.Navigator>
      )}
    </NavigationContainer>
  );
}
