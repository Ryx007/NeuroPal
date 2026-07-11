import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Toast from "../components/toast";

import { formatTime12 } from "../data/mockData";
import { AnchorEditor } from "../components/planner/AnchorEditor";
import { anchorsInRange } from "../services/locationAnchors";
import { categoryForAnchor, scheduleAt } from "../services/notify";
import {
  selectNextAnchor,
  selectNervousState,
  selectRemainingTasks,
  selectResumeDocument,
  selectTasks,
} from "../store/selectors";
import {
  addAnchor,
  addTask,
  removeAnchor,
  removeTask,
  setAnchorStatus,
  setNervousState,
  toggleTask,
  updateAnchor,
} from "../store/slices/homeSlice";
import { usePalette } from "../theme/ThemeProvider";
import { SectionHeader, withAlpha } from "../components/primitives";

export function HomeScreen() {
  const palette = usePalette();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const tasks = useSelector(selectTasks);
  const remaining = useSelector(selectRemainingTasks);
  const nervous = useSelector(selectNervousState);
  const nextAnchor = useSelector(selectNextAnchor);
  const resume = useSelector(selectResumeDocument);
  const [editingMvd, setEditingMvd] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [anchorEditor, setAnchorEditor] = useState(null); // null | {anchor?}
  // Real name comes from the backend's LOCAL_MODE user via /auth/me;
  // single-user app, so the owner's name is the offline fallback too.
  const userName = useSelector((s) => s.auth.userName);
  const anchors = useSelector((s) => s.home.anchors);

  // P8 — place-based anchors, foreground pass: whenever Home gains focus,
  // any anchor pinned to a location fires if the phone is inside its radius
  // (cooldown-guarded inside anchorsInRange; never prompts for permission).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      anchorsInRange(anchors).then((hits) => {
        if (!active) return;
        for (const a of hits) {
          Toast.show({ type: "info", text1: a.title, text2: "You're at this anchor's spot." });
          scheduleAt(new Date(Date.now() + 1000), a.title, a.subtitle || "You've arrived.", {
            category: categoryForAnchor(a),
            data: { refId: `${a.id}-geo` },
          });
        }
      });
      return () => {
        active = false;
      };
    }, [anchors])
  );

  return (
    <ScrollView
      className="flex-1"
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
        Hello, {userName || "Ryx"}
      </Text>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: "Inter_400Regular",
          fontSize: 16,
          marginTop: 4,
        }}
      >
        One step at a time today.
      </Text>

      {nervous === "yellow" ? (
        <View
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 18,
            backgroundColor: withAlpha(palette.warn, 0.1),
            borderWidth: 1,
            borderColor: withAlpha(palette.warn, 0.35),
            flexDirection: "row",
          }}
        >
          <MaterialIcons
            name="lightbulb"
            size={18}
            color={palette.warn}
            style={{ marginRight: 10, marginTop: 2 }}
          />
          <Text
            style={{
              flex: 1,
              color: palette.onSurface,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            Starting from yellow. Reader is set to cocoon mode with softer
            contrast and a slower playback speed. Open the menu to tweak it.
          </Text>
        </View>
      ) : null}

      <View
        style={{
          marginTop: 26,
          padding: 20,
          borderRadius: 26,
          backgroundColor: palette.surfaceLow,
        }}
      >
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "SpaceGrotesk_600SemiBold",
            fontSize: 16,
          }}
        >
          How are you feeling right now?
        </Text>
        <View style={{ height: 14 }} />
        <StateOption
          selected={nervous === "green"}
          icon="sentiment-satisfied"
          label="I feel okay"
          tint={palette.secondary}
          onPress={() => dispatch(setNervousState("green"))}
        />
        <View style={{ height: 10 }} />
        <StateOption
          selected={nervous === "yellow"}
          icon="sentiment-neutral"
          label="Feeling a bit off"
          tint={palette.tertiary}
          onPress={() => dispatch(setNervousState("yellow"))}
        />
        <View style={{ height: 10 }} />
        <StateOption
          selected={nervous === "red"}
          icon="sentiment-very-dissatisfied"
          label="Help, I'm overwhelmed"
          tint={palette.error}
          onPress={() => {
            dispatch(setNervousState("red"));
            navigation.getParent()?.navigate("Emergency");
          }}
        />
      </View>

      <View style={{ marginTop: 30 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <SectionHeader
              label="Minimum viable day"
              trailing={`${remaining} tasks remaining`}
            />
          </View>
          <Pressable
            onPress={() => setEditingMvd((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={editingMvd ? "Done editing tasks" : "Edit tasks"}
            hitSlop={8}
            style={{
              marginLeft: 10,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 99,
              backgroundColor: editingMvd
                ? withAlpha(palette.accent, 0.16)
                : palette.surfaceContainer,
            }}
          >
            <Text
              style={{
                color: editingMvd ? palette.accent : palette.onSurfaceVariant,
                fontFamily: "Inter_600SemiBold",
                fontSize: 12,
              }}
            >
              {editingMvd ? "Done" : "Edit"}
            </Text>
          </Pressable>
        </View>
        <View style={{ height: 12 }} />
        {tasks.map((task) => (
          <MvdRow
            key={task.id}
            task={task}
            editing={editingMvd}
            onToggle={() => dispatch(toggleTask(task.id))}
            onRemove={() => dispatch(removeTask(task.id))}
          />
        ))}
        {editingMvd ? (
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginTop: 2,
            }}
          >
            <TextInput
              value={newTask}
              onChangeText={setNewTask}
              onSubmitEditing={() => {
                dispatch(addTask(newTask));
                setNewTask("");
              }}
              placeholder="Add a task for today…"
              placeholderTextColor={palette.onSurfaceVariant}
              accessibilityLabel="New task title"
              style={{
                flex: 1,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: palette.surfaceHigh,
                color: palette.onSurface,
                fontFamily: "Inter_400Regular",
                fontSize: 14,
              }}
            />
            <Pressable
              onPress={() => {
                dispatch(addTask(newTask));
                setNewTask("");
              }}
              disabled={!newTask.trim()}
              accessibilityRole="button"
              accessibilityLabel="Add task"
              style={{
                width: 46,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: withAlpha(palette.accent, 0.16),
                borderWidth: 1,
                borderColor: withAlpha(palette.accent, 0.4),
                opacity: newTask.trim() ? 1 : 0.4,
              }}
            >
              <MaterialIcons name="add" size={20} color={palette.accent} />
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={{ marginTop: 24 }}>
        {nextAnchor ? (
          <NextAnchor
            anchor={nextAnchor}
            onEdit={() => setAnchorEditor({ anchor: nextAnchor })}
            onDone={() =>
              dispatch(setAnchorStatus({ id: nextAnchor.id, status: "done" }))
            }
            onAdd={() => setAnchorEditor({})}
          />
        ) : (
          <Pressable
            onPress={() => setAnchorEditor({})}
            accessibilityRole="button"
            accessibilityLabel="Set your next anchor"
            style={{
              padding: 18,
              borderRadius: 22,
              borderWidth: 1.4,
              borderStyle: "dashed",
              borderColor: withAlpha(palette.outlineVariant, 0.4),
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <MaterialIcons name="add-alarm" size={22} color={palette.accent} />
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_500Medium",
                fontSize: 14,
              }}
            >
              Set your next anchor — meds, break, study block…
            </Text>
          </Pressable>
        )}
      </View>

      <AnchorEditor
        visible={Boolean(anchorEditor)}
        anchor={anchorEditor?.anchor || null}
        onClose={() => setAnchorEditor(null)}
        onSave={(payload) => {
          if (payload.id) {
            dispatch(updateAnchor(payload));
          } else {
            dispatch(addAnchor(payload));
          }
          setAnchorEditor(null);
        }}
        onDelete={(id) => {
          dispatch(removeAnchor(id));
          setAnchorEditor(null);
        }}
      />

      {resume ? (
        <View style={{ marginTop: 16 }}>
          <ResumeReading
            document={resume}
            onPress={() => navigation.navigate("Reader", { id: resume.id })}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function StateOption({ selected, icon, label, tint, onPress }) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        padding: 14,
        borderRadius: 18,
        backgroundColor: selected
          ? withAlpha(tint, 0.08)
          : palette.surfaceContainer,
        borderWidth: 1,
        borderColor: selected ? withAlpha(tint, 0.4) : "transparent",
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: withAlpha(tint, 0.12),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name={icon} size={24} color={tint} />
      </View>
      <View style={{ width: 12 }} />
      <Text
        style={{
          flex: 1,
          color: palette.onSurface,
          fontFamily: "Inter_600SemiBold",
          fontSize: 15,
        }}
      >
        {label}
      </Text>
      <MaterialIcons
        name="chevron-right"
        size={18}
        color={palette.outlineVariant}
      />
    </Pressable>
  );
}

function MvdRow({ task, onToggle, onRemove, editing }) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: task.done }}
      accessibilityLabel={task.title}
      style={{
        marginBottom: 10,
        padding: 14,
        borderRadius: 20,
        backgroundColor: palette.surfaceHigh,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: task.done
            ? palette.accent
            : withAlpha(palette.accent, 0.35),
          backgroundColor: task.done ? palette.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {task.done ? (
          <MaterialIcons name="check" size={18} color={palette.onPrimary} />
        ) : null}
      </View>
      <View style={{ width: 14 }} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: task.done ? palette.onSurfaceVariant : palette.onSurface,
            fontFamily: "Inter_600SemiBold",
            fontSize: 15,
            textDecorationLine: task.done ? "line-through" : "none",
          }}
        >
          {task.title}
        </Text>
        {task.subtitle ? (
          <Text
            style={{
              color: palette.onSurfaceVariant,
              fontFamily: "Inter_400Regular",
              fontSize: 12,
            }}
          >
            {task.subtitle}
          </Text>
        ) : null}
      </View>
      {editing ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove task ${task.title}`}
          hitSlop={8}
          style={{ padding: 6 }}
        >
          <MaterialIcons name="close" size={18} color={palette.error} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function NextAnchor({ anchor, onEdit, onDone, onAdd }) {
  const palette = usePalette();
  const now = new Date();
  const minutesUntil =
    anchor.time.hour * 60 +
    anchor.time.minute -
    (now.getHours() * 60 + now.getMinutes());
  const untilLabel =
    minutesUntil <= 0
      ? "Happening now"
      : minutesUntil < 60
        ? `In ${minutesUntil} minutes`
        : `In ${Math.round(minutesUntil / 60)} hours`;

  return (
    <View
      style={{
        padding: 20,
        borderRadius: 26,
        backgroundColor: withAlpha(palette.primaryContainer, 0.28),
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          right: -30,
          bottom: -30,
          width: 150,
          height: 150,
          borderRadius: 75,
          backgroundColor: withAlpha(palette.secondary, 0.1),
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: withAlpha(palette.accent, 0.75),
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              letterSpacing: 3,
            }}
          >
            NEXT ANCHOR
          </Text>
          <View style={{ height: 6 }} />
          <Text
            style={{
              color: palette.onSurface,
              fontFamily: "SpaceGrotesk_700Bold",
              fontSize: 20,
            }}
          >
            {anchor.title} at {formatTime12(anchor.time)}
          </Text>
          <View style={{ height: 8 }} />
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <MaterialIcons
              name="schedule"
              size={14}
              color={palette.onSurfaceVariant}
            />
            <View style={{ width: 4 }} />
            <Text
              style={{
                color: palette.onSurfaceVariant,
                fontFamily: "Inter_400Regular",
                fontSize: 13,
              }}
            >
              {untilLabel}
            </Text>
          </View>
        </View>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 16,
            backgroundColor: withAlpha(palette.accent, 0.18),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MaterialIcons
            name={anchor.icon || "anchor"}
            size={32}
            color={palette.accent}
          />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Mark anchor done"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 12,
            backgroundColor: withAlpha(palette.secondary, 0.16),
            borderWidth: 1,
            borderColor: withAlpha(palette.secondary, 0.4),
          }}
        >
          <MaterialIcons name="check" size={15} color={palette.secondary} />
          <Text
            style={{
              color: palette.secondary,
              fontFamily: "Inter_600SemiBold",
              fontSize: 13,
            }}
          >
            Done
          </Text>
        </Pressable>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="Edit next anchor"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 12,
            backgroundColor: withAlpha(palette.accent, 0.14),
            borderWidth: 1,
            borderColor: withAlpha(palette.accent, 0.4),
          }}
        >
          <MaterialIcons name="edit" size={15} color={palette.accent} />
          <Text
            style={{
              color: palette.accent,
              fontFamily: "Inter_600SemiBold",
              fontSize: 13,
            }}
          >
            Edit
          </Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add another anchor"
          hitSlop={8}
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: withAlpha(palette.accent, 0.1),
          }}
        >
          <MaterialIcons name="add" size={18} color={palette.accent} />
        </Pressable>
      </View>
    </View>
  );
}

function ResumeReading({ document, onPress }) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Resume reading ${document.title}`}
      style={{
        padding: 16,
        borderRadius: 22,
        backgroundColor: palette.surfaceContainer,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: withAlpha(palette.accent, 0.12),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MaterialIcons
            name="chrome-reader-mode"
            size={22}
            color={palette.accent}
          />
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: withAlpha(palette.accent, 0.7),
              fontFamily: "Inter_500Medium",
              fontSize: 11,
              letterSpacing: 2,
            }}
          >
            RESUME READING
          </Text>
          <View style={{ height: 4 }} />
          <Text
            numberOfLines={2}
            style={{
              color: palette.onSurface,
              fontFamily: "SpaceGrotesk_600SemiBold",
              fontSize: 16,
            }}
          >
            {document.title}
          </Text>
        </View>
      </View>
      <View style={{ height: 12 }} />
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: palette.surfaceHigh,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.round(document.progress * 100)}%`,
            height: "100%",
            backgroundColor: palette.accent,
          }}
        />
      </View>
    </Pressable>
  );
}
