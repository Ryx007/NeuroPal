import "./global.css";

// Buffer polyfill — pairs with the resolver alias in metro.config.js.
// Needed by react-native-svg@^15.10's utils/fetchData.ts, which does
// `import { Buffer } from 'buffer'`. This must run before any
// react-native-svg import. See docs/buffer-fix.md for the full story.
import { Buffer } from "buffer";
if (typeof global.Buffer === "undefined") {
  global.Buffer = Buffer;
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
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

import { toastConfig, TOAST_VISIBILITY_MS } from "./src/components/AppToast";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AppProviders } from "./src/providers/AppProviders";
import { MuiProvider } from "./src/providers/MuiProvider";
import { ThemeProvider, usePalette, useTheme } from "./src/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync();

function AppChrome() {
  const { isLight } = useTheme();
  const palette = usePalette();

  return (
    <>
      {/* D4 — the status-bar strip is colored out with the theme surface,
          never transparent over content. */}
      <StatusBar
        style={isLight ? "dark" : "light"}
        backgroundColor={palette.surface}
        translucent={false}
      />
      <AppNavigator />
      {/* Toast must sit OUTSIDE the navigator so it floats above every
          screen. ApiRequest.js calls Toast.show({...}) from anywhere.
          D5: custom config = ✕ + swipe-to-dismiss + 5s auto-hide. */}
      <Toast
        config={toastConfig}
        visibilityTime={TOAST_VISIBILITY_MS}
        topOffset={64}
      />
    </>
  );
}

export default function App() {
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
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <ThemeProvider>
            <MuiProvider>
              <AppChrome />
            </MuiProvider>
          </ThemeProvider>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
