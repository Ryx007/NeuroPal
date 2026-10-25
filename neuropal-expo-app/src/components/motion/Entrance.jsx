import { useEffect } from "react";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { useHomeMotion } from "./motion";

// Fade + small rise into place when first mounted, `index` steps after the
// previous one (Signal Home tiles). Calm fades without the rise; Still shows
// everything at once. Plays once per mount, never again while you read.
export function Entrance({ index = 0, style, children }) {
  const motion = useHomeMotion();
  const t = useSharedValue(motion.on ? 0 : 1);
  const rise = motion.entrance.rise;

  useEffect(() => {
    if (!motion.on) {
      t.set(1);
      return;
    }
    const e = motion.entrance;
    t.set(withDelay(index * e.stagger, withTiming(1, { duration: e.duration, easing: Easing.out(Easing.cubic) })));
    // Mount only: re-ordering tiles later must not replay it.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const animated = useAnimatedStyle(() => ({
    opacity: t.get(),
    transform: [{ translateY: (1 - t.get()) * rise }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
