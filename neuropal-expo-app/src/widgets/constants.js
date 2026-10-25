// Shared names for the Android home-screen widget ("Pal") and its app-side
// bridge. Pure data: safe to import from the app, the widget's headless task
// and node --test alike.

// Must match the `name` of the widget in app.json (react-native-android-widget
// plugin). The plugin turns it into the AppWidgetProvider class
// io.neuropal.app.widget.Pal and the res/xml/widgetprovider_pal.xml file.
export const WIDGET_NAME = "Pal";

// App ↔ widget data contract (AsyncStorage keys — keep exactly as is).
export const SNAPSHOT_KEY = "neuropal-widget-snapshot"; // written by the app
export const CHECKINS_KEY = "neuropal-widget-checkins"; // appended by the widget, consumed by the app
export const SNAPSHOT_VERSION = 1;

// Pending widget check-ins kept if the app is not opened for a while. The app
// only applies the latest one; the cap keeps the key small.
export const MAX_PENDING_CHECKINS = 50;

// "Ask Pal" opens the app on the assistant sheet.
export const ASK_PAL_URL = "neuropal://pal";

// "Overwhelmed" opens the app on the calming steps (the Emergency screen) and
// checks in as red there — the same as moving into red on Home. The other
// two check-ins stay in the background.
//
// Any app can send a neuropal:// link, so the widget's link carries a secret
// key (?k=…) that only this app and its widget know (LINK_KEY_STORAGE). A
// link without the right key still opens the calming steps — harmless — but
// never writes a check-in.
export const CALM_URL = "neuropal://calm";
export const LINK_KEY_STORAGE = "neuropal-widget-linkkey";

// clickAction for the three check-in buttons (handled in the headless task).
export const CHECKIN_ACTION = "PAL_CHECKIN";

// The widget's words for the three nervous-system states — the app's own
// words (STATE_REGIONS in components/home/stateScale.js). State is never
// colour-only: every state carries a word and a shape glyph (circle /
// triangle / square, like components/home/StateGlyph.jsx).
export const WIDGET_STATES = {
  green: { id: "green", word: "Okay", glyph: "circle", mood: "okay" },
  yellow: { id: "yellow", word: "Bit off", glyph: "triangle", mood: "off" },
  red: { id: "red", word: "Overwhelmed", glyph: "square", mood: "over" },
};
export const STATE_ORDER = ["green", "yellow", "red"];
