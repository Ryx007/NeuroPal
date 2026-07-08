import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import { Pressable, ScrollView, Text, View } from "react-native";

import { formatTime12 } from "../data/mockData";
import {
  selectNextAnchor,
  selectNervousState,
  selectRemainingTasks,
  selectResumeDocument,
  selectTasks,
} from "../store/selectors";
import { setNervousState, toggleTask } from "../store/slices/homeSlice";
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
  // Real name comes from the backend's LOCAL_MODE user via /auth/me;
  // single-user app, so the owner's name is the offline fallback too.
  const userName = useSelector((s) => s.auth.userName);

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
        <SectionHeader
          label="Minimum viable day"
          trailing={`${remaining} tasks remaining`}
        />
        <View style={{ height: 12 }} />
        {tasks.map((task) => (
          <MvdRow
            key={task.id}
            task={task}
            onToggle={() => dispatch(toggleTask(task.id))}
          />
        ))}
      </View>

      {nextAnchor ? (
        <View style={{ marginTop: 24 }}>
          <NextAnchor anchor={nextAnchor} />
        </View>
      ) : null}

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

function MvdRow({ task, onToggle }) {
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
        <Text
          style={{
            color: palette.onSurfaceVariant,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
          }}
        >
          {task.subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function NextAnchor({ anchor }) {
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
          <MaterialIcons name="anchor" size={32} color={palette.accent} />
        </View>
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
