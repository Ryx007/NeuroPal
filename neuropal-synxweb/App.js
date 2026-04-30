// Buffer polyfill for react-native-svg ≥15.10 — must precede any SVG import.
import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
    global.Buffer = Buffer;
}

import React, { useEffect } from 'react';
import { useFonts } from 'expo-font';
import {
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import {
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { Lora_400Regular } from '@expo-google-fonts/lora';
import {
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { Provider as ReduxProvider } from 'react-redux';
import Toast from 'react-native-toast-message';

import store from './src/store';
import { UIProvider } from './src/context/UI';
import { ThemeProvider } from './src/theme/ThemeProvider';
import App from './src/App';

SplashScreen.preventAutoHideAsync();

// Provider tree mirrors Synxweb's `src/index.js` exactly:
//
//   <Provider store={store}>
//     <BrowserRouter>
//       <ToastContainer />
//       <UIProvider>
//         <App/>
//       </UIProvider>
//     </BrowserRouter>
//   </Provider>
//
// The RN equivalents are:
//   BrowserRouter   -> NavigationContainer (react-navigation)
//   ToastContainer  -> <Toast /> from react-native-toast-message
//
// We add GestureHandlerRootView + SafeAreaProvider above as RN requires,
// and ThemeProvider inside ReduxProvider so it can read configSlice.
export default function Entry() {
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
                    <ThemeProvider>
                        <NavigationContainer>
                            <UIProvider>
                                <App />
                            </UIProvider>
                            <Toast />
                        </NavigationContainer>
                    </ThemeProvider>
                </ReduxProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
