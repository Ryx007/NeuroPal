import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { announce } from "../../services/announce";
import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { hapticCommit, hapticTick } from "../motion/haptics";
import { useHomeMotion } from "../motion/motion";
import { withAlpha } from "../primitives";
import { StateGlyph } from "./StateGlyph";
import { LEVEL_STEP, REGION_EDGES, STATE_REGIONS, clamp01, levelFor, regionOf, stateTint, toValue } from "./stateScale";

// "How are you feeling right now?" as a real slider. One 0–100 track in
// three equal regions (okay / a bit off / overwhelmed). Drag the knob or tap
// anywhere on the track; when you let go, the region the knob rests in
// becomes your state (the same setNervousState the buttons dispatch) and the
// exact level is saved too. Screen readers adjust it in steps of 5 and the
// arrow keys move it on the web: the knob moves at once and the level saves
// a second after the last step (or when focus leaves, on the web), so you can
// step through to 70–100 without the calming steps opening at 67 on the way.
// onCommit(state, level, { viaSteps }) says how the change was made; Home
// opens the calming steps only for a drag or tap. The knob runs on the UI
// thread (gesture-handler Pan/Tap + Reanimated), so dragging stays smooth
// even when JS is busy. Classic and Signal share the behaviour and differ
// only in look.

const KNOB = 30;
const INSET = KNOB / 2; // the track starts and ends under the knob's centre
const LANE = 26; // value bubble above the track
const TRACK = 44; // touch height of the track row (≥ 44)
const HEIGHT = LANE + TRACK;
const LINE_Y = LANE + TRACK / 2; // centre line of the track
const EDGES = [0, REGION_EDGES[0], REGION_EDGES[1], 1];
// "activate" = a screen-reader double tap. Without it TalkBack taps the
// track's centre, which saved "Bit off · 50".
const A11Y_ACTIONS = [{ name: "increment" }, { name: "decrement" }, { name: "activate" }];
const KEY_STEPS = { ArrowRight: LEVEL_STEP, ArrowUp: LEVEL_STEP, ArrowLeft: -LEVEL_STEP, ArrowDown: -LEVEL_STEP, PageUp: 10, PageDown: -10 };
const STEP_SAVE_MS = 1000; // keys / screen reader: save this long after the last step
// Warns before use (WCAG 3.2.2): only a drag or tap opens the calming steps.
const HINT = "Saves a second after your last change. Dragging or tapping into Overwhelmed opens the calming steps.";
const DIM = 0.55; // regions the knob isn't in (never fainter: the track keeps its shape)
const calmEase = Easing.out(Easing.cubic);

function svgId(raw, prefix) {
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

// One region's stretch of the track. Brightest while the knob is in it. The
// fade only starts when the active region actually changes (a timing set
// inside the style itself would restart on every drag frame and lag).
function Band({ index, left, width, top, height, radius, color, pos, engaged, instant, children }) {
  const opacity = useSharedValue(DIM);
  useAnimatedReaction(
    () => (engaged.get() > 0.5 && regionOf(pos.get()) === index ? 1 : DIM),
    (target, prev) => {
      if (target === prev) return;
      opacity.set(instant || prev === null ? target : withTiming(target, { duration: 160 }));
    },
    [index, instant]
  );
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left, top, width, height, borderRadius: radius, backgroundColor: color, overflow: "hidden" }, style]}
    >
      {children}
    </Animated.View>
  );
}

// Signal's warning language: hazard stripes + a word, never red alone.
function Hazard({ width, height }) {
  const palette = usePalette();
  const pid = svgId(useId(), "hz");
  return (
    <Svg width={width} height={height}>
      <Defs>
        <Pattern id={pid} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Rect x={0} y={0} width={2.5} height={6} fill={palette.shadowColor} fillOpacity={0.6} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${pid})`} />
    </Svg>
  );
}

// A small cousin of the S-Today dial: gradient body, hard shadow, region glyph.
function SignalKnobFace({ region, tint }) {
  const palette = usePalette();
  const gid = svgId(useId(), "skn");
  const sh = Math.min(3, Math.max(2, palette.shape.shadow));
  const c = KNOB / 2;
  return (
    <>
      <Svg width={KNOB + sh} height={KNOB + sh} style={{ position: "absolute", left: 0, top: 0 }}>
        <Defs>
          <RadialGradient id={gid} cx="38%" cy="32%" r="75%">
            <Stop offset="0" stopColor={palette.surfaceHighest} />
            <Stop offset="1" stopColor={palette.surfaceLowest} />
          </RadialGradient>
        </Defs>
        <Circle cx={c + sh} cy={c + sh} r={c - 1} fill={palette.shadowColor} />
        <Circle cx={c} cy={c} r={c - 1.5} fill={`url(#${gid})`} stroke={region ? tint : palette.control} strokeWidth={2} />
      </Svg>
      <View style={{ width: KNOB, height: KNOB, alignItems: "center", justifyContent: "center" }}>
        {region ? (
          <StateGlyph shape={region.shape} color={tint} size={11} />
        ) : (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.onSurfaceVariant }} />
        )}
      </View>
    </>
  );
}

function ClassicKnobFace({ region, tint }) {
  const palette = usePalette();
  return (
    <View
      style={{
        width: KNOB,
        height: KNOB,
        borderRadius: KNOB / 2,
        backgroundColor: palette.surfaceHighest,
        borderWidth: 2.5,
        borderColor: region ? tint : palette.outline,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: region ? tint : "#000000",
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
    >
      {region ? (
        <MaterialIcons name={region.icon} size={18} color={tint} />
      ) : (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.onSurfaceVariant }} />
      )}
    </View>
  );
}

function Bubble({ region, tint, text, dragging, isSignal }) {
  const palette = usePalette();
  if (isSignal) {
    const r = Math.min(4, Math.round(palette.shape.radiusControl * 0.4));
    const sh = palette.shape.shadow > 0 ? 2 : 0;
    return (
      <View>
        {sh ? <View style={{ position: "absolute", top: sh, left: sh, right: -sh, bottom: -sh, borderRadius: r, backgroundColor: palette.shadowColor }} /> : null}
        <View
          style={{
            height: 22,
            paddingHorizontal: 8,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: r,
            borderWidth: 1.5,
            borderColor: dragging && region ? tint : palette.control,
            backgroundColor: palette.surfaceContainer,
          }}
        >
          {region ? <StateGlyph shape={region.shape} color={tint} size={9} /> : null}
          <Text
            numberOfLines={1}
            style={{ marginLeft: region ? 6 : 0, color: palette.onSurface, fontFamily: palette.fonts.label, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}
          >
            {text}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View
      style={{
        height: 22,
        paddingHorizontal: 9,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 11,
        backgroundColor: palette.surfaceHigh,
        borderWidth: 1,
        borderColor: dragging && region ? withAlpha(tint, 0.7) : withAlpha(palette.outlineVariant, 0.5),
      }}
    >
      {region ? <MaterialIcons name={region.icon} size={13} color={tint} /> : null}
      <Text numberOfLines={1} style={{ marginLeft: region ? 5 : 0, color: palette.onSurface, fontFamily: palette.fonts.bodySemi, fontSize: 12 }}>
        {text}
      </Text>
    </View>
  );
}

// Words + glyphs under each region (large tiles). Decorative for screen
// readers: the slider's own value already says the region.
function Legend({ active, isSignal }) {
  const palette = usePalette();
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ flexDirection: "row", paddingHorizontal: INSET, marginTop: 2 }}
    >
      {STATE_REGIONS.map((r, i) => {
        const tint = stateTint(palette, r.id);
        const on = active === i;
        return (
          <View key={r.id} style={{ flex: EDGES[i + 1] - EDGES[i], flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
            {isSignal ? <StateGlyph shape={r.shape} color={tint} size={9} /> : <MaterialIcons name={r.icon} size={14} color={tint} />}
            <Text
              numberOfLines={1}
              style={
                isSignal
                  ? { marginLeft: 5, color: on ? palette.onSurface : palette.onSurfaceVariant, fontFamily: palette.fonts.label, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }
                  : { marginLeft: 4, color: on ? palette.onSurface : palette.onSurfaceVariant, fontFamily: palette.fonts.bodyMedium, fontSize: 12 }
              }
            >
              {r.word}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// Signal's tick ruler under the knob (same vocabulary as the anchor ruler).
function Ticks({ span }) {
  const palette = usePalette();
  const marks = [];
  for (let k = 1; k < 30; k += 1) {
    if (k === 10 || k === 20) continue; // the region edges get major ticks below
    marks.push({ x: INSET + (k / 30) * span, major: false });
  }
  for (const e of EDGES) marks.push({ x: INSET + e * span, major: true });
  return marks.map((m) => (
    <View
      key={`${m.major ? "M" : "m"}${m.x.toFixed(1)}`}
      pointerEvents="none"
      style={{
        position: "absolute",
        left: m.x - (m.major ? 1 : 0.75),
        top: LINE_Y - 4 - (m.major ? 15 : 7),
        width: m.major ? 2 : 1.5,
        height: m.major ? 15 : 7,
        backgroundColor: m.major ? palette.onSurfaceVariant : palette.outline,
      }}
    />
  ));
}

// `label` is the slider's own name: the state buttons above it are already
// "How are you feeling right now".
export function StateSlider({ nervous, level, onCommit, legend = false, pos: sharedPos, engaged: sharedEngaged, label = "Fine-tune how you feel, 0 to 100", style }) {
  // The gesture worklets reach the latest handlers through a ref (see `api`
  // below), which React Compiler can't prove safe, so this one component
  // opts out of auto-memoisation; the gesture itself is memoised by hand.
  "use no memo";
  const palette = usePalette();
  const { isSignal } = useTheme();
  const motion = useHomeMotion();
  const committed = levelFor(nervous, level); // null = no check-in yet
  const hintId = svgId(useId(), "slh");

  // The tile may share pos/engaged with its dial (Signal); otherwise own them.
  const ownPos = useSharedValue(committed ?? 0.5);
  const ownEngaged = useSharedValue(committed == null ? 0 : 1);
  const pos = sharedPos || ownPos;
  const engaged = sharedEngaged || ownEngaged;
  const width = useSharedValue(0);
  const bubbleW = useSharedValue(0);
  const lift = useSharedValue(0);
  const dragging = useSharedValue(0);
  const lastRegion = useSharedValue(committed == null ? -1 : regionOf(committed));
  const lastValue = useSharedValue(-1);

  const [w, setW] = useState(0);
  const [live, setLive] = useState(null); // {v, r} while a finger is dragging
  const [stepped, setStepped] = useState(null); // {v, r} after key / screen-reader steps, until they save
  const [focusRing, setFocusRing] = useState(false);
  const justCommitted = useRef(committed); // the level this slider last saved
  const stored = useRef(committed); // the store's level, kept current even mid-drag
  const pending = useRef(null); // { lv, timer }: steps not saved yet
  const valueRef = useRef(committed == null ? null : toValue(committed));

  const settle = motion.slider.settle;
  const calm = motion.slider.calmSettle;
  const liftTo = motion.slider.lift;
  const animOn = motion.on;

  // Move the knob (keys, screen reader, buttons, store changes).
  const glide = (target) => {
    if (settle) pos.set(withSpring(target, settle));
    else if (calm) pos.set(withTiming(target, { duration: calm, easing: calmEase }));
    else pos.set(target);
  };
  const engage = (on) => {
    const to = on ? 1 : 0;
    engaged.set(animOn ? withTiming(to, { duration: calm || 200 }) : to);
  };

  // Steps not saved yet are dropped (a drag, a tap or the store took over).
  const dropSteps = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setStepped(null);
  };

  // Follow the store: a state button, another screen or a cleared state.
  useEffect(() => {
    stored.current = committed;
    if (justCommitted.current === committed) return; // our own save coming back
    // A check-in made elsewhere wins over steps that haven't saved yet.
    dropSteps();
    valueRef.current = committed == null ? null : toValue(committed);
    if (dragging.get() === 1) return; // the drag decides; a cancelled one goes back to stored.current
    justCommitted.current = committed;
    glide(committed ?? 0.5);
    engage(committed != null);
    lastRegion.set(committed == null ? -1 : regionOf(committed));
  }, [committed]); // eslint-disable-line react-hooks/exhaustive-deps

  // `how.viaSteps`: keys or a screen reader made it, not a drag or a tap.
  const commitLevel = (lv, how) => {
    dropSteps();
    const snapped = toValue(lv) / 100;
    justCommitted.current = snapped;
    valueRef.current = toValue(snapped);
    hapticCommit();
    if (onCommit) onCommit(STATE_REGIONS[regionOf(snapped)].id, snapped, how || { viaSteps: false });
  };
  // Keyboard and screen reader: the knob moves now; the level saves after a
  // pause (STEP_SAVE_MS), on blur (web) or when the slider goes away.
  const stepTo = (v) => {
    const lv = Math.max(0, Math.min(100, Math.round(v))) / 100;
    glide(lv);
    engage(true);
    lastRegion.set(regionOf(lv));
    valueRef.current = toValue(lv);
    setStepped({ v: toValue(lv), r: regionOf(lv) });
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { lv, timer: setTimeout(() => api.current.flush(), STEP_SAVE_MS) };
  };
  const stepBy = (delta) => stepTo((valueRef.current ?? 50) + delta);
  const flushSteps = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setStepped(null);
    // Stepped away and back again: nothing to save.
    if (stored.current != null && toValue(stored.current) === toValue(p.lv)) return;
    commitLevel(p.lv, { viaSteps: true });
  };

  // UI-thread → JS bridge with a stable identity, so the gesture below is
  // built once and never holds stale props.
  const api = useRef({});
  useLayoutEffect(() => {
    api.current = {
      commit: commitLevel,
      flush: flushSteps,
      begin: dropSteps, // a drag started: it replaces any unsaved steps
      live: (v, r) => setLive({ v, r }),
      end: () => setLive(null),
      tick: hapticTick,
      // A cancelled drag: back to what the store holds now (it may have
      // changed mid-drag, e.g. a widget or Pal sheet check-in).
      revert: () => {
        const s = stored.current;
        justCommitted.current = s;
        valueRef.current = s == null ? null : toValue(s);
        glide(s ?? 0.5);
        engage(s != null);
        lastRegion.set(s == null ? -1 : regionOf(s));
      },
    };
  });
  // Steps still waiting when the slider unmounts are saved, not lost.
  useEffect(() => () => api.current.flush?.(), []);
  const toJS = useCallback((name, a, b) => {
    const fn = api.current[name];
    if (fn) fn(a, b);
  }, []);

  const gesture = useMemo(() => {
    const posFromX = (x) => {
      "worklet";
      const span = width.get() - KNOB;
      return span > 0 ? clamp01((x - INSET) / span) : 0.5;
    };
    const follow = (p) => {
      "worklet";
      const r = regionOf(p);
      if (r !== lastRegion.get()) {
        lastRegion.set(r);
        scheduleOnRN(toJS, "tick");
      }
      const v = toValue(p);
      if (v !== lastValue.get()) {
        lastValue.set(v);
        scheduleOnRN(toJS, "live", v, r);
      }
    };
    const raise = () => {
      "worklet";
      if (liftTo > 1) lift.set(withTiming(1, { duration: 110 }));
    };
    const lower = () => {
      "worklet";
      if (liftTo > 1) lift.set(settle ? withSpring(0, settle) : withTiming(0, { duration: 140 }));
    };
    // Activates after 3 px, before the drawer's left-edge swipe (5 px), so a
    // drag that starts near 0 moves the knob instead of opening the drawer.
    const pan = Gesture.Pan()
      .activeOffsetX([-3, 3])
      .failOffsetY([-12, 12])
      .onBegin(() => {
        "worklet";
        raise();
      })
      .onStart((e) => {
        "worklet";
        scheduleOnRN(toJS, "begin");
        dragging.set(1);
        engaged.set(animOn ? withTiming(1, { duration: 160 }) : 1);
        const p = posFromX(e.x);
        pos.set(p);
        follow(p);
      })
      .onUpdate((e) => {
        "worklet";
        const p = posFromX(e.x);
        pos.set(p);
        follow(p);
      })
      .onEnd((e, success) => {
        "worklet";
        if (success) scheduleOnRN(toJS, "commit", pos.get());
        else scheduleOnRN(toJS, "revert");
      })
      .onFinalize(() => {
        "worklet";
        lower();
        if (dragging.get() === 1) {
          dragging.set(0);
          lastValue.set(-1);
          scheduleOnRN(toJS, "end");
        }
      });
    // Tap anywhere on the track: the knob jumps there and it saves.
    const tap = Gesture.Tap()
      .maxDistance(12)
      .maxDuration(1500)
      .onBegin(() => {
        "worklet";
        raise();
      })
      .onEnd((e, success) => {
        "worklet";
        if (!success) return;
        const p = toValue(posFromX(e.x)) / 100;
        lastRegion.set(regionOf(p));
        engaged.set(animOn ? withTiming(1, { duration: 160 }) : 1);
        pos.set(settle ? withSpring(p, settle) : calm ? withTiming(p, { duration: calm, easing: calmEase }) : p);
        scheduleOnRN(toJS, "commit", p);
      })
      .onFinalize(() => {
        "worklet";
        lower();
      });
    return Gesture.Race(pan, tap);
  }, [toJS, settle, calm, liftTo, animOn, pos, engaged, width, lift, dragging, lastRegion, lastValue]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.get() * Math.max(0, width.get() - KNOB) }, { scale: 1 + (liftTo - 1) * lift.get() }],
  }));
  const bubbleStyle = useAnimatedStyle(() => {
    const W = width.get();
    const bw = bubbleW.get();
    const cx = INSET + pos.get() * Math.max(0, W - KNOB);
    const x = Math.min(Math.max(0, cx - bw / 2), Math.max(0, W - bw));
    return { opacity: bw > 0 ? 1 : 0, transform: [{ translateX: x }] };
  });

  const shown = live || stepped || (committed != null ? { v: toValue(committed), r: regionOf(committed) } : null);
  const region = shown ? STATE_REGIONS[shown.r] : null;
  const tint = region ? stateTint(palette, region.id) : palette.outline;
  const bubbleText = region ? `${region.word} · ${shown.v}` : "Drag or tap to check in";
  const a11yText = region ? `${region.word}, ${shown.v}` : "Not checked in yet";
  const a11yNow = shown ? shown.v : 50;

  const onA11yAction = (e) => {
    const name = e.nativeEvent.actionName;
    if (name === "increment") stepBy(LEVEL_STEP);
    else if (name === "decrement") stepBy(-LEVEL_STEP);
    // A double tap is not a tap on the track: say where it is, save nothing.
    else if (name === "activate") announce(`${a11yText}. Swipe up or down to change.`);
  };
  const onKeyDown = (e) => {
    const key = e.key ?? e.nativeEvent?.key;
    let next = null;
    if (key in KEY_STEPS) next = (valueRef.current ?? 50) + KEY_STEPS[key];
    else if (key === "Home") next = 0;
    else if (key === "End") next = 100;
    if (next == null) return;
    if (e.preventDefault) e.preventDefault();
    setFocusRing(true);
    stepTo(next);
  };
  const webProps =
    Platform.OS === "web"
      ? {
          focusable: true,
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": a11yNow,
          "aria-valuetext": a11yText,
          "aria-describedby": hintId,
          onKeyDown,
          onFocus: (e) => {
            let visible = true;
            try {
              const t = e?.nativeEvent?.target;
              if (t && typeof t.matches === "function") visible = t.matches(":focus-visible");
            } catch (err) {
              visible = true;
            }
            setFocusRing(visible);
          },
          onBlur: () => {
            setFocusRing(false);
            flushSteps();
          },
        }
      : null;

  const span = Math.max(0, w - KNOB);
  const bandH = 8;
  const gap = isSignal ? 2 : 3;
  const bandTop = LINE_Y - bandH / 2;

  return (
    <View style={style}>
      <GestureDetector gesture={gesture} touchAction="pan-y" userSelect="none">
        <Animated.View
          onLayout={(e) => {
            const lw = e.nativeEvent.layout.width;
            width.set(lw);
            setW(lw);
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityHint={HINT}
          // Words only on native: with a range too, Android adds "50 percent"
          // (also before any check-in) and says the number twice.
          accessibilityValue={{ text: a11yText }}
          accessibilityActions={A11Y_ACTIONS}
          onAccessibilityAction={onA11yAction}
          {...webProps}
          style={[{ height: HEIGHT }, Platform.OS === "web" ? { cursor: "pointer", outlineStyle: "none" } : null]}
        >
          {focusRing ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: -6,
                right: -6,
                top: -2,
                bottom: -2,
                borderRadius: isSignal ? Math.max(4, Math.round(palette.shape.radiusControl * 0.6)) : 16,
                borderWidth: 2,
                borderColor: palette.accent,
              }}
            />
          ) : null}
          {w > 0
            ? STATE_REGIONS.map((r, i) => {
                const x0 = INSET + EDGES[i] * span + (i ? gap / 2 : 0);
                const x1 = INSET + EDGES[i + 1] * span - (i < 2 ? gap / 2 : 0);
                const bw = Math.max(0, x1 - x0);
                return (
                  <Band
                    key={r.id}
                    index={i}
                    left={x0}
                    width={bw}
                    top={bandTop}
                    height={bandH}
                    radius={isSignal ? Math.min(2, palette.shape.radiusControl) : bandH / 2}
                    color={stateTint(palette, r.id)}
                    pos={pos}
                    engaged={engaged}
                    instant={!animOn}
                  >
                    {isSignal && r.id === "red" ? <Hazard width={bw} height={bandH} /> : null}
                  </Band>
                );
              })
            : null}
          {/* 1 px rule under the track: its full extent stays ≥ 3:1 whatever the
              regions' fill (WCAG 1.4.11). */}
          {w > 0 ? (
            <View
              pointerEvents="none"
              style={{ position: "absolute", left: INSET, top: bandTop + bandH + 2, width: span, height: 1, backgroundColor: palette.outline }}
            />
          ) : null}
          {isSignal && w > 0 ? <Ticks span={span} /> : null}
          <Animated.View
            pointerEvents="none"
            onLayout={(e) => bubbleW.set(e.nativeEvent.layout.width)}
            style={[{ position: "absolute", left: 0, top: 0 }, bubbleStyle]}
          >
            <Bubble region={region} tint={tint} text={bubbleText} dragging={Boolean(live)} isSignal={isSignal} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: LINE_Y - KNOB / 2, width: KNOB, height: KNOB }, knobStyle]}>
            {isSignal ? <SignalKnobFace region={region} tint={tint} /> : <ClassicKnobFace region={region} tint={tint} />}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      {/* The web drops accessibilityHint: the same words as a description. */}
      {Platform.OS === "web" ? (
        <Text id={hintId} style={{ display: "none" }}>
          {HINT}
        </Text>
      ) : null}
      {legend ? <Legend active={region ? shown.r : -1} isSignal={isSignal} /> : null}
    </View>
  );
}
