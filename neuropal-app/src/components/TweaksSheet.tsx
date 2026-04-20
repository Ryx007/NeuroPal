import React, { useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";

import type {
  AccentChoice,
  Density,
  ReaderFont,
  ReaderLayout,
  ThemeChoice,
  Voice,
} from "@/models/types";
import { useTweaks } from "@/state/tweaks";
import { usePalette } from "@/theme/ThemeProvider";

import { NpGhostButton, withAlpha } from "./primitives";

export interface TweaksSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function TweaksSheet({ visible, onClose }: TweaksSheetProps) {
  const palette = usePalette();
  const tweaks = useTweaks();
  const slideY = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    Animated.timing(slideY, {
      toValue: visible ? 0 : 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, slideY]);

  const translateY = slideY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Dimensions.get("window").height],
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

          <SegmentRow<ThemeChoice>
            label="Theme"
            value={tweaks.theme}
            onChange={tweaks.setTheme}
            entries={[
              ["dark", "Dark"],
              ["sepia", "Sepia"],
              ["light", "Light"],
              ["contrast", "Contrast"],
            ]}
          />
          <SegmentRow<AccentChoice>
            label="Accent hue"
            value={tweaks.accent}
            onChange={tweaks.setAccent}
            entries={[
              ["blue", "Blue"],
              ["cyan", "Cyan"],
              ["purple", "Purple"],
              ["green", "Green"],
            ]}
          />
          <SegmentRow<ReaderFont>
            label="Reader font"
            value={tweaks.readerFont}
            onChange={tweaks.setReaderFont}
            entries={[
              ["inter", "Inter"],
              ["atkinson", "Atkinson"],
              ["dyslexic", "Dyslexic"],
              ["lora", "Lora"],
              ["fraunces", "Fraunces"],
            ]}
          />
          <SegmentRow<ReaderLayout>
            label="Reader layout"
            value={tweaks.readerLayout}
            onChange={tweaks.setReaderLayout}
            entries={[
              ["split", "Split"],
              ["focus", "Focus"],
              ["paginated", "Paginated"],
            ]}
          />
          <SegmentRow<Density>
            label="Density"
            value={tweaks.density}
            onChange={tweaks.setDensity}
            entries={[
              ["calm", "Calm"],
              ["dense", "Dense"],
            ]}
          />

          <View style={{ height: 8 }} />
          <SliderRow
            label="Font size"
            value={tweaks.fontSize}
            min={14}
            max={28}
            step={1}
            formatter={(v) => `${Math.round(v)}pt`}
            onChange={tweaks.setFontSize}
          />
          <SliderRow
            label="Line spacing"
            value={tweaks.lineSpacing}
            min={1.3}
            max={2.2}
            step={0.1}
            formatter={(v) => v.toFixed(2)}
            onChange={tweaks.setLineSpacing}
          />
          <SliderRow
            label="Words per minute"
            value={tweaks.wpm}
            min={120}
            max={400}
            step={10}
            formatter={(v) => `${Math.round(v)} wpm`}
            onChange={(v) => tweaks.setWpm(Math.round(v))}
          />

          <SegmentRow<Voice>
            label="Voice profile"
            value={tweaks.voice}
            onChange={tweaks.setVoice}
            entries={[
              ["soft", "Soft"],
              ["natural", "Natural"],
              ["deep", "Deep"],
            ]}
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

function SegmentRow<T extends string>({
  label,
  value,
  entries,
  onChange,
}: {
  label: string;
  value: T;
  entries: [T, string][];
  onChange: (v: T) => void;
}) {
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatter: (v: number) => string;
  onChange: (v: number) => void;
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
