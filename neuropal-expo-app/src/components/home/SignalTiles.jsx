import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useId, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Svg, { Circle, Defs, Line, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";

import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { GlassPanel, SignalLabel, withAlpha } from "../primitives";

// Home tiles in the Signal skin, after the approved S-Today board: brutal
// panels, mono labels, a state dial, a countdown anchor, a focus scope.
// Classic keeps its original tiles (HomeScreen.jsx). Every tile takes the
// size picked in Arrange home; `half` = sharing a row with another M tile.

const pad2 = (n) => String(n).padStart(2, "0");
export const hhmm = (time) => `${pad2(time.hour)}:${pad2(time.minute)}`;

export function minutesUntil(anchor, now = new Date()) {
  return anchor.time.hour * 60 + anchor.time.minute - (now.getHours() * 60 + now.getMinutes());
}

// ---------------------------------------------------------------- shared ---

function Mono({ children, style, color }) {
  const palette = usePalette();
  return <Text style={[{ color: color || palette.onSurfaceVariant, fontFamily: palette.fonts.mono, fontSize: 12, letterSpacing: 0.3 }, style]}>{children}</Text>;
}

export function SignalOneLine({ icon, label, value, onPress, accessibilityLabel }) {
  const palette = usePalette();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={accessibilityLabel || `${label}: ${value}`}>
      <GlassPanel style={{ minHeight: 52, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center" }}>
        <MaterialIcons name={icon} size={18} color={palette.accent} />
        <SignalLabel style={{ marginLeft: 10 }}>{label}</SignalLabel>
        <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 14 }}>
          {value}
        </Text>
        {onPress ? <MaterialIcons name="chevron-right" size={20} color={palette.onSurfaceVariant} /> : null}
      </GlassPanel>
    </Pressable>
  );
}

function SmallBtn({ icon, label, onPress, accessibilityLabel }) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: label ? 10 : 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: palette.shape.radiusControl,
        borderWidth: 1.5,
        borderColor: palette.control,
        backgroundColor: pressed ? withAlpha(palette.accent, 0.14) : "transparent",
      })}
    >
      <MaterialIcons name={icon} size={17} color={palette.onSurface} />
      {label ? <Text style={{ marginLeft: 5, color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 13 }}>{label}</Text> : null}
    </Pressable>
  );
}

// ----------------------------------------------------------------- state ---

const STATE_OPTS = [
  { id: "green", shape: "circle", label: "I feel okay", short: "Okay", a11y: "I feel okay" },
  { id: "yellow", shape: "triangle", label: "A bit off", short: "Bit off", a11y: "Feeling a bit off" },
  { id: "red", shape: "square", label: "Overwhelmed", short: "Overwhelmed", a11y: "Help, I'm overwhelmed" },
];
// Dial pointer, degrees from 12 o'clock. Unset rests to the left.
const KNOB_ANGLE = { green: -50, yellow: 0, red: 50 };

// Shape cue next to every state, so the choice never relies on colour.
function StateGlyph({ shape, color, size = 12 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      {shape === "circle" ? <Circle cx={6} cy={6} r={5} fill={color} /> : null}
      {shape === "triangle" ? <Polygon points="6,1 11.5,11 0.5,11" fill={color} /> : null}
      {shape === "square" ? <Rect x={1} y={1} width={10} height={10} fill={color} /> : null}
    </Svg>
  );
}

function Knob({ state, size = 104 }) {
  const palette = usePalette();
  const gid = `knob-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const c = size / 2;
  const ticks = [];
  for (let i = 0; i <= 26; i += 1) {
    const a = ((-135 + i * (270 / 26)) * Math.PI) / 180;
    const r1 = c - 2;
    const r2 = c - (i % 13 === 0 ? 11 : 7);
    ticks.push(
      <Line key={i} x1={c + r1 * Math.sin(a)} y1={c - r1 * Math.cos(a)} x2={c + r2 * Math.sin(a)} y2={c - r2 * Math.cos(a)} stroke={palette.outline} strokeWidth={1.6} />
    );
  }
  const ang = ((state in KNOB_ANGLE ? KNOB_ANGLE[state] : -110) * Math.PI) / 180;
  const R = c - 15;
  const pr = R - 9;
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gid} cx="38%" cy="32%" r="75%">
            <Stop offset="0" stopColor={palette.surfaceHighest} />
            <Stop offset="1" stopColor={palette.surfaceLowest} />
          </RadialGradient>
        </Defs>
        {ticks}
        <Circle cx={c + 3} cy={c + 3} r={R} fill={palette.shadowColor} />
        <Circle cx={c} cy={c} r={R} fill={`url(#${gid})`} stroke={palette.line} strokeWidth={2} />
        <Circle cx={c} cy={c} r={R - 7} fill="none" stroke={withAlpha(palette.onSurface, 0.08)} strokeWidth={1.5} />
        <Line x1={c + 7 * Math.sin(ang)} y1={c - 7 * Math.cos(ang)} x2={c + pr * Math.sin(ang)} y2={c - pr * Math.cos(ang)} stroke={palette.accentFill} strokeWidth={4} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function StateButton({ opt, on, onPress, compact }) {
  const palette = usePalette();
  const sh = on ? Math.min(4, palette.shape.shadow) : 0;
  const r = Math.round(palette.shape.radiusControl * 0.6);
  const fg = on ? palette.accentInk : palette.onSurface;
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={opt.a11y} style={{ flex: compact ? 1 : undefined }}>
      {sh ? <View pointerEvents="none" style={{ position: "absolute", top: sh, left: sh, right: -sh, bottom: -sh, borderRadius: r, backgroundColor: palette.shadowColor }} /> : null}
      <View
        style={{
          flexGrow: 1,
          minHeight: compact ? 56 : 46,
          paddingHorizontal: compact ? 6 : 12,
          paddingVertical: compact ? 6 : 0,
          flexDirection: compact ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: r,
          borderWidth: 1.5,
          borderColor: on ? palette.shadowColor : palette.control,
          backgroundColor: on ? palette.accentFill : withAlpha(palette.surfaceContainer, 0.55),
        }}
      >
        <StateGlyph shape={opt.shape} color={fg} />
        <Text
          numberOfLines={1}
          style={{
            flex: compact ? 0 : 1,
            marginLeft: compact ? 0 : 10,
            marginTop: compact ? 4 : 0,
            color: fg,
            fontFamily: palette.fonts.bodyBold,
            fontSize: compact ? 12.5 : 15,
          }}
        >
          {compact ? opt.short : opt.label}
        </Text>
        {!compact && !on ? <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: palette.onSurfaceVariant }} /> : null}
      </View>
    </Pressable>
  );
}

export function SignalStateTile({ size, nervous, onPick, message }) {
  const palette = usePalette();
  if (size === "L") {
    return (
      <GlassPanel style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <SignalLabel accessibilityRole="header" style={{ flex: 1 }}>
            How are you feeling right now?
          </SignalLabel>
          <Mono style={{ fontSize: 10.5 }}>CH·01</Mono>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
          <Knob state={nervous} />
          <View accessibilityRole="radiogroup" accessibilityLabel="How are you feeling right now?" style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            {STATE_OPTS.map((o) => (
              <StateButton key={o.id} opt={o} on={nervous === o.id} onPress={() => onPick(o.id)} />
            ))}
          </View>
        </View>
        {message ? (
          <View style={{ flexDirection: "row", marginTop: 12 }} accessibilityLiveRegion="polite">
            <Text style={{ color: palette.accent, fontFamily: palette.fonts.label, fontSize: 14, lineHeight: 20 }}>{">"}</Text>
            <Text style={{ flex: 1, marginLeft: 8, color: palette.onSurface, fontFamily: palette.fonts.body, fontSize: 14, lineHeight: 20 }}>{message}</Text>
          </View>
        ) : null}
      </GlassPanel>
    );
  }
  return (
    <GlassPanel style={{ padding: 12 }}>
      {size === "M" ? (
        <SignalLabel accessibilityRole="header" style={{ marginBottom: 8 }}>
          How are you feeling?
        </SignalLabel>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel="How are you feeling right now?" style={{ flexDirection: "row", gap: 8 }}>
        {STATE_OPTS.map((o) => (
          <StateButton key={o.id} compact opt={o} on={nervous === o.id} onPress={() => onPick(o.id)} />
        ))}
      </View>
    </GlassPanel>
  );
}

// ---------------------------------------------------------------- anchor ---

function TickRuler({ mins, flex }) {
  const palette = usePalette();
  const N = 25;
  const span = 120; // ±2 h around the anchor
  const nowIdx = Math.round(((span - mins) / (2 * span)) * (N - 1));
  const ticks = [];
  for (let i = 0; i < N; i += 1) {
    const offset = (i - (N - 1) / 2) * ((2 * span) / (N - 1));
    const inWin = Math.abs(offset) <= flex;
    const isNow = i === nowIdx;
    ticks.push(
      <View
        key={i}
        style={{
          width: isNow ? 2.5 : inWin ? 3 : 1.5,
          height: isNow ? 18 : inWin ? 11 : 7,
          backgroundColor: isNow ? palette.onSurface : inWin ? palette.accentFill : palette.outline,
        }}
      />
    );
  }
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 18, marginTop: 10 }}>
      {ticks}
    </View>
  );
}

export function SignalAnchorTile({ size, half, anchor, onEdit, onDone, onAdd }) {
  const palette = usePalette();
  const [, setTick] = useState(0);
  // Re-render each minute so the countdown stays honest.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!anchor) {
    return (
      <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Set your next anchor" style={{ flexGrow: half ? 1 : 0 }}>
        <GlassPanel style={{ padding: 14, flexGrow: half ? 1 : 0 }}>
          <SignalLabel>Next anchor</SignalLabel>
          <Text style={{ marginTop: 8, color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 15 }}>Nothing set yet</Text>
          <Text style={{ marginTop: 3, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13 }}>Meds, a break, a study block…</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
            <MaterialIcons name="add-alarm" size={18} color={palette.accent} />
            <Text style={{ marginLeft: 6, color: palette.accent, fontFamily: palette.fonts.bodyBold, fontSize: 13 }}>Add anchor</Text>
          </View>
        </GlassPanel>
      </Pressable>
    );
  }
  const mins = minutesUntil(anchor);
  if (size === "S") {
    return <SignalOneLine icon={anchor.icon || "anchor"} label="Next" value={`${anchor.title} · ${hhmm(anchor.time)}`} onPress={onEdit} />;
  }
  const big = mins <= 0 ? "NOW" : mins < 100 ? String(mins) : String(Math.round(mins / 60));
  const unit = mins <= 0 ? "" : mins < 100 ? "MIN" : "H";
  const spoken = mins <= 0 ? "happening now" : mins < 100 ? `in ${mins} minutes` : `in about ${Math.round(mins / 60)} hours`;
  const flex = Number(anchor.flexMinutes) || 30;
  return (
    <GlassPanel style={{ padding: 14, flexGrow: half ? 1 : 0 }}>
      <SignalLabel>Next anchor</SignalLabel>
      <View accessible accessibilityLabel={`${anchor.title}, ${spoken}, at ${hhmm(anchor.time)}`} style={{ marginTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.display, fontSize: size === "L" ? 52 : 44, lineHeight: size === "L" ? 56 : 48 }}>{big}</Text>
          {unit ? <Mono style={{ marginLeft: 6, fontFamily: palette.fonts.label }}>{unit}</Mono> : null}
        </View>
        <Text numberOfLines={2} style={{ marginTop: 2, color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 15, lineHeight: 19 }}>
          {anchor.title}
        </Text>
        <Mono style={{ marginTop: 3 }}>{`${hhmm(anchor.time)} · window ±${flex}`}</Mono>
      </View>
      <TickRuler mins={mins} flex={flex} />
      <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
        <SmallBtn icon="check" label="Done" accessibilityLabel="Mark anchor done" onPress={onDone} />
        <SmallBtn icon="edit" accessibilityLabel="Edit next anchor" onPress={onEdit} />
        {!half ? <SmallBtn icon="add" accessibilityLabel="Add another anchor" onPress={onAdd} /> : null}
      </View>
    </GlassPanel>
  );
}

// ----------------------------------------------------------------- focus ---

function Scope({ phase }) {
  const palette = usePalette();
  const pts = [];
  for (let k = 0; k <= 120; k += 1) {
    const t = (k / 120) * Math.PI * 2;
    pts.push(`${(50 + 44 * Math.sin(3 * t + phase)).toFixed(2)},${(28 + 22 * Math.sin(2 * t)).toFixed(2)}`);
  }
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ height: 64, marginTop: 10, borderRadius: Math.round(palette.shape.radiusControl * 0.5), borderWidth: 1, borderColor: palette.line, overflow: "hidden", backgroundColor: withAlpha(palette.surfaceLowest, 0.7) }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 56" preserveAspectRatio="none">
        {[14, 28, 42].map((y) => (
          <Line key={`h${y}`} x1={0} y1={y} x2={100} y2={y} stroke={palette.grid} strokeOpacity={0.12} strokeWidth={0.5} />
        ))}
        {[25, 50, 75].map((x) => (
          <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={56} stroke={palette.grid} strokeOpacity={0.12} strokeWidth={0.5} />
        ))}
        <Path d={`M${pts.join(" L")}`} fill="none" stroke={palette.accentFill} strokeOpacity={0.9} strokeWidth={1.4} />
      </Svg>
    </View>
  );
}

export function SignalFocusTile({ size, half, focus, onOpen }) {
  const palette = usePalette();
  const { motionLevel } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!focus.running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [focus.running]);
  const ms = focus.running && focus.endsAt ? Math.max(0, focus.endsAt - now) : 0;
  const left = `${pad2(Math.floor(ms / 60000))}:${pad2(Math.floor((ms % 60000) / 1000))}`;
  const title = focus.running ? (focus.phase === "work" ? "Focus block" : "Break") : "Ready";
  const sub = focus.running ? `${left} left` : `${focus.workMin} min block`;
  if (size === "S") return <SignalOneLine icon="timer" label="Focus" value={`${title} · ${sub}`} onPress={onOpen} />;
  // The scope drifts slowly while a block runs (never when motion is Still).
  const phase = focus.running && motionLevel !== "Still" ? (now / 1000) * 0.15 : 0.6;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Focus: ${title}, ${sub}. Open the focus tools`} style={{ flexGrow: half ? 1 : 0 }}>
      <GlassPanel style={{ padding: 14, flexGrow: half ? 1 : 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <SignalLabel style={{ flex: 1 }}>Focus</SignalLabel>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: focus.running ? palette.accentFill : palette.outline }} />
        </View>
        <Scope phase={phase} />
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 15 }}>{title}</Text>
            <Mono style={{ marginTop: 2 }}>{sub}</Mono>
          </View>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: palette.shape.radiusControl,
              borderWidth: 1.5,
              borderColor: palette.control,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name={focus.running ? "graphic-eq" : "play-arrow"} size={22} color={palette.onSurface} />
          </View>
        </View>
      </GlassPanel>
    </Pressable>
  );
}

// ------------------------------------------------------------------- mvd ---

function SignalCheckRow({ task, first, editing, onToggle, onRemove }) {
  const palette = usePalette();
  const r = Math.min(6, palette.shape.radiusControl);
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {!first ? (
        // Dashed rule (Android can't dash a single border side).
        <Svg pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0 }} height={2} width="100%">
          <Line x1="0" y1="1" x2="100%" y2="1" stroke={palette.outlineVariant} strokeWidth={1} strokeDasharray="4 4" />
        </Svg>
      ) : null}
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.subtitle ? `${task.title}, ${task.subtitle}` : task.title}
        style={{ flex: 1, minHeight: 54, flexDirection: "row", alignItems: "center", paddingVertical: 8 }}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: r,
            borderWidth: 2,
            borderColor: task.done ? palette.shadowColor : palette.control,
            backgroundColor: task.done ? palette.accentFill : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {task.done ? <MaterialIcons name="check" size={18} color={palette.accentInk} /> : null}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            style={{
              color: task.done ? palette.onSurfaceVariant : palette.onSurface,
              fontFamily: palette.fonts.bodyBold,
              fontSize: 15,
              textDecorationLine: task.done ? "line-through" : "none",
            }}
          >
            {task.title}
          </Text>
          {task.subtitle ? <Mono style={{ marginTop: 2 }}>{task.subtitle}</Mono> : null}
        </View>
      </Pressable>
      {editing ? (
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove task ${task.title}`} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <MaterialIcons name="close" size={20} color={palette.error} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SignalMvdTile({ size, tasks, remaining, editing, onEditToggle, newTask, setNewTask, onAdd, onToggle, onRemove }) {
  const palette = usePalette();
  if (size === "S") {
    return <SignalOneLine icon="checklist" label="Min. day" value={remaining ? `${remaining} left` : "all done"} onPress={onEditToggle} />;
  }
  const shown = size === "M" && !editing ? tasks.slice(0, 3) : tasks;
  const hidden = tasks.length - shown.length;
  return (
    <GlassPanel style={{ padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <SignalLabel accessibilityRole="header" style={{ flex: 1 }}>
          Minimum viable day
        </SignalLabel>
        <View
          accessible
          accessibilityLabel={remaining ? `${remaining} ${remaining === 1 ? "task" : "tasks"} left` : "All done"}
          style={{ paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1.5, borderColor: palette.accent }}
        >
          <Text style={{ color: palette.accent, fontFamily: palette.fonts.label, fontSize: 11, letterSpacing: 1 }}>{remaining ? `${remaining} LEFT` : "DONE"}</Text>
        </View>
        <Pressable
          onPress={onEditToggle}
          accessibilityRole="button"
          accessibilityLabel={editing ? "Done editing tasks" : "Edit tasks"}
          style={{ marginLeft: 8, minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 13 }}>{editing ? "Done" : "Edit"}</Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 6 }}>
        {shown.map((t, k) => (
          <SignalCheckRow key={t.id} task={t} first={k === 0} editing={editing} onToggle={() => onToggle(t.id)} onRemove={() => onRemove(t.id)} />
        ))}
      </View>
      {hidden > 0 ? (
        <Pressable onPress={onEditToggle} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ color: palette.accent, fontFamily: palette.fonts.bodyBold, fontSize: 13 }}>{`+ ${hidden} more`}</Text>
        </Pressable>
      ) : null}
      {editing ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput
            value={newTask}
            onChangeText={setNewTask}
            onSubmitEditing={onAdd}
            placeholder="Add a task for today…"
            placeholderTextColor={palette.onSurfaceVariant}
            accessibilityLabel="New task title"
            style={{
              flex: 1,
              minHeight: 46,
              paddingHorizontal: 12,
              borderRadius: palette.shape.radiusControl,
              borderWidth: 1.5,
              borderColor: palette.control,
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
              borderRadius: palette.shape.radiusControl,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: palette.accentFill,
              opacity: newTask.trim() ? 1 : 0.4,
            }}
          >
            <MaterialIcons name="add" size={20} color={palette.accentInk} />
          </Pressable>
        </View>
      ) : null}
    </GlassPanel>
  );
}

// --------------------------------------------------------------- reading ---

export function SignalReadingTile({ size, half, document, onPress }) {
  const palette = usePalette();
  const pct = Math.max(0, Math.min(1, Number(document.readingProgress ?? document.progress ?? 0)));
  if (size === "S") {
    return <SignalOneLine icon="menu-book" label="Resume" value={document.title} onPress={onPress} accessibilityLabel={`Resume reading ${document.title}`} />;
  }
  const segs = half ? 8 : 12;
  const filled = Math.round(pct * segs);
  const pages = document.pageCount ? `p. ${Math.max(1, Math.round(pct * document.pageCount))} / ${document.pageCount}` : `${Math.round(pct * 100)}%`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Resume reading ${document.title}, ${Math.round(pct * 100)} percent read`}
      style={{ flexGrow: half ? 1 : 0 }}
    >
      <GlassPanel style={{ padding: 14, flexGrow: half ? 1 : 0 }}>
        <View style={{ flexDirection: half ? "column" : "row", alignItems: half ? "flex-start" : "center" }}>
          <View
            style={{
              width: 44,
              height: 52,
              borderRadius: Math.min(8, palette.shape.radiusControl),
              borderWidth: 1.5,
              borderColor: palette.shadowColor,
              backgroundColor: palette.accentFill,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="menu-book" size={22} color={palette.accentInk} />
          </View>
          <View style={{ flex: half ? 0 : 1, marginLeft: half ? 0 : 12, marginTop: half ? 10 : 0 }}>
            <SignalLabel>Resume reading</SignalLabel>
            <Text numberOfLines={2} style={{ marginTop: 3, color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 15, lineHeight: 19 }}>
              {document.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 7 }} importantForAccessibility="no-hide-descendants">
              {Array.from({ length: segs }, (_, k) => (
                <View
                  key={k}
                  style={{
                    width: 9,
                    height: 9,
                    marginRight: 2,
                    backgroundColor: k < filled ? palette.accentFill : "transparent",
                    borderWidth: k < filled ? 0 : 1.2,
                    borderColor: palette.outline,
                  }}
                />
              ))}
              <Mono style={{ marginLeft: 6, fontSize: 11.5 }}>{pages}</Mono>
            </View>
          </View>
          {!half ? <MaterialIcons name="chevron-right" size={22} color={palette.onSurface} style={{ marginLeft: 6 }} /> : null}
        </View>
      </GlassPanel>
    </Pressable>
  );
}
