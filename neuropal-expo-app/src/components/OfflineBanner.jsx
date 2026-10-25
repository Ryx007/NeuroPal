import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { navRef } from "../navigation/navRef";
import { getApiStatus, labelForCandidate, recheckApi, subscribeApi } from "../store/ApiLink";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "./primitives";

// Issue 0 — never a silent dead app again. Whenever the /healthz probe
// declares every candidate unreachable, this slim banner floats above the
// screens naming the host that was tried. Tap = retry. Auto-hides the
// moment any candidate answers.
//
// It sits just below the top bars, so it never covers the menu button or a
// screen's close button, and it stays off two screens: the calming steps
// (nothing may get in the way there) and sign-in (which shows the server
// itself).
const HIDDEN_ON = new Set(["Emergency", "Login"]);
const BELOW_TOP_BAR = 56;

export function OfflineBanner() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [snap, setSnap] = useState(() => ({
    state: getApiStatus().state,
    host: getApiStatus().host,
  }));

  useEffect(
    () =>
      subscribeApi((s) => setSnap({ state: s.state, host: s.host })),
    []
  );

  // The banner lives outside the navigator; it follows the current screen
  // through the shared navigation ref.
  const [routeName, setRouteName] = useState(null);
  useEffect(() => {
    const update = () => setRouteName(navRef.isReady() ? navRef.getCurrentRoute()?.name ?? null : null);
    update();
    return navRef.addListener("state", update);
  }, []);

  if (snap.state !== "down" || HIDDEN_ON.has(routeName)) return null;

  return (
    <Pressable
      onPress={() => recheckApi()}
      accessibilityRole="button"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`Backend unreachable at ${labelForCandidate(snap.host)}. Tap to retry.`}
      style={{
        position: "absolute",
        top: insets.top + BELOW_TOP_BAR,
        left: 16,
        right: 16,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: withAlpha(palette.error, 0.92),
        zIndex: 100,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: "#FFFFFF",
          fontFamily: palette.fonts.bodySemi,
          fontSize: 12,
          textAlign: "center",
        }}
      >
        Backend unreachable — tried {labelForCandidate(snap.host)} · tap to retry
      </Text>
    </Pressable>
  );
}
