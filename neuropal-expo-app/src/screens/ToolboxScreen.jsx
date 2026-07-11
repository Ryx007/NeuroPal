import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import Toast from "../components/toast";

import { Linking } from "react-native";
import { AnchorEditor } from "../components/planner/AnchorEditor";
import { addToDeviceCalendar } from "../services/calendar";
import { cancelScheduled, scheduleAt } from "../services/notify";
import {
  addAnchor,
  addTodo,
  clearDoneTodos,
  removeAnchor,
  removeTodo,
  setAnchorStatus,
  toggleTodo,
  updateAnchor,
} from "../store/slices/homeSlice";
import { formatTime12 } from "../data/mockData";
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

export function ToolboxScreen() {
  const palette = usePalette();

  return (
    <KeyboardAwareScrollView
      className="flex-1"
      enableOnAndroid
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 40,
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
        Toolbox
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

      <PlannerCard />
      <TodoCard />
      <PomodoroCard />
      <RemindersCard />
    </KeyboardAwareScrollView>
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
        : "Back to it — next focus block is ready.",
      { category: "pomodoro" }
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

// Steppers nudge ±5; the number itself is a text field, so ANY length
// (1–600 min) can be typed directly — 90-minute deep-work block, 2-minute
// reset, whatever the day needs.
function DurationStepper({ label, value, onChange, disabled }) {
  const palette = usePalette();
  const [draft, setDraft] = useState(null); // null = not editing

  function commit() {
    const n = parseInt(draft, 10);
    if (n > 0) onChange(n);
    setDraft(null);
  }

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
        <TextInput
          value={draft ?? String(value)}
          editable={!disabled}
          onFocus={() => setDraft(String(value))}
          onChangeText={(t) => setDraft(t.replace(/\D/g, "").slice(0, 3))}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          accessibilityLabel={`${label} minutes`}
          style={{
            color: palette.onSurface,
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 16,
            minWidth: 52,
            textAlign: "center",
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: draft !== null ? palette.surfaceHigh : "transparent",
          }}
        />
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 11,
          }}
        >
          min
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
  // P8: medication reminders ride their own Android channel (MAX importance,
  // heavier vibration) so a dose alert never feels like a nudge.
  const [category, setCategory] = useState("reminder");

  async function add(minutes) {
    const text = title.trim();
    if (!text) {
      Toast.show({ type: "error", text1: "Write the reminder first" });
      return;
    }
    const at = minutes === null ? nextMorning() : Date.now() + minutes * 60000;
    const id = `r-${at}-${Math.random().toString(36).slice(2, 7)}`;
    const notificationId = await scheduleAt(
      new Date(at),
      category === "medication" ? "Medication" : "Reminder",
      text,
      { category, data: { refId: id } }
    );
    dispatch(
      addReminder({
        id,
        title: text,
        at,
        notificationId,
        category,
        done: false,
      })
    );
    setTitle("");
    setCustomMin("");
    // Be honest about what will actually fire: with no OS scheduling
    // (web, or notification permission denied) the in-app pop-up is the
    // only alarm — say so instead of claiming a push that won't come.
    if (notificationId) {
      Toast.show({
        type: "success",
        text1: "Reminder set",
        text2: new Date(at).toLocaleString(),
      });
    } else {
      Toast.show({
        type: "info",
        text1: "Reminder set (in-app pop-up)",
        text2:
          Platform.OS === "web"
            ? "Browsers can't schedule notifications — you'll get the pop-up while the app is open."
            : "System notifications are off for NeuroPal — enable them in Android settings for pocket alerts.",
      });
    }
  }

  // "Sync" without OAuth: a prefilled Google Calendar event page — one tap
  // to save, and Google handles its own cross-device notifications.
  function addToGoogleCalendar(item) {
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = (ms) => {
      const d = new Date(ms);
      return (
        d.getUTCFullYear() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) +
        "T" +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        "00Z"
      );
    };
    const url =
      "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      `&text=${encodeURIComponent(item.title)}` +
      `&dates=${stamp(item.at)}/${stamp(item.at + 15 * 60000)}` +
      `&details=${encodeURIComponent("Set in NeuroPal")}`;
    Linking.openURL(url);
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

      {/* P8: category → Android channel (importance + vibration) */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        {[
          ["reminder", "Reminder"],
          ["medication", "Medication"],
        ].map(([key, label]) => {
          const selected = category === key;
          return (
            <Pressable
              key={key}
              onPress={() => setCategory(key)}
              accessibilityRole="button"
              accessibilityLabel={`Category: ${label}`}
              accessibilityState={{ selected }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: selected
                  ? withAlpha(palette.accent, 0.14)
                  : palette.surfaceHigh,
                borderWidth: 1,
                borderColor: selected ? withAlpha(palette.accent, 0.45) : "transparent",
              }}
            >
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
              {Platform.OS !== "web" ? (
                <Pressable
                  onPress={async () => {
                    try {
                      await addToDeviceCalendar({ title: item.title, startMs: item.at });
                      Toast.show({ type: "success", text1: "Added to your calendar" });
                    } catch (error) {
                      Toast.show({ type: "error", text1: "Calendar", text2: error?.message });
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.title} to the device calendar`}
                  style={{ padding: 6 }}
                >
                  <MaterialIcons name="event-available" size={18} color={palette.accent} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => addToGoogleCalendar(item)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${item.title} to Google Calendar`}
                style={{ padding: 6 }}
              >
                <MaterialIcons name="event" size={18} color={palette.tertiary} />
              </Pressable>
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

// ---------------------------------------------------------------------------
// Planner — today's timed anchors (meds, breaks, study blocks). The Home
// "Next anchor" card reads from this same list.
// ---------------------------------------------------------------------------

function PlannerCard() {
  const palette = usePalette();
  const dispatch = useDispatch();
  const anchors = useSelector((s) => s.home.anchors);
  const [editor, setEditor] = useState(null); // null | {anchor?}

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

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
        <MaterialIcons name="event-note" size={18} color={palette.accent} />
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
          TODAY'S PLAN
        </Text>
        <Pressable
          onPress={() => setEditor({})}
          accessibilityRole="button"
          accessibilityLabel="Add plan item"
          hitSlop={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 99,
            backgroundColor: withAlpha(palette.accent, 0.14),
          }}
        >
          <MaterialIcons name="add" size={14} color={palette.accent} />
          <Text
            style={{
              color: palette.accent,
              fontFamily: "Inter_600SemiBold",
              fontSize: 12,
            }}
          >
            Add
          </Text>
        </Pressable>
      </View>

      <View style={{ marginTop: 14, gap: 8 }}>
        {anchors.length === 0 ? (
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
            }}
          >
            No anchors yet — add meds, breaks, and study blocks to structure
            the day.
          </Text>
        ) : (
          anchors.map((anchor) => {
            const done = anchor.status === "done";
            const past =
              anchor.time.hour * 60 + anchor.time.minute < nowMin && !done;
            return (
              <View
                key={anchor.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: palette.surfaceHigh,
                  opacity: done ? 0.5 : 1,
                }}
              >
                <Pressable
                  onPress={() =>
                    dispatch(
                      setAnchorStatus({
                        id: anchor.id,
                        status: done ? "upcoming" : "done",
                      })
                    )
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={`${anchor.title} done`}
                  style={{ padding: 4 }}
                >
                  <MaterialIcons
                    name={done ? "check-circle" : "radio-button-unchecked"}
                    size={20}
                    color={done ? palette.secondary : palette.onSurfaceVariant}
                  />
                </Pressable>
                <Text
                  style={{
                    width: 62,
                    marginLeft: 6,
                    color: past ? palette.warn : palette.accent,
                    fontFamily: "JetBrainsMono_400Regular",
                    fontSize: 12,
                  }}
                >
                  {formatTime12(anchor.time)}
                </Text>
                <MaterialIcons
                  name={anchor.icon || "flag"}
                  size={16}
                  color={palette.onSurfaceVariant}
                  style={{ marginHorizontal: 6 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: palette.onSurface,
                      fontFamily: "Inter_500Medium",
                      fontSize: 14,
                      textDecorationLine: done ? "line-through" : "none",
                    }}
                  >
                    {anchor.title}
                  </Text>
                  {anchor.subtitle ? (
                    <Text
                      numberOfLines={1}
                      style={{
                        color: palette.onSurfaceVariant,
                        fontFamily: "Inter_400Regular",
                        fontSize: 11,
                      }}
                    >
                      {anchor.subtitle}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => setEditor({ anchor })}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${anchor.title}`}
                  style={{ padding: 6 }}
                >
                  <MaterialIcons name="edit" size={16} color={palette.onSurfaceVariant} />
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      <AnchorEditor
        visible={Boolean(editor)}
        anchor={editor?.anchor || null}
        onClose={() => setEditor(null)}
        onSave={(payload) => {
          if (payload.id) dispatch(updateAnchor(payload));
          else dispatch(addAnchor(payload));
          setEditor(null);
        }}
        onDelete={(id) => {
          dispatch(removeAnchor(id));
          setEditor(null);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// To-do list — free-running checklist, separate from the 3-item MVD.
// ---------------------------------------------------------------------------

function TodoCard() {
  const palette = usePalette();
  const dispatch = useDispatch();
  const todos = useSelector((s) => s.home.todos);
  const [text, setText] = useState("");
  const doneCount = todos.filter((t) => t.done).length;

  function add() {
    if (!text.trim()) return;
    dispatch(addTodo(text));
    setText("");
  }

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
        <MaterialIcons name="checklist" size={18} color={palette.secondary} />
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
          TO-DO LIST
        </Text>
        {doneCount > 0 ? (
          <Pressable
            onPress={() => dispatch(clearDoneTodos())}
            accessibilityRole="button"
            accessibilityLabel="Clear completed todos"
            hitSlop={8}
          >
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 12,
              }}
            >
              Clear done ({doneCount})
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={add}
          placeholder="Add to the list…"
          placeholderTextColor={palette.onSurfaceVariant}
          accessibilityLabel="New todo"
          style={{
            flex: 1,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: palette.surfaceHigh,
            color: palette.onSurface,
            fontFamily: "Inter_400Regular",
            fontSize: 15,
          }}
        />
        <Pressable
          onPress={add}
          disabled={!text.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add todo"
          style={{
            width: 46,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: withAlpha(palette.secondary, 0.16),
            borderWidth: 1,
            borderColor: withAlpha(palette.secondary, 0.4),
            opacity: text.trim() ? 1 : 0.4,
          }}
        >
          <MaterialIcons name="add" size={20} color={palette.secondary} />
        </Pressable>
      </View>

      <View style={{ marginTop: 12, gap: 8 }}>
        {todos.map((todo) => (
          <View
            key={todo.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 12,
              borderRadius: 14,
              backgroundColor: palette.surfaceHigh,
              opacity: todo.done ? 0.55 : 1,
            }}
          >
            <Pressable
              onPress={() => dispatch(toggleTodo(todo.id))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: todo.done }}
              accessibilityLabel={todo.title}
              style={{ padding: 4 }}
            >
              <MaterialIcons
                name={todo.done ? "check-circle" : "radio-button-unchecked"}
                size={20}
                color={todo.done ? palette.secondary : palette.onSurfaceVariant}
              />
            </Pressable>
            <Text
              style={{
                flex: 1,
                marginLeft: 10,
                color: palette.onSurface,
                fontFamily: "Inter_500Medium",
                fontSize: 14,
                textDecorationLine: todo.done ? "line-through" : "none",
              }}
            >
              {todo.title}
            </Text>
            <Pressable
              onPress={() => dispatch(removeTodo(todo.id))}
              accessibilityLabel={`Delete todo ${todo.title}`}
              style={{ padding: 6 }}
            >
              <MaterialIcons name="close" size={18} color={palette.onSurfaceVariant} />
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
