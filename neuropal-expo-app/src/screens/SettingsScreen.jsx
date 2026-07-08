import Slider from "@react-native-community/slider";
import { useDispatch, useSelector } from "react-redux";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

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
import { VoicePicker } from "../components/VoicePicker";
import { usePalette, useTheme } from "../theme/ThemeProvider";
import { withAlpha } from "../components/primitives";

// D2 — the old Tweaks sheet as a full Settings screen, reached from the
// drawer. Grouped Appearance / Reading / Audio, with a live typography
// preview. Every control keeps its original uiSlice dispatch — these are
// accessibility-critical (dyslexia font, contrast theme, size/spacing/WPM).

const PREVIEW_TEXT =
  "In squeezed states of light, the noise of the electric field at certain phases falls below that of the vacuum state.";

export function SettingsScreen() {
  const palette = usePalette();
  const dispatch = useDispatch();
  const tweaks = useSelector(selectUiState);
  const { readerFontFamily } = useTheme();

  return (
    <KeyboardAwareScrollView
      enableOnAndroid
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 48,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          color: palette.onSurface,
          fontFamily: "SpaceGrotesk_700Bold",
          fontSize: 34,
          letterSpacing: -0.8,
        }}
      >
        Settings
      </Text>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_400Regular",
          fontSize: 16,
          marginTop: 4,
        }}
      >
        Shape the app around your brain, not the other way round.
      </Text>

      <Group title="Appearance">
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
            ["ruby", "Ruby"],
            ["cyan", "Cyan"],
            ["purple", "Purple"],
            ["green", "Green"],
          ]}
          onChange={(value) => dispatch(setAccent(value))}
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
      </Group>

      <Group title="Reading · typography">
        {/* live preview reacts to font / size / spacing */}
        <View
          style={{
            padding: 16,
            borderRadius: 14,
            backgroundColor: palette.surfaceLowest,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: palette.onSurface,
              fontFamily: readerFontFamily,
              fontSize: tweaks.fontSize,
              lineHeight: tweaks.fontSize * tweaks.lineSpacing,
            }}
          >
            {PREVIEW_TEXT}
          </Text>
        </View>
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
      </Group>

      <Group title="Reading · layout">
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
      </Group>

      <Group title="Audio">
        <SliderRow
          label="Words per minute"
          value={tweaks.wpm}
          min={120}
          max={950}
          step={10}
          formatter={(value) => `${Math.round(value)} wpm`}
          onChange={(value) => dispatch(setWpm(Math.round(value)))}
        />
        <SegmentRow
          label="Tone"
          value={tweaks.voice}
          entries={[
            ["soft", "Soft"],
            ["natural", "Natural"],
            ["deep", "Deep"],
          ]}
          onChange={(value) => dispatch(setVoice(value))}
        />
        <View style={{ height: 6 }} />
        <VoicePicker />
      </Group>
    </KeyboardAwareScrollView>
  );
}

function Group({ title, children }) {
  const palette = usePalette();
  return (
    <View
      style={{
        marginTop: 22,
        borderRadius: 20,
        backgroundColor: palette.surfaceContainer,
        padding: 18,
      }}
    >
      <Text
        style={{
          color: palette.accent,
          fontFamily: "Inter_600SemiBold",
          fontSize: 12,
          letterSpacing: 1.8,
          marginBottom: 14,
        }}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function SegmentRow({ label, value, entries, onChange }) {
  const palette = usePalette();

  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          letterSpacing: 2,
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
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${display}`}
              accessibilityState={{ selected }}
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
                  fontFamily: selected ? "Inter_600SemiBold" : "Inter_500Medium",
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

function SliderRow({ label, value, min, max, step, formatter, onChange }) {
  const palette = usePalette();

  return (
    <View style={{ marginBottom: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 4,
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
        accessibilityLabel={label}
      />
    </View>
  );
}
