import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useDispatch, useSelector, useStore } from "react-redux";

import { announce } from "../../services/announce";
import { SIT_LENGTHS, moodFor } from "../../services/palAssistant";
import { toggleTask } from "../../store/slices/homeSlice";
import { saveSitNote, sitCheckIn, sitCleared } from "../../store/slices/palSlice";
import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { palSay } from "../../theme/tokens";
import { NpGhostButton, NpPrimaryButton, withAlpha } from "../primitives";
import { IconAction, Intro, PalCard, PalField, PanelTitle, ProgressBar } from "./bits";
import { Pal } from "./Pal";
import { finishSit, joinFocus, leftLabel, startSit, stopSit } from "./sitControl";

// "Sit with me" — body doubling. Pick 10 / 25 / 45 min; Pal stays on screen
// with a calm timer (minutes, not ticking seconds), asks once at halfway
// ("Still with it? Either answer is fine."), and at the end offers to note
// what you did. The clock is the app's focus timer (see sitControl.js).

export function SitPanel({ pal, now: hostNow }) {
  const store = useStore();
  const sit = useSelector((s) => s.pal.sit);
  const focus = useSelector((s) => s.focus);
  const [clock, setClock] = useState(() => Math.max(Date.now(), hostNow || 0));
  const ticking = Boolean((sit && !sit.endedAt) || focus.running);

  useEffect(() => {
    if (!ticking) return undefined;
    setClock(Date.now());
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  if (sit && sit.endedAt) return <SitEnded pal={pal} sit={sit} />;
  if (sit) return <SitRunning pal={pal} sit={sit} now={clock} store={store} />;
  return <SitPicker pal={pal} focus={focus} now={clock} store={store} />;
}

function SitPicker({ pal, focus, now, store }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const lastSit = useSelector((s) => s.pal.sits[0]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const blockLeft = focus.running && focus.endsAt ? Math.max(1, Math.ceil((focus.endsAt - now) / 60000)) : 0;

  const start = async (minutes) => {
    if (busy) return;
    setBusy(true);
    await startSit(store, { minutes, label, pal }).catch(() => {});
    setBusy(false);
  };

  return (
    <View>
      <PanelTitle>Sit with me</PanelTitle>
      <Intro>{palSay(pal, "sit")}</Intro>
      {focus.running && focus.phase === "work" ? (
        <PalCard accent>
          <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 15, lineHeight: 21 }}>
            {`A focus block is already running: ${blockLeft} min left.`}
          </Text>
          <View style={{ marginTop: 10 }}>
            <NpPrimaryButton label="Sit with me for the rest" icon="self-improvement" onPress={() => joinFocus(store, { label, pal })} />
          </View>
          <Text style={{ marginTop: 8, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 12.5 }}>
            Picking a length below starts a new block instead.
          </Text>
        </PalCard>
      ) : null}
      <PalField
        value={label}
        onChangeText={(v) => setLabel(v.slice(0, 120))}
        maxLength={120}
        returnKeyType="done"
        placeholder="What are you working on? (optional)"
        accessibilityLabel="What you’re working on, optional"
        style={{ marginTop: 12 }}
      />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        {SIT_LENGTHS.map((m) => (
          <Pressable
            key={m}
            disabled={busy}
            onPress={() => start(m)}
            accessibilityRole="button"
            accessibilityLabel={`Sit with ${pal.name} for ${m} minutes`}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 76,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: isSignal ? palette.shape.radiusMedium : 18,
              borderWidth: isSignal ? 1.5 : 1,
              borderColor: isSignal ? palette.control : withAlpha(palette.accent, 0.35),
              backgroundColor: pressed ? withAlpha(palette.accent, 0.16) : isSignal ? palette.surfaceHigh : withAlpha(palette.accent, 0.08),
            })}
          >
            <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.display, fontSize: 28 }}>{m}</Text>
            <Text style={{ color: palette.onSurfaceVariant, fontFamily: palette.fonts.label, fontSize: 11.5, letterSpacing: 1.2 }}>MIN</Text>
          </Pressable>
        ))}
      </View>
      {focus.running && focus.phase === "break" ? (
        <Intro style={{ marginTop: 10, fontSize: 13 }}>You’re on a break. Starting a sit ends it.</Intro>
      ) : null}
      <Intro style={{ marginTop: 12, fontSize: 13 }}>Quiet company can make starting easier. You can stop any time.</Intro>
      {lastSit ? (
        <Intro style={{ marginTop: 8, fontSize: 13 }}>{`Last time: ${lastSit.minutes} min${lastSit.note ? ` · ${lastSit.note}` : ""}`}</Intro>
      ) : null}
    </View>
  );
}

const NOT_REALLY = "That’s okay. Stop here, or keep going?";

function SitRunning({ pal, sit, now, store }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const dispatch = useDispatch();
  const nervous = useSelector((s) => s.home.nervousState);
  const [notReally, setNotReally] = useState(false);
  const total = Math.max(1, sit.endsAt - sit.startedAt);
  const done = Math.max(0, Math.min(1, (now - sit.startedAt) / total));
  const left = leftLabel(sit, now);

  return (
    <View>
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <Pal pal={pal} size={128} mood={moodFor(nervous)} decorative />
        {/* Not a live region: it would speak every minute. sitControl
            announces the halfway check-in and the end instead. */}
        <Text
          accessibilityRole="timer"
          accessibilityLabel={`${pal.name} is sitting with you. ${left}.`}
          style={{ marginTop: 6, color: palette.onSurface, fontFamily: palette.fonts.display, fontSize: isSignal ? 38 : 34, letterSpacing: isSignal ? -0.4 : -0.6 }}
        >
          {left}
        </Text>
        <Text style={{ marginTop: 2, color: palette.onSurfaceVariant, fontFamily: palette.fonts.body, fontSize: 14, textAlign: "center" }}>
          {sit.label ? `Working on: ${sit.label}` : "Just company. No task needed."}
        </Text>
      </View>
      <ProgressBar value={done} accessibilityLabel={`${Math.round(done * 100)} percent of this sit done`} />
      {sit.checkIn === "asked" ? (
        <PalCard accent>
          {/* The question is announced by sitControl when it's asked. */}
          <Text style={{ color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 15.5, lineHeight: 21 }}>
            {notReally ? NOT_REALLY : palSay(pal, "sitCheck")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {notReally ? (
              <>
                <NpPrimaryButton label="Stop here" onPress={() => stopSit(store)} />
                <NpGhostButton label="Keep going" onPress={() => dispatch(sitCheckIn("no"))} />
              </>
            ) : (
              <>
                <NpPrimaryButton label="Still going" onPress={() => dispatch(sitCheckIn("yes"))} />
                <NpGhostButton
                  label="Not really"
                  onPress={() => {
                    setNotReally(true);
                    announce(`${pal.name}: ${NOT_REALLY}`);
                  }}
                />
              </>
            )}
          </View>
        </PalCard>
      ) : (
        <Intro style={{ marginTop: 12, textAlign: "center" }}>{palSay(pal, "sitStart")}</Intro>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 16 }}>
        <NpPrimaryButton label="I’m done" icon="check" accessibilityLabel="I’m done: end the sit" onPress={() => finishSit(store)} />
        <NpGhostButton label="Stop" accessibilityLabel="Stop the sit early" onPress={() => stopSit(store)} />
      </View>
    </View>
  );
}

function SitEnded({ pal, sit }) {
  const palette = usePalette();
  const dispatch = useDispatch();
  const task = useSelector((s) => (sit.taskId ? s.home.tasks.find((t) => t.id === sit.taskId) : null));
  const [note, setNote] = useState("");
  const [ticked, setTicked] = useState(false);
  const spent = Math.max(1, Math.round(((sit.endedAt || sit.endsAt) - sit.startedAt) / 60000));
  const summary =
    sit.endReason === "time"
      ? `That was ${sit.minutes} ${sit.minutes === 1 ? "minute" : "minutes"}${sit.label ? ` on ${sit.label}` : ""}.`
      : `You stopped after ${spent} ${spent === 1 ? "minute" : "minutes"}. That counts.`;

  return (
    <View>
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <Pal pal={pal} size={96} mood="okay" decorative />
      </View>
      <PanelTitle>{palSay(pal, "sitEnd")}</PanelTitle>
      <Intro accessibilityLiveRegion="polite">{summary}</Intro>
      {task && !task.done && !ticked ? (
        <View style={{ marginTop: 12 }}>
          <IconAction
            icon="check"
            label={`Tick off “${task.title}”`}
            accessibilityLabel={`Tick “${task.title}” off today’s list`}
            onPress={() => {
              dispatch(toggleTask(task.id));
              setTicked(true);
            }}
          />
        </View>
      ) : null}
      {ticked ? <Intro style={{ marginTop: 10, color: palette.accent }}>Ticked off today’s list.</Intro> : null}
      <PalField
        value={note}
        onChangeText={(v) => setNote(v.slice(0, 500))}
        maxLength={500}
        multiline
        placeholder="What did you do? (optional)"
        accessibilityLabel="Note what you did, optional"
        style={{ marginTop: 14, minHeight: 72, textAlignVertical: "top" }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        <NpPrimaryButton
          label="Save note"
          icon="edit-note"
          disabled={!note.trim()}
          onPress={() => {
            dispatch(saveSitNote(note));
            announce("Saved."); // the panel moves on to the picker; say it worked
          }}
        />
        <NpGhostButton label="Not now" onPress={() => dispatch(sitCleared())} />
      </View>
    </View>
  );
}
