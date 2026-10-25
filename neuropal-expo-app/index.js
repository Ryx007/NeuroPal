// App entry. Same as Expo's default "expo/AppEntry" (App is the root
// component), plus the Android home-screen widget: react-native-android-widget
// runs widget events (added, resized, periodic update, check-in taps) as a
// headless task that must be registered at start-up — the app may be
// launched in the background just to handle one. iOS and web get a no-op.
import { registerRootComponent } from "expo";

import App from "./App";
import { registerWidget } from "./src/widgets/registerWidget";

registerRootComponent(App);
registerWidget();
