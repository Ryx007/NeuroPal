import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getApiStatus, recheckApi, subscribeApi } from "../store/ApiLink";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "./primitives";

// Issue 0 — never a silent dead app again. Whenever the /healthz probe
// declares every candidate unreachable, this slim banner floats above ALL
// screens naming the host that was tried. Tap = retry. Auto-hides the
// moment any candidate answers.

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

  if (snap.state !== "down") return null;

  return (
    <Pressable
      onPress={() => recheckApi()}
      accessibilityRole="button"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`Backend unreachable at ${snap.host}. Tap to retry.`}
      style={{
        position: "absolute",
        top: insets.top,
        left: 0,
        right: 0,
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: withAlpha(palette.error, 0.92),
        zIndex: 100,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: "#FFFFFF",
          fontFamily: "Inter_600SemiBold",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        Backend unreachable — tried {String(snap.host).replace(/^https?:\/\//, "")} · tap to retry
      </Text>
    </Pressable>
  );
}
