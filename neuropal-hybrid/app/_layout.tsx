import "../global.css";

// Buffer polyfill for react-native-svg@^15.10 on Expo SDK 55+.
// Keep ABOVE any import that transitively pulls react-native-svg.
import { Buffer } from "buffer";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (global as any).Buffer === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).Buffer = Buffer;
}

import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from "@expo-google-fonts/atkinson-hyperlegible";
import { Fraunces_400Regular } from "@expo-google-fonts/fraunces";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { Lora_400Regular } from "@expo-google-fonts/lora";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { persistor, store } from "@/store/index";
import { useAppSelector } from "@/store/hooks";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync();

function Gate() {
  const completed = useAppSelector((s) => s.onboarding.completed);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inOnboarding = segments[0] === "onboarding";
    if (!completed && !inOnboarding) {
      router.replace("/onboarding");
    } else if (completed && inOnboarding) {
      router.replace("/");
    }
  }, [completed, segments, router]);

  return null;
}

function Chrome() {
  const { palette, isLight } = useTheme();
  return (
    <>
      <StatusBar style={isLight ? "dark" : "light"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.surface },
          animation: "fade",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="onboarding"
          options={{ animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="emergency"
          options={{ animation: "slide_from_bottom" }}
        />
      </Stack>
      <Gate />
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    JetBrainsMono_400Regular,
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
    Lora_400Regular,
    Fraunces_400Regular,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ReduxProvider store={store}>
          <PersistGate loading={null} persistor={persistor}>
            <ThemeProvider>
              <Chrome />
            </ThemeProvider>
          </PersistGate>
        </ReduxProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
