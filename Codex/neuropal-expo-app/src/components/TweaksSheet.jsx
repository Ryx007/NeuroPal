import Slider from "@react-native-community/slider";
import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { selectUiState } from "../store/selectors";
import {
  setAccent,
  setDensity,
  setFontSize,
  setLineSpacing,
  setReaderFont,
  setReaderLayout,
  setTheme,
  setVoice,
  setWpm,
} from "../store/slices/uiSlice";
import { usePalette } from "../theme/ThemeProvider";
import { NpGhostButton, withAlpha } from "./primitives";

export function TweaksSheet({ visible, onClose }) {
  const palette = usePalette();
  const tweaks = useSelector(selectUiState);
  const dispatch = useDispatch();
  const slideY = useRef(new Animated.Value(1)).current;
  const { height } = useWindowDimensions();

  useEffect(() => {
    Animated.timing(slideY, {
      toValue: visible ? 0 : 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [slideY, visible]);

  const translateY = slideY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, height],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityLabel="Close tweaks"
      >
        <View
          style={{
            flex: 1,
            backgroundColor: withAlpha("#000000", 0.4),
          }}
        />
      </Pressable>
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          transform: [{ translateY }],
          maxHeight: "88%",
          backgroundColor: palette.surfaceContainer,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
        }}
      >
        <View
          style={{
            alignItems: "center",
            paddingVertical: 12,
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: withAlpha(palette.outline, 0.3),
            }}
          />
        </View>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              color: palette.onSurface,
              fontFamily: "SpaceGrotesk_700Bold",
              fontSize: 22,
              marginBottom: 20,
            }}
          >
            Tweaks
          </Text>

          <SegmentRow
            label="Theme"
            value={tweaks.theme}
            entries={[
              ["dark", "Dark"],
              ["sepia", "Sepia"],
              ["light", "Light"],
              ["contrast", "Contrast"],
            ]}
            onChange={(value) => dispatch(setTheme(value))}
          />
          <SegmentRow
            label="Accent hue"
            value={tweaks.accent}
            entries={[
              ["blue", "Blue"],
              ["cyan", "Cyan"],
              ["purple", "Purple"],
              ["green", "Green"],
            ]}
            onChange={(value) => dispatch(setAccent(value))}
          />
          <SegmentRow
            label="Reader font"
            value={tweaks.readerFont}
            entries={[
              ["inter", "Inter"],
              ["atkinson", "Atkinson"],
              ["dyslexic", "Dyslexic"],
              ["lora", "Lora"],
              ["fraunces", "Fraunces"],
            ]}
            onChange={(value) => dispatch(setReaderFont(value))}
          />
          <SegmentRow
            label="Reader layout"
            value={tweaks.readerLayout}
            entries={[
              ["split", "Split"],
              ["focus", "Focus"],
              ["paginated", "Paginated"],
            ]}
            onChange={(value) => dispatch(setReaderLayout(value))}
          />
          <SegmentRow
            label="Density"
            value={tweaks.density}
            entries={[
              ["calm", "Calm"],
              ["dense", "Dense"],
            ]}
            onChange={(value) => dispatch(setDensity(value))}
          />

          <View style={{ height: 8 }} />
          <SliderRow
            label="Font size"
            value={tweaks.fontSize}
            min={14}
            max={28}
            step={1}
            formatter={(value) => `${Math.round(value)}pt`}
            onChange={(value) => dispatch(setFontSize(value))}
          />
          <SliderRow
            label="Line spacing"
            value={tweaks.lineSpacing}
            min={1.3}
            max={2.2}
            step={0.1}
            formatter={(value) => value.toFixed(2)}
            onChange={(value) => dispatch(setLineSpacing(value))}
          />
          <SliderRow
            label="Words per minute"
            value={tweaks.wpm}
            min={120}
            max={400}
            step={10}
            formatter={(value) => `${Math.round(value)} wpm`}
            onChange={(value) => dispatch(setWpm(Math.round(value)))}
          />

          <SegmentRow
            label="Voice profile"
            value={tweaks.voice}
            entries={[
              ["soft", "Soft"],
              ["natural", "Natural"],
              ["deep", "Deep"],
            ]}
            onChange={(value) => dispatch(setVoice(value))}
          />

          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginTop: 28,
            }}
          >
            <NpGhostButton label="Done" icon="check" onPress={onClose} />
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function SegmentRow({ label, value, entries, onChange }) {
  const palette = usePalette();

  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          letterSpacing: 2,
          marginLeft: 4,
          marginBottom: 8,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {entries.map(([key, display]) => {
          const selected = key === value;

          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: selected
                  ? withAlpha(palette.accent, 0.14)
                  : palette.surfaceHigh,
                borderWidth: 1,
                borderColor: selected
                  ? withAlpha(palette.accent, 0.4)
                  : "transparent",
              }}
            >
              <Text
                style={{
                  color: selected ? palette.accent : palette.onSurface,
                  fontFamily: selected
                    ? "Inter_600SemiBold"
                    : "Inter_500Medium",
                  fontSize: 13,
                }}
              >
                {display}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  formatter,
  onChange,
}) {
  const palette = usePalette();

  return (
    <View style={{ marginBottom: 14 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 4,
          paddingHorizontal: 4,
        }}
      >
        <Text
          style={{
            flex: 1,
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_500Medium",
            fontSize: 11,
            letterSpacing: 2,
          }}
        >
          {label.toUpperCase()}
        </Text>
        <Text
          style={{
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 12,
            color: palette.accent,
          }}
        >
          {formatter(value)}
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
      />
    </View>
  );
}
