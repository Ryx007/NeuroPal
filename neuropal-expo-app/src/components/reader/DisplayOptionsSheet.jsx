import Slider from "@react-native-community/slider";
import { Modal, Pressable, Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";

import { selectUiState } from "../../store/selectors";
import {
  setFontSize,
  setLineSpacing,
  setReaderFont,
  setTheme,
} from "../../store/slices/uiSlice";
import { usePalette } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";

// D8 — the Play-Books "Aa" display options: the reader-relevant subset of
// Settings (same uiSlice store, second entry point for accessibility reach).

const FONTS = [
  ["inter", "Inter"],
  ["atkinson", "Atkinson"],
  ["dyslexic", "Dyslexic"],
  ["lora", "Lora"],
  ["fraunces", "Fraunces"],
];
const THEMES = [
  ["dark", "Dark"],
  ["sepia", "Sepia"],
  ["light", "Light"],
  ["contrast", "Contrast"],
];

export function DisplayOptionsSheet({ visible, onClose }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const tweaks = useSelector(selectUiState);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: withAlpha("#000000", 0.45),
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: withAlpha(palette.surfaceContainer, 0.98),
            padding: 20,
            paddingBottom: 30,
          }}
        >
          <Text
            style={{
              color: palette.onSurface,
              fontFamily: "SpaceGrotesk_600SemiBold",
              fontSize: 17,
              marginBottom: 14,
            }}
          >
            Display options
          </Text>

          <Row label="THEME">
            {THEMES.map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                selected={tweaks.theme === key}
                onPress={() => dispatch(setTheme(key))}
              />
            ))}
          </Row>
          <Row label="READER FONT">
            {FONTS.map(([key, label]) => (
              <Chip
                key={key}
                label={label}
                selected={tweaks.readerFont === key}
                onPress={() => dispatch(setReaderFont(key))}
              />
            ))}
          </Row>

          <SliderRow
            label="FONT SIZE"
            value={tweaks.fontSize}
            min={14}
            max={28}
            step={1}
            display={`${Math.round(tweaks.fontSize)}pt`}
            onChange={(v) => dispatch(setFontSize(v))}
          />
          <SliderRow
            label="LINE SPACING"
            value={tweaks.lineSpacing}
            min={1.3}
            max={2.2}
            step={0.1}
            display={tweaks.lineSpacing.toFixed(2)}
            onChange={(v) => dispatch(setLineSpacing(v))}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, children }) {
  const palette = usePalette();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_500Medium",
          fontSize: 10,
          letterSpacing: 1.6,
          marginBottom: 8,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
    </View>
  );
}

function Chip({ label, selected, onPress }) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        paddingHorizontal: 13,
        paddingVertical: 9,
        borderRadius: 12,
        backgroundColor: selected
          ? withAlpha(palette.accent, 0.14)
          : palette.surfaceHigh,
        borderWidth: 1,
        borderColor: selected ? withAlpha(palette.accent, 0.4) : "transparent",
      }}
    >
      <Text
        style={{
          color: selected ? palette.accent : palette.onSurface,
          fontFamily: "Inter_500Medium",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SliderRow({ label, value, min, max, step, display, onChange }) {
  const palette = usePalette();
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text
          style={{
            flex: 1,
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_500Medium",
            fontSize: 10,
            letterSpacing: 1.6,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: palette.accent,
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 12,
          }}
        >
          {display}
        </Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={onChange}
        minimumTrackTintColor={palette.accent}
        maximumTrackTintColor={withAlpha(palette.outlineVariant, 0.4)}
        thumbTintColor={palette.accent}
        accessibilityLabel={label}
      />
    </View>
  );
}
