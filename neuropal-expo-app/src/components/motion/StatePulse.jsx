import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { useHomeMotion } from "./motion";

// One soft wash of `color` through its parent (absolutely filled, behind the
// parent's content) each time `state` changes after mount. `kind` picks the
// strength: "tile" (the check-in tile) or "backdrop" (the Signal background).
// Overwhelmed gets a gentler wash. Nothing at all when motion is Still.
export function StatePulse({ state, color, kind = "tile" }) {
  const motion = useHomeMotion();
  const o = useSharedValue(0);
  const prev = useRef(state);

  useEffect(() => {
    if (prev.current === state) return;
    prev.current = state;
    if (!state || !motion.on) return;
    const p = kind === "backdrop" ? motion.backdropWash : motion.statePulse;
    const peak = p.peak * (state === "red" ? motion.redSoftening : 1);
    o.set(
      withSequence(
        withTiming(peak, { duration: p.up, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: p.down, easing: Easing.inOut(Easing.quad) })
      )
    );
  }, [state, motion, kind, o]);

  const animated = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }, animated]} />;
}
