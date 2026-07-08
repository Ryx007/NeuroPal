import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";

import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "./primitives";

// In-house toast (D5). Replaces react-native-toast-message, whose
// AnimatedContainer claims every ≥2px move at the CAPTURE phase — on a real
// phone taps always wobble past 2px, so its ✕ button gets its press stolen,
// and its unwired onPanResponderTerminate leaves the internal `panning` flag
// stuck true after one interrupted gesture, permanently blocking auto-hide
// ("Highlighted" toast that never leaves and can't be closed).
//
// Same call surface as before: Toast.show({type, text1, text2,
// visibilityTime?}), Toast.hide(). Here the card owns its whole lifecycle:
// its own 5s timer, its own ✕, its own swipe — nothing to fight with.

const AUTO_HIDE_MS = 5000;

let hostListener = null;
let counter = 0;

const Toast = {
  show(opts) {
    hostListener?.({ ...opts, key: `toast-${++counter}` });
  },
  hide() {
    hostListener?.(null);
  },
};
export default Toast;

export const TOAST_VISIBILITY_MS = AUTO_HIDE_MS;

// Mounted once in App.js, outside the navigator, floating over everything.
export function ToastHost() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    hostListener = setToast;
    return () => {
      if (hostListener === setToast) hostListener = null;
    };
  }, []);

  if (!toast) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 64,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 9999,
        elevation: 9999,
      }}
    >
      <ToastCard
        // key remounts the card per show() so the timer/animation restart
        key={toast.key}
        toast={toast}
        onDone={() => setToast(null)}
      />
    </View>
  );
}

function ToastCard({ toast, onDone }) {
  const palette = usePalette();
  const { type = "info", text1, text2, visibilityTime = AUTO_HIDE_MS } = toast;
  const tone =
    type === "error"
      ? palette.error
      : type === "success"
        ? palette.secondary
        : palette.accent;

  const progress = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // Own auto-hide: a plain timeout this card controls. Pausing while the
  // user is actively swiping is handled by the pan responder below.
  const timerRef = useRef(null);
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    Animated.timing(progress, {
      toValue: 0,
      duration: visibilityTime,
      useNativeDriver: false,
    }).start();
    timerRef.current = setTimeout(() => doneRef.current(), visibilityTime);
    return () => clearTimeout(timerRef.current);
  }, [enter, progress, visibilityTime]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => translateX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 70) {
          Animated.timing(translateX, {
            toValue: g.dx > 0 ? 500 : -500,
            duration: 140,
            useNativeDriver: true,
          }).start(() => doneRef.current());
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
      // A stolen gesture (scroll, drawer edge) must never wedge the card.
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    <Animated.View
      {...pan.panHandlers}
      style={{
        transform: [
          { translateX },
          {
            translateY: enter.interpolate({
              inputRange: [0, 1],
              outputRange: [-16, 0],
            }),
          },
        ],
        opacity: enter,
        width: "92%",
        maxWidth: 480,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: withAlpha(palette.surfaceContainer, 0.96),
        borderWidth: 1,
        borderColor: withAlpha(tone, 0.35),
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <MaterialIcons
          name={
            type === "error"
              ? "error-outline"
              : type === "success"
                ? "check-circle"
                : "info-outline"
          }
          size={20}
          color={tone}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          {text1 ? (
            <Text
              style={{
                color: palette.onSurface,
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
              }}
            >
              {text1}
            </Text>
          ) : null}
          {text2 ? (
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                marginTop: 2,
                lineHeight: 17,
              }}
            >
              {text2}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => doneRef.current()}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          hitSlop={12}
          style={{ padding: 6, marginLeft: 6 }}
        >
          <MaterialIcons name="close" size={18} color={palette.onSurfaceVariant} />
        </Pressable>
      </View>
      <Animated.View
        style={{
          height: 2,
          backgroundColor: tone,
          width: progress.interpolate({
            inputRange: [0, 1],
            outputRange: ["0%", "100%"],
          }),
        }}
      />
    </Animated.View>
  );
}
