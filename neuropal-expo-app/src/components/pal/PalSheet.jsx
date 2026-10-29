import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDispatch, useSelector, useStore } from "react-redux";

import { announce } from "../../services/announce";
import { requestBreakdown } from "../../services/palApi";
import { CRISIS_REPLY, TASK_MAX_CHARS, helloFor, localBreakdown, looksLikeCrisis, moodFor, suggestionsFor, unfinishedReading } from "../../services/palAssistant";
import { addTask, addTodo, recordCheckin, setNervousState } from "../../store/slices/homeSlice";
import { setHome } from "../../store/slices/lookSlice";
import { addDump, closeSheet, removeDump, setBubbleHidden, setSection } from "../../store/slices/palSlice";
import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { effectiveTiles, homeForSkin, normalizePal, palSay, patchTile } from "../../theme/tokens";
import { middleOfState } from "../home/stateScale";
import { Chip, NpGhostButton, NpPrimaryButton, SignalLabel, skinRadius, withAlpha } from "../primitives";
import { CheckInRow, IconAction, Intro, PalCard, PalField, PanelTitle, TextAction } from "./bits";
import { forgetPalTrigger, returnFocusToPalTrigger } from "./openPalSheet";
import { Pal } from "./Pal";
import { SitPanel } from "./PalSit";
import { TalkPanel } from "./PalTalk";
import { leftLabel, startSit } from "./sitControl";

// Pal's assistant sheet (the StudySheet pattern: RN Modal, scrim, bottom
// sheet). Five actions, all usable offline: What now? · Break it down ·
// Brain dump · Sit with me · Talk (Talk needs the server; it says so).

const ACTIONS = [
  { id: "now", icon: "near-me", title: "What now?", sub: "One next step, picked for right now" },
  { id: "breakdown", icon: "call-split", title: "Break it down", sub: "Big task in, tiny steps out" },
  { id: "dump", icon: "inbox", title: "Brain dump", sub: "Get thoughts out of your head" },
  { id: "sit", icon: "self-improvement", title: "Sit with me", sub: "Quiet company while you work" },
  { id: "talk", icon: "chat-bubble-outline", title: "Talk", sub: "A short chat" },
];

export function PalSheet({ visible, navigation, now }) {
  const palette = usePalette();
  const { isSignal, motionLevel } = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const section = useSelector((s) => s.pal.section);
  const pal = normalizePal(useSelector((s) => s.look.pal));
  const nervous = useSelector((s) => s.home.nervousState);

  const close = () => dispatch(closeSheet());
  const back = () => (section ? dispatch(setSection(null)) : close());
  // Leave the sheet for another screen (calming steps, the reader): focus
  // belongs to that screen, not to the button that opened the sheet.
  const go = (route, params) => {
    forgetPalTrigger();
    dispatch(closeSheet());
    navigation?.navigate?.(route, params);
  };

  // Closed: screen-reader focus goes back to the bubble / tile / header
  // button that opened the sheet (native; the web does it by itself).
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible) {
      wasVisible.current = true;
    } else if (wasVisible.current) {
      wasVisible.current = false;
      returnFocusToPalTrigger();
    }
  }, [visible]);

  if (!visible) return null;
  const r = isSignal ? skinRadius(palette, 24) : 24;

  return (
    <Modal
      transparent
      visible={visible}
      animationType={motionLevel === "Still" ? "none" : "slide"}
      onRequestClose={back}
      aria-label={`${pal.name}, your assistant`}
    >
      {/* keyboard-controller lifts the sheet on Android too (edge-to-edge). */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: insets.top + 32 }}>
          <Pressable
            onPress={close}
            accessible={false}
            importantForAccessibility="no"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha("#000000", 0.6) }}
          />
          <View
            accessibilityViewIsModal
            style={{
              flexShrink: 1,
              width: "100%",
              maxWidth: 560,
              alignSelf: "center",
              borderTopLeftRadius: r,
              borderTopRightRadius: r,
              backgroundColor: palette.surfaceContainer,
              borderWidth: isSignal ? palette.shape.border : 0,
              borderBottomWidth: 0,
              borderColor: palette.line,
              paddingBottom: Math.max(insets.bottom, 12),
            }}
          >
            <Header pal={pal} mood={moodFor(nervous)} hello={helloFor(pal, nervous)} onClose={close} />
            {section ? (
              <Pressable
                onPress={() => dispatch(setSection(null))}
                accessibilityRole="button"
                accessibilityLabel="Back to all of Pal’s actions"
                style={{ minHeight: 44, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 14 }}
              >
                <MaterialIcons name="arrow-back" size={18} color={palette.onSurfaceVariant} />
                <Text style={{ marginLeft: 6, color: palette.onSurfaceVariant, fontFamily: palette.fonts.bodySemi, fontSize: 13.5 }}>All actions</Text>
              </Pressable>
            ) : null}
            {section === "talk" ? (
              <TalkPanel pal={pal} navigation={navigation} onCalm={() => go("Emergency")} />
            ) : (
              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingHorizontal: 18, paddingTop: section ? 2 : 10, paddingBottom: 20 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {section === "now" ? <NowPanel pal={pal} nervous={nervous} go={go} /> : null}
                {section === "breakdown" ? <BreakdownPanel pal={pal} onCalm={() => go("Emergency")} /> : null}
                {section === "dump" ? <DumpPanel pal={pal} /> : null}
                {section === "sit" ? <SitPanel pal={pal} now={now} /> : null}
                {!section ? <Menu pal={pal} now={now} go={go} /> : null}
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Header({ pal, mood, hello, onClose }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 14, paddingRight: 6, paddingTop: 12 }}>
      <Pal pal={pal} size={58} mood={mood} decorative />
      <View style={{ flex: 1, marginLeft: 8 }}>
        {isSignal ? <SignalLabel>Pal · your assistant</SignalLabel> : null}
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={{ color: palette.onSurface, fontFamily: isSignal ? palette.fonts.display : palette.fonts.displaySemi, fontSize: isSignal ? 21 : 19 }}
        >
          {pal.name}
        </Text>
        <Text accessibilityLiveRegion="polite" style={{ marginTop: 1, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13.5, lineHeight: 18 }}>
          {hello}
        </Text>
      </View>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close Pal"
        style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
      >
        <MaterialIcons name="close" size={22} color={palette.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

// ---- the list of actions ------------------------------------------------------

function Menu({ pal, now, go }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const dispatch = useDispatch();
  const dumpCount = useSelector((s) => s.pal.dump.length);
  const sit = useSelector((s) => s.pal.sit);
  const sub = (a) => {
    if (a.id === "dump" && dumpCount) return `${dumpCount} saved`;
    if (a.id === "sit" && sit) return sit.endedAt ? "Done. Want to note it?" : `Sitting with you · ${leftLabel(sit, now)}`;
    if (a.id === "talk") return `A short chat with ${pal.name}`;
    return a.sub;
  };
  return (
    <View>
      <View style={{ gap: isSignal ? 10 : 8 }}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => dispatch(setSection(a.id))}
            accessibilityRole="button"
            accessibilityLabel={`${a.title} ${sub(a)}`}
            style={({ pressed }) => ({
              minHeight: 62,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: isSignal ? palette.shape.radiusMedium : 16,
              borderWidth: isSignal ? 1.5 : 0,
              borderColor: palette.line,
              backgroundColor: pressed ? withAlpha(palette.accent, 0.12) : palette.surfaceHigh,
            })}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: isSignal ? palette.shape.radiusControl : 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isSignal ? palette.accentFill : withAlpha(palette.accent, 0.14),
                borderWidth: isSignal ? 1.5 : 0,
                borderColor: palette.shadowColor,
              }}
            >
              <MaterialIcons name={a.icon} size={20} color={isSignal ? palette.accentInk : palette.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 15.5 }}>{a.title}</Text>
              <Text numberOfLines={1} style={{ marginTop: 1, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13 }}>
                {sub(a)}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={palette.onSurfaceVariant} />
          </Pressable>
        ))}
      </View>
      <BubbleRow pal={pal} go={go} />
    </View>
  );
}

// "Hide the bubble". The Home Pal tile still opens the sheet; when that tile
// isn't on today's Home (Classic hides it until Home is arranged), offer to
// show it so Pal never becomes unreachable.
function BubbleRow({ pal, go }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const hidden = useSelector((s) => s.pal.bubbleHidden);
  const look = useSelector((s) => s.look);
  const [today] = useState(() => new Date());
  const palOnHome = effectiveTiles(homeForSkin(look.home, look.skin), today).some((t) => t.id === "pal");

  const showPalTile = () => {
    const base = homeForSkin(look.home, look.skin);
    const next = patchTile(base, "pal", { hidden: false });
    dispatch(setHome({ ...next, rules: next.rules.filter((x) => !(x.tile === "pal" && x.act === "hide")) }));
  };

  return (
    <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: withAlpha(palette.outlineVariant, 0.5) }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <IconAction
          icon={hidden ? "visibility" : "visibility-off"}
          label={hidden ? "Show the bubble" : "Hide the bubble"}
          accessibilityLabel={hidden ? `Show ${pal.name}’s floating bubble again` : `Hide ${pal.name}’s floating bubble`}
          onPress={() => dispatch(setBubbleHidden(!hidden))}
        />
        {hidden && !palOnHome ? (
          <IconAction icon="home" label="Show Pal on Home" accessibilityLabel={`Show ${pal.name}’s tile on Home`} onPress={showPalTile} />
        ) : null}
        <IconAction icon="face" label={`Edit ${pal.name}`} accessibilityLabel={`Change how ${pal.name} looks and talks`} onPress={() => go("PalBuilder")} />
      </View>
      {hidden || palOnHome ? (
        <Text accessibilityLiveRegion="polite" style={{ marginTop: 8, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5, lineHeight: 17 }}>
          {hidden
            ? palOnHome
              ? `The bubble is hidden. Open ${pal.name} from the Pal tile on Home.`
              : `The bubble is hidden and ${pal.name}’s tile isn’t on Home. Show the tile to keep an easy way back.`
            : `The Pal tile on Home opens ${pal.name} too.`}
        </Text>
      ) : null}
    </View>
  );
}

// ---- What now? ----------------------------------------------------------------

function NowPanel({ pal, nervous, go }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const store = useStore();
  const anchors = useSelector((s) => s.home.anchors);
  const tasks = useSelector((s) => s.home.tasks);
  const docs = useSelector((s) => s.library.docs);
  const [clock, setClock] = useState(() => new Date());
  const [index, setIndex] = useState(0);
  const [acked, setAcked] = useState(null); // id of an "ack" suggestion just accepted

  // Time decides "within 30 min" and night; refresh it once a minute.
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  // A new check-in starts the list over.
  useEffect(() => {
    setIndex(0);
    setAcked(null);
  }, [nervous]);

  const reading = useMemo(() => unfinishedReading(docs), [docs]);
  const list = useMemo(
    () => suggestionsFor({ state: nervous, now: clock, anchors, tasks, reading, pal }),
    [nervous, clock, anchors, tasks, reading, pal]
  );
  const s = list[index % list.length];

  const pick = (v) => {
    dispatch(recordCheckin({ state: v, level: middleOfState(v) }));
    dispatch(setNervousState(v));
  };
  const doIt = async () => {
    const a = s.action;
    if (a.type === "calm") return go("Emergency");
    if (a.type === "open") return dispatch(setSection(a.section));
    if (a.type === "ack") {
      setAcked(s.id);
      // the pressed button goes away; say what replaced it
      return announce(`${pal.name}: ${palSay(pal, "ack")}`);
    }
    if (a.type === "sit") {
      await startSit(store, { minutes: a.minutes, label: a.label, taskId: a.taskId, anchorId: a.anchorId, pal });
      return dispatch(setSection("sit"));
    }
    if (a.type === "read") {
      await startSit(store, { minutes: a.minutes, label: a.label, pal });
      return go("Reader", { id: a.docId });
    }
    return undefined;
  };
  const what = {
    calm: "open the calming steps",
    open: s.action.section === "dump" ? "open the brain dump" : "open Break it down",
    ack: "okay",
    sit: `start ${s.action.minutes} minutes with ${pal.name}`,
    read: `open the reader and start ${s.action.minutes} minutes with ${pal.name}`,
  }[s.action.type];

  return (
    <View>
      <PanelTitle>What now?</PanelTitle>
      {/* In red there is no style-flavoured chatter: just the one step. */}
      {nervous !== "red" ? <Intro>{palSay(pal, "now")}</Intro> : null}
      {nervous !== "green" && nervous !== "yellow" && nervous !== "red" ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 14 }}>You haven’t checked in. How are you right now?</Text>
          <CheckInRow value={nervous} onPick={pick} />
        </View>
      ) : null}
      <PalCard accent>
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`${s.title}. ${s.why}`}>
          <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.displaySemi, fontSize: 19, lineHeight: 25 }}>{s.title}</Text>
          <Text style={{ marginTop: 6, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 14, lineHeight: 20 }}>{s.why}</Text>
        </View>
        {acked === s.id ? (
          <Text style={{ marginTop: 12, color: palette.accent, fontFamily: palette.fonts.bodySemi, fontSize: 14.5 }}>
            {palSay(pal, "ack")}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          {acked !== s.id ? (
            <NpPrimaryButton
              label={s.action.type === "calm" ? "Open the calming steps" : "Do it"}
              icon={s.action.type === "calm" ? "spa" : "arrow-forward"}
              accessibilityLabel={`Do it: ${what}`}
              onPress={doIt}
            />
          ) : null}
          <NpGhostButton
            label="Something else"
            onPress={() => {
              setAcked(null);
              setIndex((i) => i + 1);
            }}
          />
        </View>
      </PalCard>
      {nervous === "red" ? (
        <Text style={{ marginTop: 14, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13, lineHeight: 18 }}>
          Nothing else is needed from you right now.
        </Text>
      ) : null}
    </View>
  );
}

// ---- Break it down ---------------------------------------------------------------

const SOURCE_NOTE = {
  mock: "Mock mode is on, so these are Pal’s offline steps.",
  offline: "No server right now, so these are Pal’s offline steps.",
  limited: "Pal has done a lot of thinking for now, so these are offline steps.",
  error: "The server didn’t answer well, so these are offline steps.",
  quick: "Quick steps, made on your phone.",
};
const SLOW_LINE = "Still thinking. Quick steps are ready if you’d rather not wait.";
const stepsLine = (n) => `${n} small ${n === 1 ? "step" : "steps"}`;

// Status lines are spoken with announce(): a live region that appears
// already filled is never read on the web, and on Android the whole new
// step list would be read out.
function BreakdownPanel({ pal, onCalm }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const store = useStore();
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [result, setResult] = useState(null); // { steps, source, reason }
  const [added, setAdded] = useState({});
  const request = useRef(0);

  useEffect(() => () => {
    request.current += 1; // a reply after the panel closed is ignored
  }, []);

  const run = async () => {
    const t = task.trim();
    if (!t || loading) return;
    const token = request.current + 1;
    request.current = token;
    setLoading(true);
    setSlow(false);
    setResult(null);
    setAdded({});
    announce("Making the steps…");
    const timer = setTimeout(() => {
      if (request.current !== token) return;
      setSlow(true);
      announce(SLOW_LINE);
    }, 6000);
    const r = await requestBreakdown(t);
    clearTimeout(timer);
    if (request.current !== token) return;
    setResult(r);
    setLoading(false);
    setSlow(false);
    announce(r.crisis ? r.reply : stepsLine(r.steps.length));
  };
  const quick = () => {
    request.current += 1;
    setLoading(false);
    setSlow(false);
    if (looksLikeCrisis(task)) {
      setResult({ steps: [], crisis: true, reply: CRISIS_REPLY, source: "local" });
      announce(CRISIS_REPLY);
      return;
    }
    const steps = localBreakdown(task);
    setResult({ steps, source: "local", reason: "quick" });
    announce(stepsLine(steps.length));
  };
  const add = (i, step) => {
    dispatch(addTask(step));
    setAdded((a) => ({ ...a, [i]: true }));
  };

  return (
    <View>
      <PanelTitle>Break it down</PanelTitle>
      <Intro>{palSay(pal, "breakdown")}</Intro>
      <PalField
        value={task}
        onChangeText={(v) => setTask(v.slice(0, TASK_MAX_CHARS))}
        onSubmitEditing={run}
        maxLength={TASK_MAX_CHARS}
        returnKeyType="go"
        placeholder="e.g. write the intro of my thesis"
        accessibilityLabel="The task to break down"
        style={{ marginTop: 12 }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10, alignItems: "center" }}>
        <NpPrimaryButton label="Break it down" icon="call-split" disabled={!task.trim() || loading} onPress={run} />
        {loading && slow ? <NpGhostButton label="Use quick steps now" onPress={quick} /> : null}
      </View>
      {loading ? (
        <Text style={{ marginTop: 12, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 14 }}>
          {slow ? SLOW_LINE : "Making the steps…"}
        </Text>
      ) : null}
      {result?.crisis ? (
        <PalCard>
          <Text selectable style={{ color: palette.onSurface, fontFamily: palette.fonts.body, fontSize: 15, lineHeight: 21 }}>
            {result.reply}
          </Text>
          <View style={{ marginTop: 12 }}>
            <NpPrimaryButton label="Open the calming steps" icon="spa" onPress={onCalm} />
          </View>
        </PalCard>
      ) : result ? (
        <PalCard>
          <Text accessibilityRole="header" style={{ color: palette.onSurface, fontFamily: palette.fonts.bodyBold, fontSize: 15 }}>
            {stepsLine(result.steps.length)}
          </Text>
          <Text style={{ marginTop: 2, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5, lineHeight: 17 }}>
            The button on a step adds it to today’s minimum day.
          </Text>
          <View style={{ marginTop: 6 }}>
            {result.steps.map((step, i) => (
              <View key={`${i}-${step}`} style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingVertical: 4, borderTopWidth: i ? 1 : 0, borderTopColor: withAlpha(palette.outlineVariant, 0.45) }}>
                <Text style={{ width: 24, color: palette.accent, fontFamily: palette.fonts.mono, fontSize: 13 }}>{i + 1}</Text>
                <Text style={{ flex: 1, marginRight: 10, color: palette.onSurface, fontFamily: palette.fonts.body, fontSize: 15, lineHeight: 20 }}>{step}</Text>
                <IconAction
                  icon={added[i] ? "check" : "playlist-add"}
                  done={Boolean(added[i])}
                  disabled={Boolean(added[i])}
                  accessibilityLabel={added[i] ? `Added “${step}” to your minimum day` : `Add “${step}” to your minimum day`}
                  onPress={() => add(i, step)}
                />
              </View>
            ))}
          </View>
          {result.source === "local" && SOURCE_NOTE[result.reason] ? (
            <Text style={{ marginTop: 8, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5, lineHeight: 17 }}>{SOURCE_NOTE[result.reason]}</Text>
          ) : null}
          <View style={{ marginTop: 12 }}>
            <NpGhostButton
              label="Do step 1 with me"
              icon="self-improvement"
              accessibilityLabel={`Do step 1, ${result.steps[0]}, with ${pal.name} for 10 minutes`}
              onPress={async () => {
                await startSit(store, { minutes: 10, label: result.steps[0], pal });
                dispatch(setSection("sit"));
              }}
            />
          </View>
        </PalCard>
      ) : null}
    </View>
  );
}

// ---- Brain dump -------------------------------------------------------------------

function DumpPanel({ pal }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const dump = useSelector((s) => s.pal.dump);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState(null); // { text, undo? }
  const input = useRef(null);
  // Shown under the field and spoken (it appears already filled, so a live
  // region alone would stay silent on the web).
  const tell = (next) => {
    setStatus(next);
    announce(next.text);
  };

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    dispatch(addDump(t));
    setDraft("");
    tell({ text: "Saved." });
    input.current?.focus?.();
  };
  const move = (d, where) => {
    dispatch(where === "day" ? addTask(d.text) : addTodo(d.text));
    dispatch(removeDump(d.id));
    tell({ text: where === "day" ? "Added to your minimum day." : "Added to your to-do list." });
  };
  const remove = (d) => {
    dispatch(removeDump(d.id));
    tell({ text: "Deleted.", undo: d.text });
  };

  return (
    <View>
      <PanelTitle>Brain dump</PanelTitle>
      <Intro>{palSay(pal, "dump")}</Intro>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <PalField
          ref={input}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          blurOnSubmit={false}
          returnKeyType="done"
          placeholder="A thought, a worry, a to-do…"
          accessibilityLabel="New brain dump item"
          style={{ flex: 1 }}
        />
        <IconAction icon="add" accessibilityLabel="Save to the brain dump" disabled={!draft.trim()} onPress={add} />
      </View>
      {status ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
          <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 13 }}>{status.text}</Text>
          {status.undo ? (
            <TextAction
              label="Undo"
              accessibilityLabel={`Undo: bring back “${status.undo}”`}
              onPress={() => {
                dispatch(addDump(status.undo));
                tell({ text: "Back in the dump." });
              }}
            />
          ) : null}
        </View>
      ) : null}
      {dump.length === 0 ? <Intro style={{ marginTop: 14 }}>{palSay(pal, "dumpEmpty")}</Intro> : null}
      {dump.map((d) => (
        <PalCard key={d.id} style={{ marginTop: 10 }}>
          <Text selectable style={{ color: palette.onSurface, fontFamily: palette.fonts.body, fontSize: 15, lineHeight: 21 }}>
            {d.text}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <Chip compact icon="playlist-add" label="Minimum day" accessibilityLabel={`Add “${d.text}” to your minimum day`} onPress={() => move(d, "day")} />
            <Chip compact icon="checklist" label="To-do" accessibilityLabel={`Add “${d.text}” to your to-do list`} onPress={() => move(d, "todo")} />
            <IconAction icon="delete-outline" accessibilityLabel={`Delete “${d.text}”`} onPress={() => remove(d)} />
          </View>
        </PalCard>
      ))}
    </View>
  );
}
