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
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OfflineBanner } from "./src/components/OfflineBanner";
import { ReminderPopup } from "./src/components/ReminderPopup";
import { ToastHost } from "./src/components/toast";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AppProviders } from "./src/providers/AppProviders";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { appStore } from "./src/store";
import { MuiProvider } from "./src/providers/MuiProvider";
import { SIGNAL_FONT_ASSETS } from "./src/theme/fonts";
import { ThemeProvider, usePalette, useTheme } from "./src/theme/ThemeProvider";
import { useWidgetBridge } from "./src/widgets/useWidgetBridge";
import { prepareAnnouncer } from "./src/services/announce";

SplashScreen.preventAutoHideAsync();

function AppChrome() {
  // Android home-screen widget ↔ app (a no-op on iOS and web).
  useWidgetBridge();
  const { isLight } = useTheme();
  const palette = usePalette();
  // Screen-reader announcements on the web need their live regions in the
  // page before the first message (services/announce.js).
  useEffect(() => {
    prepareAnnouncer();
  }, []);

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
      {/* Toast host sits OUTSIDE the navigator so it floats above every
          screen. In-house (see components/toast.js): the previous library's
          capture-phase gesture stole ✕ taps on device and could wedge
          auto-hide permanently. */}
      <ToastHost />
      {/* Issue 0 — reachability is never silent: floats above every screen
          whenever no backend candidate answers, naming the host tried. */}
      <OfflineBanner />
      {/* On-screen reminder pop-up — fires on every platform while the app
          is open, independent of OS notification permission. */}
      <ReminderPopup />
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
    // v2 Signal skin: Archivo display + Atkinson Hyperlegible Next/Mono.
    ...SIGNAL_FONT_ASSETS,
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
        {/* Keyboard handling for every screen (react-native-keyboard-controller).
            The app is edge-to-edge on Android and screens pad themselves with
            safe-area insets, so the provider must not add bar padding too. */}
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
          <AppProviders>
            <AppErrorBoundary store={appStore}>
              <ThemeProvider>
                <MuiProvider>
                  <AppChrome />
                </MuiProvider>
              </ThemeProvider>
            </AppErrorBoundary>
          </AppProviders>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
