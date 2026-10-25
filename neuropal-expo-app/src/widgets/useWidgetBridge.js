// iOS / web: no home-screen widget, so the bridge does nothing. Metro picks
// useWidgetBridge.android.js on Android; keeping the widget library and its
// native module out of the iOS and web bundles entirely.
export function useWidgetBridge() {}
