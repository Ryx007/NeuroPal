import { forwardRef } from "react";
import { Platform, ScrollView } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

// The scroll container for any screen with a text field.
//
// Native: react-native-keyboard-controller's KeyboardAwareScrollView. The app
// is edge-to-edge on Android, so the window no longer resizes for the
// keyboard; this view scrolls the focused field above it (and works on the
// New Architecture, where react-native-keyboard-aware-scroll-view's
// measurements are silent no-ops).
// Web: a plain ScrollView — the browser already brings the focused field into
// view, and the plain view keeps its imperative methods (keyboard-controller
// re-exposes the scroll view's methods by spreading the instance, which loses
// react-native-web's prototype methods such as scrollTo).
export const KeyboardSafeScrollView = forwardRef(function KeyboardSafeScrollView(
  { bottomOffset = 24, keyboardShouldPersistTaps = "handled", ...props },
  ref
) {
  if (Platform.OS === "web") {
    return <ScrollView ref={ref} keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props} />;
  }
  return (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    />
  );
});
