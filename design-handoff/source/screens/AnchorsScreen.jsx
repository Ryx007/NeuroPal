import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Toast from "react-native-toast-message";

import { cancelScheduled, scheduleAt } from "../services/notify";
import {
  pausePhase,
  phaseCompleted,
  resetFocus,
  setDurations,
  startPhase,
} from "../store/slices/focusSlice";
import {
  addReminder,
  removeReminder,
  toggleReminderDone,
} from "../store/slices/remindersSlice";
import { usePalette } from "../theme/ThemeProvider";
import { withAlpha } from "../components/primitives";

// The time tab: a pomodoro focus timer + reminders. Both schedule real OS
// notifications (native), so they fire even with the app in the background.

export function AnchorsScreen() {
  const palette = usePalette();

  return (
    <ScrollView
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 160,
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
        Anchors
      </Text>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_400Regular",
          fontSize: 16,
          marginTop: 4,
        }}
      >
        Structure the session, then let go of the clock.
      </Text>

      <PomodoroCard />
      <RemindersCard />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Pomodoro
// ---------------------------------------------------------------------------

function PomodoroCard() {
  const palette = usePalette();
  const dispatch = useDispatch();
  const focus = useSelector((s) => s.focus);
  const [, forceTick] = useState(0);

  // Ticking display: remaining is derived from endsAt — a re-render twice a
  // second is all the "timer" there is. Phase completion is detected here.
  useEffect(() => {
    if (!focus.running) return undefined;
    const t = setInterval(() => {
      if (focus.endsAt && focus.endsAt <= Date.now()) {
        dispatch(phaseCompleted());
        Toast.show({
          type: "success",
          text1: focus.phase === "work" ? "Focus block done" : "Break over",
          text2:
            focus.phase === "work"
              ? `Take ${focus.breakMin} minutes — you earned them.`
              : "Ready for the next focus block.",
        });
      } else {
        forceTick((n) => n + 1);
      }
    }, 500);
    return () => clearInterval(t);
  }, [focus.running, focus.endsAt, focus.phase, focus.breakMin, dispatch]);

  const remainingMs =
    focus.running && focus.endsAt ? Math.max(0, focus.endsAt - Date.now()) : null;
  const phaseMin = focus.phase === "work" ? focus.workMin : focus.breakMin;
  const shownMs = remainingMs ?? phaseMin * 60000;
  const mm = String(Math.floor(shownMs / 60000)).padStart(2, "0");
  const ss = String(Math.floor((shownMs % 60000) / 1000)).padStart(2, "0");

  async function toggle() {
    if (focus.running) {
      await cancelScheduled(focus.notificationId);
      dispatch(pausePhase());
      return;
    }
    const endsAt = Date.now() + phaseMin * 60000;
    const notificationId = await scheduleAt(
      new Date(endsAt),
      focus.phase === "work" ? "Focus block done 🎯" : "Break over",
      focus.phase === "work"
        ? `${focus.workMin} minutes complete — time for a ${focus.breakMin} minute break.`
        : "Back to it — next focus block is ready."
    );
    dispatch(startPhase({ endsAt, notificationId }));
  }

  async function reset() {
    await cancelScheduled(focus.notificationId);
    dispatch(resetFocus());
  }

  const phaseColor = focus.phase === "work" ? palette.accent : palette.tertiary;

  return (
    <View
      style={{
        marginTop: 24,
        borderRadius: 24,
        backgroundColor: palette.surfaceContainer,
        padding: 20,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <MaterialIcons name="timer" size={18} color={phaseColor} />
        <View style={{ width: 8 }} />
        <Text
          style={{
            flex: 1,
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_600SemiBold",
            fontSize: 12,
            letterSpacing: 1.6,
          }}
        >
          {focus.phase === "work" ? "FOCUS" : "BREAK"} · POMODORO
        </Text>
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 12,
          }}
        >
          {focus.cyclesDone} done
        </Text>
      </View>

      <Text
        style={{
          color: palette.onSurface,
          fontFamily: "JetBrainsMono_400Regular",
          fontSize: 64,
          textAlign: "center",
          marginVertical: 18,
          letterSpacing: 2,
        }}
        accessibilityLabel={`${mm} minutes ${ss} seconds remaining`}
      >
        {mm}:{ss}
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 12 }}>
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={focus.running ? "Pause timer" : "Start timer"}
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: phaseColor,
          }}
        >
          <MaterialIcons
            name={focus.running ? "pause" : "play-arrow"}
            size={32}
            color={palette.onPrimary}
          />
        </Pressable>
        <Pressable
          onPress={reset}
          accessibilityRole="button"
          accessibilityLabel="Reset timer"
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.surfaceHigh,
          }}
        >
          <MaterialIcons name="replay" size={26} color={palette.onSurfaceVariant} />
        </Pressable>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 20,
        }}
      >
        <DurationStepper
          label="Focus"
          value={focus.workMin}
          disabled={focus.running}
          onChange={(v) => dispatch(setDurations({ workMin: v }))}
        />
        <DurationStepper
          label="Break"
          value={focus.breakMin}
          disabled={focus.running}
          onChange={(v) => dispatch(setDurations({ breakMin: v }))}
        />
      </View>

      {Platform.OS === "web" ? (
        <Text
          style={{
            marginTop: 14,
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 11,
          }}
        >
          On web the chime only sounds while the tab is open — the phone app
          notifies even in your pocket.
        </Text>
      ) : null}
    </View>
  );
}

function DurationStepper({ label, value, onChange, disabled }) {
  const palette = usePalette();
  return (
    <View style={{ alignItems: "center", opacity: disabled ? 0.4 : 1 }}>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          letterSpacing: 1.2,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(value - 5)}
          accessibilityLabel={`Decrease ${label}`}
          style={{ padding: 8 }}
        >
          <MaterialIcons name="remove" size={18} color={palette.onSurfaceVariant} />
        </Pressable>
        <Text
          style={{
            color: palette.onSurface,
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 16,
            minWidth: 52,
            textAlign: "center",
          }}
        >
          {value} min
        </Text>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(value + 5)}
          accessibilityLabel={`Increase ${label}`}
          style={{ padding: 8 }}
        >
          <MaterialIcons name="add" size={18} color={palette.onSurfaceVariant} />
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

const QUICK_OFFSETS = [
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "3h", minutes: 180 },
  { label: "Tmrw 9:00", minutes: null },
];

function nextMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function RemindersCard() {
  const palette = usePalette();
  const dispatch = useDispatch();
  const items = useSelector((s) => s.reminders.items);
  const [title, setTitle] = useState("");
  const [customMin, setCustomMin] = useState("");

  async function add(minutes) {
    const text = title.trim();
    if (!text) {
      Toast.show({ type: "error", text1: "Write the reminder first" });
      return;
    }
    const at = minutes === null ? nextMorning() : Date.now() + minutes * 60000;
    const notificationId = await scheduleAt(new Date(at), "Reminder", text);
    dispatch(
      addReminder({
        id: `r-${at}-${Math.random().toString(36).slice(2, 7)}`,
        title: text,
        at,
        notificationId,
        done: false,
      })
    );
    setTitle("");
    setCustomMin("");
    Toast.show({
      type: "success",
      text1: "Reminder set",
      text2: new Date(at).toLocaleString(),
    });
  }

  async function remove(item) {
    await cancelScheduled(item.notificationId);
    dispatch(removeReminder(item.id));
  }

  const upcoming = [...items].sort((a, b) => a.at - b.at);

  return (
    <View
      style={{
        marginTop: 20,
        borderRadius: 24,
        backgroundColor: palette.surfaceContainer,
        padding: 20,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <MaterialIcons name="notifications-active" size={18} color={palette.accent} />
        <View style={{ width: 8 }} />
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_600SemiBold",
            fontSize: 12,
            letterSpacing: 1.6,
          }}
        >
          REMINDERS
        </Text>
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Remind me to…"
        placeholderTextColor={palette.onSurfaceVariant}
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

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {QUICK_OFFSETS.map((q) => (
          <Pressable
            key={q.label}
            onPress={() => add(q.minutes)}
            accessibilityRole="button"
            accessibilityLabel={`Remind ${q.label}`}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: withAlpha(palette.accent, 0.12),
              borderWidth: 1,
              borderColor: withAlpha(palette.accent, 0.35),
            }}
          >
            <Text
              style={{
                color: palette.accent,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
              }}
            >
              {q.label}
            </Text>
          </Pressable>
        ))}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 999,
            backgroundColor: palette.surfaceHigh,
            paddingHorizontal: 12,
          }}
        >
          <TextInput
            value={customMin}
            onChangeText={setCustomMin}
            placeholder="min"
            placeholderTextColor={palette.onSurfaceVariant}
            keyboardType="number-pad"
            style={{
              width: 46,
              paddingVertical: 9,
              color: palette.onSurface,
              fontFamily: "JetBrainsMono_400Regular",
              fontSize: 13,
            }}
          />
          <Pressable
            onPress={() => {
              const m = parseInt(customMin, 10);
              if (m > 0) add(m);
            }}
            accessibilityLabel="Set custom reminder"
          >
            <MaterialIcons name="send" size={16} color={palette.accent} />
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 18, gap: 10 }}>
        {upcoming.length === 0 ? (
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
            }}
          >
            Nothing scheduled. Future you thanks present you in advance.
          </Text>
        ) : (
          upcoming.map((item) => (
            <View
              key={item.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 12,
                borderRadius: 14,
                backgroundColor: palette.surfaceHigh,
                opacity: item.done ? 0.5 : 1,
              }}
            >
              <Pressable
                onPress={() => dispatch(toggleReminderDone(item.id))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                accessibilityLabel={item.title}
                style={{ padding: 4 }}
              >
                <MaterialIcons
                  name={item.done ? "check-circle" : "radio-button-unchecked"}
                  size={20}
                  color={item.done ? palette.accent : palette.onSurfaceVariant}
                />
              </Pressable>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text
                  style={{
                    color: palette.onSurface,
                    fontFamily: "Inter_500Medium",
                    fontSize: 14,
                    textDecorationLine: item.done ? "line-through" : "none",
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{
                    color:
                      item.at < Date.now() && !item.done
                        ? palette.warn
                        : palette.onSurfaceVariant,
                    fontFamily: "JetBrainsMono_400Regular",
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  {new Date(item.at).toLocaleString()}
                </Text>
              </View>
              <Pressable
                onPress={() => remove(item)}
                accessibilityLabel={`Delete reminder ${item.title}`}
                style={{ padding: 6 }}
              >
                <MaterialIcons name="close" size={18} color={palette.onSurfaceVariant} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
