import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import WheelColorPicker from "react-native-wheel-color-picker";

import { usePalette } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";

// Full color picker for the notes pen: HSV wheel + brightness slider (the
// wheel package provides both) and a hex field that accepts #RGB / #RRGGBB.
// Wheel drags and hex typing stay in sync both ways.

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHex(input) {
  const m = String(input).trim().match(HEX_RE);
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex}`;
}

export function ColorPickerSheet({ visible, initialColor, onPick, onClose }) {
  const palette = usePalette();
  const [color, setColor] = useState(initialColor || "#ff7f8e");
  const [hexText, setHexText] = useState(initialColor || "#ff7f8e");
  const [hexValid, setHexValid] = useState(true);

  useEffect(() => {
    if (visible) {
      const start = normalizeHex(initialColor) || "#ff7f8e";
      setColor(start);
      setHexText(start);
      setHexValid(true);
    }
  }, [visible, initialColor]);

  function onWheelChange(next) {
    setColor(next);
    setHexText(next);
    setHexValid(true);
  }

  function onHexChange(text) {
    setHexText(text);
    const normalized = normalizeHex(text);
    setHexValid(Boolean(normalized));
    if (normalized) setColor(normalized);
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      {/* lifts the dialog above the keyboard on Android too (edge-to-edge);
          the scroll view keeps the hex field reachable when the dialog no
          longer fits (large text, keyboard up). The wheel's own drag still
          wins over the scroll (it blocks the native responder). */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {/* the scrim: tap to close, but not a stop for screen readers (an
          unlabelled "button"; on iOS an accessible parent would also hide
          the whole dialog) */}
      <Pressable
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
        style={{
          flex: 1,
          backgroundColor: withAlpha("#000000", 0.6),
        }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 20 }}
          keyboardShouldPersistTaps="handled"
        >
        <Pressable
          onPress={() => {}}
          accessible={false}
          style={{
            width: "100%",
            maxWidth: 380,
            borderRadius: 20,
            backgroundColor: palette.surfaceContainer,
            padding: 20,
          }}
        >
          <Text
            style={{
              color: palette.onSurface,
              fontFamily: palette.fonts.displaySemi,
              fontSize: 17,
            }}
          >
            Pen color
          </Text>

          <View style={{ height: 260, marginTop: 12 }}>
            <WheelColorPicker
              color={color}
              onColorChangeComplete={onWheelChange}
              onColorChange={onWheelChange}
              thumbSize={26}
              sliderSize={26}
              gapSize={16}
              swatches={false}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginTop: 18,
            }}
          >
            <View
              accessibilityLabel={`Color preview ${color}`}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: color,
                borderWidth: 2,
                borderColor: palette.surfaceHighest,
              }}
            />
            <TextInput
              value={hexText}
              onChangeText={onHexChange}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="#RRGGBB"
              placeholderTextColor={palette.onSurfaceVariant}
              accessibilityLabel="Hex color code"
              style={{
                flex: 1,
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderRadius: 12,
                backgroundColor: palette.surfaceHigh,
                color: palette.onSurface,
                fontFamily: palette.fonts.mono,
                fontSize: 15,
                borderWidth: 1,
                borderColor: hexValid
                  ? "transparent"
                  : withAlpha(palette.error, 0.6),
              }}
            />
          </View>
          {!hexValid ? (
            <Text
              accessibilityRole="alert"
              style={{
                color: palette.error,
                fontFamily: palette.fonts.body,
                fontSize: 12,
                marginTop: 6,
              }}
            >
              Use #RGB or #RRGGBB, e.g. #FF7F8E
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel color pick"
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: palette.surfaceHigh,
              }}
            >
              <Text
                style={{
                  color: palette.onSurfaceVariant,
                  fontFamily: palette.fonts.bodySemi,
                  fontSize: 14,
                }}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onPick(color)}
              accessibilityRole="button"
              accessibilityLabel="Use this color"
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: withAlpha(palette.accent, 0.16),
                borderWidth: 1,
                borderColor: withAlpha(palette.accent, 0.45),
              }}
            >
              <Text
                style={{
                  color: palette.accent,
                  fontFamily: palette.fonts.bodySemi,
                  fontSize: 14,
                }}
              >
                Use color
              </Text>
            </Pressable>
          </View>
        </Pressable>
        </ScrollView>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
