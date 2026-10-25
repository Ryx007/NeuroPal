import { Pressable } from "react-native";
import { useSharedValue, withSpring } from "react-native-reanimated";

import { useHomeMotion } from "./motion";
import { PanelPressContext } from "./pressContext";

// A Pressable for whole Signal tiles: while your finger is down, the panel
// inside sinks into its hard offset shadow (the same move NpPrimaryButton
// makes). Lively/Wild spring there; Calm and Still move instantly, like the
// button. Takes every Pressable prop (role, label, onPress, style…).
export function PressTile({ children, onPressIn, onPressOut, ...rest }) {
  const motion = useHomeMotion();
  const press = useSharedValue(0);
  const to = (v) => {
    if (motion.press) press.set(withSpring(v, motion.press));
    else press.set(v);
  };
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        to(1);
        if (onPressIn) onPressIn(e);
      }}
      onPressOut={(e) => {
        to(0);
        if (onPressOut) onPressOut(e);
      }}
    >
      <PanelPressContext.Provider value={press}>{children}</PanelPressContext.Provider>
    </Pressable>
  );
}
