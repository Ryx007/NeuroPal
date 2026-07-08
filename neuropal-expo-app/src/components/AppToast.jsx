import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import Toast from "react-native-toast-message";

import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "./primitives";

// D5 — every toast is dismissible three ways: the ✕ button, a horizontal
// swipe, and a 5-second auto-hide (visualized by the shrinking progress
// line). Styled as tinted liquid glass (D3).

const AUTO_HIDE_MS = 5000;

function ToastCard({ text1, text2, kind }) {
  const palette = usePalette();
  const tone =
    kind === "error"
      ? palette.error
      : kind === "success"
        ? palette.secondary
        : palette.accent;

  const progress = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: AUTO_HIDE_MS,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => translateX.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > 80) {
          Animated.timing(translateX, {
            toValue: g.dx > 0 ? 500 : -500,
            duration: 140,
            useNativeDriver: true,
          }).start(() => Toast.hide());
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <Animated.View
      {...pan.panHandlers}
      style={{
        transform: [{ translateX }],
        width: "92%",
        maxWidth: 480,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: withAlpha(palette.surfaceContainer, 0.94),
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
            kind === "error"
              ? "error-outline"
              : kind === "success"
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
          onPress={() => Toast.hide()}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          hitSlop={10}
          style={{ padding: 4, marginLeft: 6 }}
        >
          <MaterialIcons name="close" size={18} color={palette.onSurfaceVariant} />
        </Pressable>
      </View>
      {/* auto-hide progress line */}
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

export const toastConfig = {
  error: (props) => <ToastCard {...props} kind="error" />,
  success: (props) => <ToastCard {...props} kind="success" />,
  info: (props) => <ToastCard {...props} kind="info" />,
};

export const TOAST_VISIBILITY_MS = AUTO_HIDE_MS;
