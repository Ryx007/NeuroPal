import { useEffect, useRef } from "react";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";

import { useHomeMotion } from "./motion";

// Pal notices when your state changes: a small hop for "okay", a slow nod
// for "a bit off", and nothing for "overwhelmed" (Pal goes quiet by itself).
// Calm swaps the movement for a brief fade; Still does nothing. Only the
// Pal moves — the text beside it stays put. `enabled=false` renders the
// children untouched (Classic keeps its exact layout).
export function MoodHop({ mood, enabled = true, children }) {
  const motion = useHomeMotion();
  const y = useSharedValue(0);
  const o = useSharedValue(1);
  const prev = useRef(mood);

  useEffect(() => {
    if (prev.current === mood) return;
    prev.current = mood;
    if (!enabled || !motion.on || mood === "over") return;
    if (!motion.travels) {
      o.set(withSequence(withTiming(0.6, { duration: 260 }), withTiming(1, { duration: 520 })));
      return;
    }
    const p = motion.pal;
    const spring = { damping: 9 / Math.max(1, p.bounce * 0.8), stiffness: 260, mass: 0.6 };
    const to = mood === "okay" ? -p.hop : p.nod;
    y.set(withSequence(withTiming(to, { duration: mood === "okay" ? p.up : p.up * 2, easing: Easing.out(Easing.quad) }), withSpring(0, spring)));
  }, [mood, enabled, motion, o, y]);

  const animated = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateY: y.get() }] }));
  if (!enabled) return children;
  return <Animated.View style={animated}>{children}</Animated.View>;
}
