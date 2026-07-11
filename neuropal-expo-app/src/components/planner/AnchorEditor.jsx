import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Toast from "../toast";

import { getCurrentCoords } from "../../services/locationAnchors";
import { usePalette } from "../../theme/ThemeProvider";
import { withAlpha } from "../primitives";

// Editor for a timed anchor (medication, break, study block…). Used from the
// Home "Next anchor" card and the Toolbox planner. Pass `anchor` to edit an
// existing one, or null to create.

const KINDS = [
  ["medication", "Meds"],
  ["free-breakfast", "Break"],
  ["school", "Study"],
  ["directions-walk", "Move"],
  ["flag", "Other"],
];

export function AnchorEditor({ visible, anchor, onSave, onDelete, onClose }) {
  const palette = usePalette();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [icon, setIcon] = useState("flag");
  const [location, setLocation] = useState(null); // P8: {lat, lng, radius}
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(anchor?.title || "");
    setSubtitle(anchor?.subtitle || "");
    setHour(anchor?.time?.hour ?? new Date().getHours());
    setMinute(anchor?.time?.minute ?? 0);
    setIcon(anchor?.icon || "flag");
    setLocation(anchor?.location || null);
  }, [visible, anchor]);

  function save() {
    if (!title.trim()) return;
    onSave({
      id: anchor?.id,
      title: title.trim(),
      subtitle: subtitle.trim(),
      hour,
      minute,
      icon,
      location,
    });
  }

  // P8 §12-approved location scope: pin the anchor to wherever the device
  // is right now; it then ALSO fires when you arrive (app open — see
  // services/locationAnchors.js for the honest scope note).
  async function toggleLocation() {
    if (location) {
      setLocation(null);
      return;
    }
    setLocating(true);
    try {
      const coords = await getCurrentCoords();
      setLocation({ ...coords, radius: 150 });
    } catch (error) {
      Toast.show({ type: "error", text1: "Location", text2: error?.message });
    } finally {
      setLocating(false);
    }
  }

  const timeField = (value, setValue, max, label) => (
    <View style={{ alignItems: "center" }}>
      <Pressable
        onPress={() => setValue((v) => (v + 1) % (max + 1))}
        accessibilityLabel={`Increase ${label}`}
        style={{ padding: 6 }}
      >
        <MaterialIcons name="keyboard-arrow-up" size={22} color={palette.onSurfaceVariant} />
      </Pressable>
      <TextInput
        value={String(value).padStart(2, "0")}
        onChangeText={(t) => {
          const n = parseInt(t.replace(/\D/g, ""), 10);
          if (!Number.isNaN(n)) setValue(Math.max(0, Math.min(max, n)));
          else if (t === "") setValue(0);
        }}
        keyboardType="number-pad"
        maxLength={2}
        accessibilityLabel={label}
        style={{
          width: 64,
          textAlign: "center",
          paddingVertical: 8,
          borderRadius: 12,
          backgroundColor: palette.surfaceHigh,
          color: palette.onSurface,
          fontFamily: "JetBrainsMono_400Regular",
          fontSize: 26,
        }}
      />
      <Pressable
        onPress={() => setValue((v) => (v - 1 + max + 1) % (max + 1))}
        accessibilityLabel={`Decrease ${label}`}
        style={{ padding: 6 }}
      >
        <MaterialIcons name="keyboard-arrow-down" size={22} color={palette.onSurfaceVariant} />
      </Pressable>
    </View>
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: withAlpha("#000000", 0.6),
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 400,
            borderRadius: 20,
            backgroundColor: palette.surfaceContainer,
            padding: 20,
          }}
        >
          <Text
            style={{
              color: palette.onSurface,
              fontFamily: "SpaceGrotesk_600SemiBold",
              fontSize: 17,
            }}
          >
            {anchor ? "Edit anchor" : "New anchor"}
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What? (e.g. Evening meds)"
            placeholderTextColor={palette.onSurfaceVariant}
            accessibilityLabel="Anchor title"
            style={{
              marginTop: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: palette.surfaceHigh,
              color: palette.onSurface,
              fontFamily: "Inter_400Regular",
              fontSize: 15,
            }}
          />
          <TextInput
            value={subtitle}
            onChangeText={setSubtitle}
            placeholder="Details (optional)"
            placeholderTextColor={palette.onSurfaceVariant}
            accessibilityLabel="Anchor details"
            style={{
              marginTop: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: palette.surfaceHigh,
              color: palette.onSurface,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              marginTop: 14,
            }}
          >
            {timeField(hour, setHour, 23, "Hour")}
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "JetBrainsMono_400Regular",
                fontSize: 26,
              }}
            >
              :
            </Text>
            {timeField(minute, setMinute, 59, "Minute")}
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 14,
            }}
          >
            {KINDS.map(([value, label]) => {
              const selected = icon === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setIcon(value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Kind ${label}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 99,
                    backgroundColor: selected
                      ? withAlpha(palette.accent, 0.14)
                      : palette.surfaceHigh,
                    borderWidth: 1,
                    borderColor: selected
                      ? withAlpha(palette.accent, 0.45)
                      : "transparent",
                  }}
                >
                  <MaterialIcons
                    name={value}
                    size={15}
                    color={selected ? palette.accent : palette.onSurfaceVariant}
                  />
                  <Text
                    style={{
                      color: selected ? palette.accent : palette.onSurfaceVariant,
                      fontFamily: "Inter_500Medium",
                      fontSize: 12,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* P8: place-based anchor toggle */}
          <Pressable
            onPress={toggleLocation}
            disabled={locating}
            accessibilityRole="button"
            accessibilityLabel={
              location ? "Remove attached location" : "Attach current location"
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: location
                ? withAlpha(palette.accent, 0.12)
                : palette.surfaceHigh,
              borderWidth: 1,
              borderColor: location ? withAlpha(palette.accent, 0.4) : "transparent",
              opacity: locating ? 0.5 : 1,
            }}
          >
            <MaterialIcons
              name={location ? "location-on" : "add-location-alt"}
              size={16}
              color={location ? palette.accent : palette.onSurfaceVariant}
            />
            <Text
              style={{
                flex: 1,
                color: location ? palette.accent : palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              {locating
                ? "Getting location…"
                : location
                  ? `Fires here too (±${location.radius}m) — tap to remove`
                  : "Also fire at my current location"}
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
            {anchor && onDelete ? (
              <Pressable
                onPress={() => onDelete(anchor.id)}
                accessibilityRole="button"
                accessibilityLabel="Delete anchor"
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                  backgroundColor: withAlpha(palette.error, 0.12),
                  borderWidth: 1,
                  borderColor: withAlpha(palette.error, 0.4),
                }}
              >
                <MaterialIcons name="delete-outline" size={18} color={palette.error} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel anchor edit"
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
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={!title.trim()}
              accessibilityRole="button"
              accessibilityLabel="Save anchor"
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                backgroundColor: withAlpha(palette.accent, 0.16),
                borderWidth: 1,
                borderColor: withAlpha(palette.accent, 0.45),
                opacity: title.trim() ? 1 : 0.4,
              }}
            >
              <Text
                style={{
                  color: palette.accent,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                Save
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
