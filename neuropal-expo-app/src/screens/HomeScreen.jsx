import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Toast from "../components/toast";

import { formatTime12 } from "../data/mockData";
import { AnchorEditor } from "../components/planner/AnchorEditor";
import { Pal } from "../components/pal/Pal";
import {
  SignalAnchorTile,
  SignalFocusTile,
  SignalMvdTile,
  SignalReadingTile,
  SignalStateTile,
  hhmm,
} from "../components/home/SignalTiles";
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
import { setIntroSeen, setSkin } from "../store/slices/lookSlice";
import { usePalette, useTheme } from "../theme/ThemeProvider";
import { effectiveTiles, homeForSkin, palLine } from "../theme/tokens";
import { GlassPanel, SectionHeader, SignalLabel, withAlpha } from "../components/primitives";

const MOOD = { green: "okay", yellow: "off", red: "over" };
// In Signal, two consecutive M tiles of these kinds share a row (S-Today board).
const PAIRABLE = new Set(["anchor", "focus", "reading", "pal"]);
// Classic's original gaps above each section (pre-v2 Home), so its default
// layout renders exactly as it did.
const CLASSIC_GAP = { state: 26, mvd: 30, anchor: 24, reading: 16, focus: 24, pal: 24 };
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function HomeScreen() {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const tasks = useSelector(selectTasks);
  const remaining = useSelector(selectRemainingTasks);
  const nervous = useSelector(selectNervousState);
  const nextAnchor = useSelector(selectNextAnchor);
  const resume = useSelector(selectResumeDocument);
  const look = useSelector((s) => s.look);
  const focus = useSelector((s) => s.focus);
  const [editingMvd, setEditingMvd] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [anchorEditor, setAnchorEditor] = useState(null); // null | {anchor?}
  // Real name comes from the backend's LOCAL_MODE user via /auth/me;
  // single-user app, so the owner's name is the offline fallback too.
  const userName = useSelector((s) => s.auth.userName);
  const anchors = useSelector((s) => s.home.anchors);
  // Re-evaluate day rules when the date flips (Home stays mounted).
  const [today, setToday] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setToday(new Date());
    }, [])
  );

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

  // v2 — the user's own layout: order, sizes, hidden tiles and today's
  // day rules ("reading first on weekdays"), from Arrange home.
  // Tiles with nothing to show today (no document to resume) drop out first,
  // so pairing never leaves a hole.
  const tiles = effectiveTiles(homeForSkin(look.home, look.skin), today).filter((t) => t.id !== "reading" || resume);
  const firstOpenTask = tasks.find((t) => !t.done);
  const name = userName || "Ryx";
  const palText = palLine(look.pal, firstOpenTask ? `“${firstOpenTask.title}”` : "your next task");
  const stateVisible = tiles.some((t) => t.id === "state");
  const pickState = (v) => {
    dispatch(setNervousState(v));
    if (v === "red") navigation.getParent()?.navigate("Emergency");
  };
  const stateMessage =
    nervous === "green"
      ? nextAnchor
        ? `Good window for focus. ${nextAnchor.title} starts at ${hhmm(nextAnchor.time)}.`
        : "Good window for focus."
      : nervous === "yellow"
        ? "Gentler mode: the Reader slows down and softens contrast. Two minutes is enough today."
        : nervous === "red"
          ? "Everything else can wait. Your emergency tools are one tap away."
          : "Tap how you feel. Home and the Reader adapt to it.";

  const renderSignalTile = (tile, half) => {
    switch (tile.id) {
      case "state":
        return <SignalStateTile size={tile.size} nervous={nervous} onPick={pickState} message={stateMessage} />;
      case "mvd":
        return (
          <SignalMvdTile
            size={tile.size}
            tasks={tasks}
            remaining={remaining}
            editing={editingMvd}
            onEditToggle={() => setEditingMvd((v) => !v)}
            newTask={newTask}
            setNewTask={setNewTask}
            onAdd={() => {
              dispatch(addTask(newTask));
              setNewTask("");
            }}
            onToggle={(id) => dispatch(toggleTask(id))}
            onRemove={(id) => dispatch(removeTask(id))}
          />
        );
      case "anchor":
        return (
          <SignalAnchorTile
            size={tile.size}
            half={half}
            anchor={nextAnchor}
            onEdit={() => setAnchorEditor({ anchor: nextAnchor })}
            onDone={() => nextAnchor && dispatch(setAnchorStatus({ id: nextAnchor.id, status: "done" }))}
            onAdd={() => setAnchorEditor({})}
          />
        );
      case "reading":
        return <SignalReadingTile size={tile.size} half={half} document={resume} onPress={() => navigation.navigate("Reader", { id: resume.id })} />;
      case "focus":
        return <SignalFocusTile size={tile.size} half={half} focus={focus} onOpen={() => navigation.navigate("Toolbox")} />;
      case "pal":
        return (
          <PalTile
            size={tile.size}
            pal={look.pal}
            mood={MOOD[nervous] || "okay"}
            line={palText}
            half={half}
            onBuild={() => navigation.getParent()?.navigate("PalBuilder")}
          />
        );
      default:
        return null;
    }
  };

  // Signal rows: pair consecutive M tiles; everything else is full width.
  const signalRows = [];
  for (let k = 0; k < tiles.length; k += 1) {
    const t = tiles[k];
    const n = tiles[k + 1];
    if (t.size === "M" && n && n.size === "M" && PAIRABLE.has(t.id) && PAIRABLE.has(n.id)) {
      signalRows.push([t, n]);
      k += 1;
    } else {
      signalRows.push([t]);
    }
  }

  const renderTile = (tile) => {
    switch (tile.id) {
      case "state":
        return (
          <StateTile
            size={tile.size}
            nervous={nervous}
            onPick={(v) => {
              dispatch(setNervousState(v));
              if (v === "red") navigation.getParent()?.navigate("Emergency");
            }}
          />
        );
      case "mvd":
        return (
          <MvdTile
            size={tile.size}
            tasks={tasks}
            remaining={remaining}
            editing={editingMvd}
            onEditToggle={() => setEditingMvd((v) => !v)}
            newTask={newTask}
            setNewTask={setNewTask}
            onAdd={() => {
              dispatch(addTask(newTask));
              setNewTask("");
            }}
            onToggle={(id) => dispatch(toggleTask(id))}
            onRemove={(id) => dispatch(removeTask(id))}
          />
        );
      case "anchor":
        return (
          <AnchorTile
            size={tile.size}
            anchor={nextAnchor}
            onEdit={() => setAnchorEditor({ anchor: nextAnchor })}
            onDone={() => nextAnchor && dispatch(setAnchorStatus({ id: nextAnchor.id, status: "done" }))}
            onAdd={() => setAnchorEditor({})}
          />
        );
      case "reading":
        return resume ? (
          <ReadingTile size={tile.size} document={resume} onPress={() => navigation.navigate("Reader", { id: resume.id })} />
        ) : null;
      case "focus":
        return <FocusTile size={tile.size} focus={focus} onOpen={() => navigation.navigate("Toolbox")} />;
      case "pal":
        return (
          <PalTile
            size={tile.size}
            pal={look.pal}
            mood={MOOD[nervous] || "okay"}
            line={palText}
            onBuild={() => navigation.getParent()?.navigate("PalBuilder")}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ScrollView
      className="flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: isSignal ? 16 : 20,
        paddingTop: 20,
        paddingBottom: 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      {isSignal ? (
        <SignalLabel style={{ marginBottom: 6 }}>
          {`${DAYS[today.getDay()]} · ${today.getDate()} ${MONTHS[today.getMonth()]}`}
        </SignalLabel>
      ) : null}
      <Text
        accessibilityRole="header"
        style={{
          color: palette.onSurface,
          fontFamily: palette.fonts.display,
          fontSize: isSignal ? 40 : 34,
          letterSpacing: isSignal ? -0.6 : -0.8,
          lineHeight: isSignal ? 42 : undefined,
        }}
      >
        Hello, {name}
        {isSignal ? "." : ""}
      </Text>
      <Text
        style={{
          color: palette.onSurfaceVariant,
          fontFamily: palette.fonts.body,
          fontSize: 16,
          marginTop: 4,
        }}
      >
        One step at a time today.
      </Text>

      {!look.introSeen ? (
        <IntroCard
          onTry={() => {
            dispatch(setSkin("signal"));
            dispatch(setIntroSeen());
          }}
          onStudio={() => {
            dispatch(setIntroSeen());
            navigation.navigate("Studio");
          }}
          onDismiss={() => dispatch(setIntroSeen())}
        />
      ) : null}

      {nervous === "yellow" && (!isSignal || !stateVisible) ? (
        <View
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: isSignal ? palette.shape.radiusMedium : 18,
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
              fontFamily: palette.fonts.body,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            Starting from yellow. Reader is set to cocoon mode with softer
            contrast and a slower playback speed. Open the menu to tweak it.
          </Text>
        </View>
      ) : null}

      {isSignal
        ? signalRows.map((row) =>
            row.length === 2 ? (
              <View key={`${row[0].id}+${row[1].id}`} style={{ marginTop: 14, flexDirection: "row", gap: 12 }}>
                {row.map((t) => (
                  <View key={t.id} style={{ flex: 1 }}>
                    {renderSignalTile(t, true)}
                  </View>
                ))}
              </View>
            ) : (
              <View key={row[0].id} style={{ marginTop: 14 }}>
                {renderSignalTile(row[0], false)}
              </View>
            )
          )
        : tiles.map((tile) => {
            const node = renderTile(tile);
            return node ? (
              <View key={tile.id} style={{ marginTop: CLASSIC_GAP[tile.id] ?? 24 }}>
                {node}
              </View>
            ) : null;
          })}

      {/* Classic Home stays exactly as it was; its layout is arranged from
          Make it yours. Signal gets the shortcut here. */}
      {isSignal ? (
        <Pressable
          onPress={() => navigation.getParent()?.navigate("HomeArrange")}
          accessibilityRole="button"
          accessibilityLabel="Arrange home: reorder, resize or hide these tiles"
          style={{
            marginTop: 22,
            minHeight: 44,
            alignSelf: "center",
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            borderRadius: palette.shape.radiusControl,
            borderWidth: 1,
            borderColor: palette.control,
          }}
        >
          <MaterialIcons name="dashboard-customize" size={16} color={palette.onSurfaceVariant} />
          <Text style={{ marginLeft: 8, color: palette.onSurfaceVariant, fontFamily: palette.fonts.bodySemi, fontSize: 13 }}>
            Arrange home
          </Text>
        </Pressable>
      ) : null}

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
    </ScrollView>
  );
}

// ---- tiles -----------------------------------------------------------------
// Each tile honours the size the user picked in Arrange home: S = one line,
// M = the standard card, L = everything. Classic keeps its original look;
// Signal wraps tiles in brutal-glass panels.

function TileFrame({ children, padded = true, grow = false }) {
  const { isSignal } = useTheme();
  if (!isSignal) return children;
  return <GlassPanel style={{ padding: padded ? 14 : 0, flexGrow: grow ? 1 : 0 }}>{children}</GlassPanel>;
}

function OneLine({ icon, label, value, onPress, accessibilityLabel }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  return (
    <TileFrame>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={accessibilityLabel || `${label}: ${value}`}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: isSignal ? 0 : 16,
          paddingVertical: isSignal ? 0 : 12,
          borderRadius: 18,
          backgroundColor: isSignal ? "transparent" : palette.surfaceContainer,
        }}
      >
        <MaterialIcons name={icon} size={18} color={palette.accent} />
        <Text style={{ marginLeft: 10, color: palette.onSurfaceVariant, fontFamily: palette.fonts.bodyMedium, fontSize: 13 }}>{label}</Text>
        <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 14 }}>
          {value}
        </Text>
        {onPress ? <MaterialIcons name="chevron-right" size={18} color={palette.outline} /> : null}
      </Pressable>
    </TileFrame>
  );
}

const STATES = [
  { id: "green", icon: "sentiment-satisfied", label: "I feel okay", short: "Okay", tint: "secondary" },
  { id: "yellow", icon: "sentiment-neutral", label: "Feeling a bit off", short: "Bit off", tint: "tertiary" },
  { id: "red", icon: "sentiment-very-dissatisfied", label: "Help, I'm overwhelmed", short: "Overwhelmed", tint: "error" },
];

function StateTile({ size, nervous, onPick }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  if (size === "L") {
    const body = (
      <>
        {isSignal ? (
          <SignalLabel accessibilityRole="header">How are you feeling right now?</SignalLabel>
        ) : (
          <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.displaySemi, fontSize: 16 }}>
            How are you feeling right now?
          </Text>
        )}
        <View style={{ height: 14 }} />
        {STATES.map((st, i) => (
          <View key={st.id} style={{ marginTop: i ? 10 : 0 }}>
            <StateOption selected={nervous === st.id} icon={st.icon} label={st.label} tint={palette[st.tint]} onPress={() => onPick(st.id)} />
          </View>
        ))}
      </>
    );
    return isSignal ? (
      <GlassPanel style={{ padding: 16 }}>{body}</GlassPanel>
    ) : (
      <View style={{ padding: 20, borderRadius: 26, backgroundColor: palette.surfaceLow }}>{body}</View>
    );
  }
  // M and S: one row of three — S drops the heading.
  return (
    <TileFrame>
      {size === "M" ? (
        <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.bodySemi, fontSize: 13, marginBottom: 8, marginLeft: isSignal ? 0 : 4 }}>
          How are you feeling?
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup">
        {STATES.map((st) => {
          const on = nervous === st.id;
          const tint = palette[st.tint];
          return (
            <Pressable
              key={st.id}
              onPress={() => onPick(st.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={st.label}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: isSignal ? palette.shape.radiusControl : 16,
                borderWidth: on ? 2 : 1,
                borderColor: on ? tint : isSignal ? palette.control : withAlpha(palette.outlineVariant, 0.4),
                backgroundColor: on ? withAlpha(tint, 0.14) : isSignal ? "transparent" : palette.surfaceContainer,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 6,
              }}
            >
              <MaterialIcons name={st.icon} size={20} color={tint} />
              <Text style={{ marginTop: 2, color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 12 }}>{st.short}</Text>
            </Pressable>
          );
        })}
      </View>
    </TileFrame>
  );
}

// Classic only (Signal renders SignalMvdTile). Size L is the original tile.
function MvdTile({ size, tasks, remaining, editing, onEditToggle, newTask, setNewTask, onAdd, onToggle, onRemove }) {
  const palette = usePalette();
  if (size === "S") {
    return <OneLine icon="checklist" label="Minimum day" value={remaining ? `${remaining} left` : "all done"} onPress={onEditToggle} />;
  }
  const shown = size === "M" && !editing ? tasks.slice(0, 3) : tasks;
  const hiddenCount = tasks.length - shown.length;
  return (
    <TileFrame>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <SectionHeader label="Minimum viable day" trailing={`${remaining} tasks remaining`} />
        </View>
        <Pressable
          onPress={onEditToggle}
          accessibilityRole="button"
          accessibilityLabel={editing ? "Done editing tasks" : "Edit tasks"}
          hitSlop={8}
          style={{
            marginLeft: 10,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 99,
            backgroundColor: editing ? withAlpha(palette.accent, 0.16) : palette.surfaceContainer,
          }}
        >
          <Text style={{ color: editing ? palette.accent : palette.onSurfaceVariant, fontFamily: palette.fonts.bodySemi, fontSize: 12 }}>
            {editing ? "Done" : "Edit"}
          </Text>
        </Pressable>
      </View>
      <View style={{ height: 12 }} />
      {shown.map((task) => (
        <MvdRow key={task.id} task={task} editing={editing} onToggle={() => onToggle(task.id)} onRemove={() => onRemove(task.id)} />
      ))}
      {hiddenCount > 0 ? (
        <Pressable onPress={onEditToggle} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}>
          <Text style={{ color: palette.accent, fontFamily: palette.fonts.bodySemi, fontSize: 13 }}>
            {`+ ${hiddenCount} more`}
          </Text>
        </Pressable>
      ) : null}
      {editing ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
          <TextInput
            value={newTask}
            onChangeText={setNewTask}
            onSubmitEditing={onAdd}
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
              fontFamily: palette.fonts.body,
              fontSize: 14,
            }}
          />
          <Pressable
            onPress={onAdd}
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
    </TileFrame>
  );
}

function AnchorTile({ size, anchor, onEdit, onDone, onAdd }) {
  const palette = usePalette();
  if (!anchor) {
    return (
      <Pressable
        onPress={onAdd}
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
        <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.bodyMedium, fontSize: 14 }}>
          Set your next anchor — meds, break, study block…
        </Text>
      </Pressable>
    );
  }
  if (size === "S") {
    return <OneLine icon={anchor.icon || "anchor"} label="Next" value={`${anchor.title} · ${formatTime12(anchor.time)}`} onPress={onEdit} />;
  }
  return <NextAnchor anchor={anchor} onEdit={onEdit} onDone={onDone} onAdd={onAdd} />;
}

function ReadingTile({ size, document, onPress }) {
  if (size === "S") {
    return (
      <OneLine
        icon="chrome-reader-mode"
        label="Resume"
        value={document.title}
        onPress={onPress}
        accessibilityLabel={`Resume reading ${document.title}`}
      />
    );
  }
  return <ResumeReading document={document} onPress={onPress} />;
}

function focusRemaining(focus, now) {
  if (!focus.running || !focus.endsAt) return null;
  const ms = Math.max(0, focus.endsAt - now);
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function FocusTile({ size, focus, onOpen }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!focus.running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [focus.running]);
  const left = focusRemaining(focus, now);
  const status = left
    ? `${focus.phase === "work" ? "Focus" : "Break"} · ${left} left`
    : `${focus.workMin} min block ready`;
  if (size === "S") return <OneLine icon="timer" label="Focus" value={status} onPress={onOpen} />;
  return (
    <TileFrame>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Focus: ${status}. Open the focus tools`}
        style={{
          padding: isSignal ? 0 : 16,
          borderRadius: 22,
          backgroundColor: isSignal ? "transparent" : palette.surfaceContainer,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 3,
            borderColor: focus.running ? palette.accent : palette.outlineVariant,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MaterialIcons name={focus.running ? "graphic-eq" : "timer"} size={22} color={palette.accent} />
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <SignalLabel>Focus</SignalLabel>
          <Text style={{ marginTop: 4, color: palette.onSurface, fontFamily: palette.fonts.displaySemi, fontSize: 17 }}>{status}</Text>
          {size === "L" ? (
            <Text style={{ marginTop: 4, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5 }}>
              {`${focus.cyclesDone} block${focus.cyclesDone === 1 ? "" : "s"} done today · ${focus.breakMin} min breaks`}
            </Text>
          ) : null}
        </View>
        <MaterialIcons name="chevron-right" size={20} color={palette.outline} />
      </Pressable>
    </TileFrame>
  );
}

function PalTile({ size, pal, mood, line, onBuild, half = false }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const small = size === "S";
  return (
    <TileFrame grow={half}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: isSignal ? 0 : 14,
          borderRadius: 22,
          backgroundColor: isSignal ? "transparent" : palette.surfaceContainer,
        }}
      >
        <Pal pal={pal} size={small ? 44 : 78} mood={mood} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.body, fontSize: small ? 13.5 : 15, lineHeight: small ? 19 : 21 }}>
            <Text style={{ fontFamily: palette.fonts.bodyBold }}>{`${pal.name}: `}</Text>
            {mood === "over" ? "Nothing needed right now. Breathe with me if you like." : line}
          </Text>
          {!small ? (
            <Pressable onPress={onBuild} accessibilityRole="button" accessibilityLabel={`Build your Pal, ${pal.name}`} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
              <Text style={{ color: palette.accent, fontFamily: palette.fonts.bodySemi, fontSize: 13 }}>Build your Pal</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </TileFrame>
  );
}

function IntroCard({ onTry, onStudio, onDismiss }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  return (
    <GlassPanel style={{ marginTop: 18, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <SignalLabel>New in NeuroPal</SignalLabel>
          <Text style={{ marginTop: 6, color: palette.onSurface, fontFamily: palette.fonts.displaySemi, fontSize: 18 }}>
            Two skins, and it's all yours to shape.
          </Text>
          <Text style={{ marginTop: 6, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13.5, lineHeight: 19 }}>
            Classic stays exactly as it was. Signal is new: brutal glass, a living background, any colour you like. Build your own Pal and arrange Home too.
          </Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss" style={{ padding: 4 }}>
          <MaterialIcons name="close" size={18} color={palette.outline} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        {!isSignal ? (
          <Pressable
            onPress={onTry}
            accessibilityRole="button"
            style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: palette.accent, justifyContent: "center" }}
          >
            <Text style={{ color: palette.onPrimary, fontFamily: palette.fonts.bodySemi, fontSize: 14 }}>Try Signal</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onStudio}
          accessibilityRole="button"
          style={{
            minHeight: 44,
            paddingHorizontal: 16,
            borderRadius: isSignal ? palette.shape.radiusControl : 999,
            borderWidth: 1.5,
            borderColor: isSignal ? palette.control : withAlpha(palette.accent, 0.5),
            justifyContent: "center",
          }}
        >
          <Text style={{ color: isSignal ? palette.onSurface : palette.accent, fontFamily: palette.fonts.bodySemi, fontSize: 14 }}>Open Make it yours</Text>
        </Pressable>
      </View>
    </GlassPanel>
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
          fontFamily: palette.fonts.bodySemi,
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
            fontFamily: palette.fonts.bodySemi,
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
              fontFamily: palette.fonts.body,
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
              fontFamily: palette.fonts.bodyMedium,
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
              fontFamily: palette.fonts.display,
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
                fontFamily: palette.fonts.body,
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
              fontFamily: palette.fonts.bodySemi,
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
              fontFamily: palette.fonts.bodySemi,
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
              fontFamily: palette.fonts.bodyMedium,
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
              fontFamily: palette.fonts.displaySemi,
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
