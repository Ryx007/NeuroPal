import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";

import {
  markReminderNotified,
  snoozeReminder,
  toggleReminderDone,
} from "../store/slices/remindersSlice";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "./primitives";

// The on-screen half of reminders. OS notifications only fire when
// permission was granted AND the platform supports scheduling (web never
// does) — this watcher guarantees a visible pop-up while the app is open,
// on every platform, by polling the store every few seconds for overdue
// items that haven't been surfaced yet.

const CHECK_MS = 5000;

export function ReminderPopup() {
  const palette = usePalette();
  const dispatch = useDispatch();
  const items = useSelector((s) => s.reminders.items);
  const [due, setDue] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const hit = items.find(
        (r) => !r.done && !r.notifiedAt && r.at <= now
      );
      if (hit) setDue(hit);
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, [items]);

  if (!due) return null;

  function dismiss(markDone) {
    dispatch(markReminderNotified(due.id));
    if (markDone) dispatch(toggleReminderDone(due.id));
    setDue(null);
  }

  function snooze() {
    dispatch(markReminderNotified(due.id));
    dispatch(snoozeReminder({ id: due.id, minutes: 10 }));
    setDue(null);
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => dismiss(false)}>
      <View
        style={{
          flex: 1,
          backgroundColor: withAlpha("#000000", 0.65),
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 380,
            borderRadius: 24,
            backgroundColor: palette.surfaceContainer,
            padding: 24,
            alignItems: "center",
            borderWidth: 1,
            borderColor: withAlpha(palette.accent, 0.35),
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: withAlpha(palette.accent, 0.14),
            }}
          >
            <MaterialIcons name="notifications-active" size={32} color={palette.accent} />
          </View>
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              letterSpacing: 2.4,
              marginTop: 14,
            }}
          >
            REMINDER
          </Text>
          <Text
            style={{
              color: palette.onSurface,
              fontFamily: "SpaceGrotesk_700Bold",
              fontSize: 20,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            {due.title}
          </Text>
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "JetBrainsMono_400Regular",
              fontSize: 12,
              marginTop: 6,
            }}
          >
            {new Date(due.at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
            <Pressable
              onPress={snooze}
              accessibilityRole="button"
              accessibilityLabel="Snooze 10 minutes"
              style={{
                paddingHorizontal: 18,
                paddingVertical: 12,
                borderRadius: 14,
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
                Snooze 10m
              </Text>
            </Pressable>
            <Pressable
              onPress={() => dismiss(true)}
              accessibilityRole="button"
              accessibilityLabel="Mark reminder done"
              style={{
                paddingHorizontal: 22,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: withAlpha(palette.accent, 0.18),
                borderWidth: 1,
                borderColor: withAlpha(palette.accent, 0.5),
              }}
            >
              <Text
                style={{
                  color: palette.accent,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
