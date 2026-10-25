// Android: register the "Pal" widget's headless task. Called once from the
// app entry (index.js), next to registerRootComponent.
import { registerWidgetTaskHandler } from "react-native-android-widget";

import { widgetTaskHandler } from "./widgetTaskHandler";

export function registerWidget() {
  try {
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {
    // Never let the widget take the app down at start-up.
    console.warn("[widget] task handler not registered:", e?.message || e);
  }
}
