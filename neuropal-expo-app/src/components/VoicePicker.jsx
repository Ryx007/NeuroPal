import { MaterialIcons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";

import { listVoices } from "../services/tts";
import { setVoiceId } from "../store/slices/uiSlice";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "./primitives";

// System-voice selection (item 8: "voices are very robotic"). The built-in
// tones (Soft/Natural/Deep) are just pitch presets over whatever voice the
// OS defaults to — usually the low-quality compact one. This lets the user
// pick a specific installed voice, with the higher-quality ones surfaced
// first, and preview each by tapping. Installing an "Enhanced"/"Neural"
// voice in the OS settings is what actually makes it sound human; this
// picker is how you then select it.

const SAMPLE = "This is how the reader will sound with this voice.";

export function VoicePicker() {
  const palette = usePalette();
  const dispatch = useDispatch();
  const selectedId = useSelector((s) => s.ui.voiceId);
  const [voices, setVoices] = useState(null); // null = loading
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    listVoices().then((v) => {
      if (active) setVoices(v);
    });
    return () => {
      active = false;
    };
  }, []);

  function preview(identifier) {
    Speech.stop();
    Speech.speak(SAMPLE, { voice: identifier, rate: 1.0 });
  }

  const enhanced = (voices || []).filter(
    (v) =>
      v.quality === "Enhanced" ||
      v.quality === Speech.VoiceQuality?.Enhanced ||
      /enhanced|premium|neural|natural|network/i.test(v.name || "")
  );
  const shown = expanded ? voices || [] : (voices || []).slice(0, 6);
  const selected = (voices || []).find((v) => v.identifier === selectedId);

  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text
          style={{
            flex: 1,
            color: palette.onSurface,
            fontFamily: "Inter_500Medium",
            fontSize: 14,
          }}
        >
          System voice
        </Text>
        <Text
          numberOfLines={1}
          style={{
            maxWidth: 160,
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
          }}
        >
          {selected ? selected.name : "System default"}
        </Text>
      </View>

      {voices === null ? (
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            marginTop: 8,
          }}
        >
          Loading installed voices…
        </Text>
      ) : voices.length === 0 ? (
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            lineHeight: 17,
            marginTop: 8,
          }}
        >
          No selectable voices on this device. The reader uses the platform
          default.
        </Text>
      ) : (
        <>
          {enhanced.length > 0 ? (
            <Text
              style={{
                color: palette.secondary,
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                marginTop: 8,
              }}
            >
              {enhanced.length} higher-quality voice
              {enhanced.length === 1 ? "" : "s"} available — these sound the
              most natural.
            </Text>
          ) : (
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 11,
                lineHeight: 16,
                marginTop: 8,
              }}
            >
              Only compact voices are installed. Install an “Enhanced” /
              “Neural” voice in your OS text-to-speech settings, then pick it
              here for a natural sound.
            </Text>
          )}

          <View style={{ marginTop: 10, gap: 6 }}>
            <VoiceRow
              name="System default"
              sub="Platform's default voice"
              active={!selectedId}
              onSelect={() => dispatch(setVoiceId(null))}
              onPreview={() => {
                Speech.stop();
                Speech.speak(SAMPLE, { rate: 1.0 });
              }}
            />
            {shown.map((v) => {
              const hq =
                v.quality === "Enhanced" ||
                v.quality === Speech.VoiceQuality?.Enhanced ||
                /enhanced|premium|neural|natural|network/i.test(v.name || "");
              return (
                <VoiceRow
                  key={v.identifier}
                  name={v.name || v.identifier}
                  sub={`${v.language || ""}${hq ? " · Enhanced" : ""}`}
                  hq={hq}
                  active={selectedId === v.identifier}
                  onSelect={() => dispatch(setVoiceId(v.identifier))}
                  onPreview={() => preview(v.identifier)}
                />
              );
            })}
          </View>

          {voices.length > 6 ? (
            <Pressable
              onPress={() => setExpanded((e) => !e)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Show fewer voices" : "Show all voices"}
              style={{ paddingVertical: 10, alignItems: "center" }}
            >
              <Text
                style={{
                  color: palette.accent,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                }}
              >
                {expanded ? "Show fewer" : `Show all ${voices.length} voices`}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

function VoiceRow({ name, sub, hq, active, onSelect, onPreview }) {
  const palette = usePalette();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderRadius: 12,
        backgroundColor: active
          ? withAlpha(palette.accent, 0.12)
          : palette.surfaceHigh,
        borderWidth: 1,
        borderColor: active ? withAlpha(palette.accent, 0.45) : "transparent",
      }}
    >
      <Pressable
        onPress={onSelect}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Use voice ${name}`}
        style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
      >
        <MaterialIcons
          name={active ? "radio-button-checked" : "radio-button-unchecked"}
          size={18}
          color={active ? palette.accent : palette.onSurfaceVariant}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text
            numberOfLines={1}
            style={{
              color: palette.onSurface,
              fontFamily: "Inter_500Medium",
              fontSize: 13,
            }}
          >
            {name}
          </Text>
          {sub ? (
            <Text
              numberOfLines={1}
              style={{
                color: hq ? palette.secondary : palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 11,
              }}
            >
              {sub}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        onPress={onPreview}
        accessibilityRole="button"
        accessibilityLabel={`Preview ${name}`}
        hitSlop={8}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: withAlpha(palette.accent, 0.1),
        }}
      >
        <MaterialIcons name="volume-up" size={17} color={palette.accent} />
      </Pressable>
    </View>
  );
}
