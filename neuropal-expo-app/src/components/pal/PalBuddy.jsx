import { NavigationContext, NavigationRouteContext, useIsFocused } from "@react-navigation/native";
import { useContext, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelector, useStore } from "react-redux";

import { moodFor } from "../../services/palAssistant";
import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { normalizePal } from "../../theme/tokens";
import { withAlpha } from "../primitives";
import { BUBBLE_SIZE, PAL_BUBBLE_HIDDEN_ON, bubblePlacement, bubbleShown } from "./bubbleGeometry";
import { openPalSheet } from "./openPalSheet";
import { Pal } from "./Pal";
import { PalSheet } from "./PalSheet";
import { tickSit } from "./sitControl";

// Pal as a buddy: a small floating Pal, bottom-right on the main screens,
// that opens the assistant sheet. Its face mirrors the check-in (green →
// okay, yellow → off, red → over); idle breathing comes from <Pal> and is off
// at motion "Still". During "Sit with me" it becomes a pill with the time
// left, so Pal stays visible on every screen.

// Size, placement and the routes it skips live in bubbleGeometry.js, shared
// with the screens that keep their last row clear of it.
export { BUBBLE_SIZE, PAL_BUBBLE_HIDDEN_ON } from "./bubbleGeometry";

// `spoken` starts with the visible words (`short`), so the name voice
// control matches on is the one on screen (WCAG 2.5.3).
function sitStatus(sit, now) {
  if (!sit) return null;
  if (sit.endedAt) return { short: "Nice. Note it?", spoken: "Nice. Note it? Your session is done." };
  if (sit.checkIn === "asked") return { short: "Still with it?", spoken: "Still with it? Either answer is fine." };
  const ms = sit.endsAt - now;
  const m = Math.max(0, Math.ceil(ms / 60000));
  return ms < 60000
    ? { short: "<1 min", spoken: "<1 min: under a minute left, sitting with you." }
    : { short: `${m} min`, spoken: `${m} min left, sitting with you.` };
}

// `onPress(ref)` gets the bubble's ref, so focus can come back to it.
export function PalBuddy({ pal: rawPal, mood = "okay", sit = null, now = 0, onPress, bottom = 16, right = 16 }) {
  const palette = usePalette();
  const { isSignal } = useTheme();
  const button = useRef(null);
  const pal = normalizePal(rawPal);
  const status = sitStatus(sit, now);
  const sh = isSignal ? Math.max(3, palette.shape.shadow) : 0;
  const r = isSignal ? palette.shape.radiusControl : BUBBLE_SIZE / 2;
  const label = status ? `${status.spoken} Open ${pal.name}, your assistant.` : `Open ${pal.name}, your assistant`;

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", right, bottom, zIndex: 41, elevation: 41 }}>
      <Pressable ref={button} onPress={() => onPress && onPress(button)} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
        {({ pressed }) => (
          <View>
            {sh ? (
              <View pointerEvents="none" style={{ position: "absolute", top: sh, left: sh, right: -sh, bottom: -sh, borderRadius: r, backgroundColor: palette.shadowColor }} />
            ) : null}
            <View
              style={{
                minWidth: BUBBLE_SIZE,
                height: BUBBLE_SIZE,
                paddingRight: status ? 14 : 0,
                borderRadius: r,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isSignal ? palette.surfaceContainer : withAlpha(palette.surfaceContainer, 0.94),
                // ≥ 3:1 edge on every skin (WCAG 1.4.11)
                borderWidth: isSignal ? Math.max(1.5, palette.shape.border) : 1,
                borderColor: isSignal ? palette.control : palette.outline,
                opacity: pressed && !isSignal ? 0.85 : 1,
                transform: pressed && sh ? [{ translateX: sh }, { translateY: sh }] : [],
                ...(isSignal
                  ? null
                  : { shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }),
              }}
            >
              <View style={{ width: BUBBLE_SIZE - 4, alignItems: "center", justifyContent: "center" }}>
                <Pal pal={pal} size={BUBBLE_SIZE - 4} mood={mood} decorative />
              </View>
              {status ? (
                <Text
                  numberOfLines={1}
                  style={{
                    color: palette.onSurface,
                    fontFamily: isSignal ? palette.fonts.label : palette.fonts.bodySemi,
                    fontSize: isSignal ? 12 : 13,
                    letterSpacing: isSignal ? 0.6 : 0,
                    textTransform: isSignal ? "uppercase" : "none",
                  }}
                >
                  {status.short}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The mount point. Render ONE <PalBuddyHost /> per drawer screen (inside
// AppNavigator's NavOverlay, next to the now-playing pill). Only the focused
// screen's host draws anything, so there is always at most one bubble and one
// sheet. It also runs the "Sit with me" watcher. Props are optional: route
// and navigation come from the screen's context; `hideOn` overrides
// PAL_BUBBLE_HIDDEN_ON.
// ---------------------------------------------------------------------------
export function PalBuddyHost(props) {
  const navigation = useContext(NavigationContext);
  if (navigation) return <FocusAwareHost {...props} navigation={props.navigation || navigation} />;
  // Outside any navigator: always "focused", and navigation actions no-op.
  return <HostCore {...props} focused navigation={props.navigation || null} route={props.route || null} />;
}

function FocusAwareHost(props) {
  const focused = useIsFocused();
  const routeFromContext = useContext(NavigationRouteContext);
  return <HostCore {...props} focused={focused} route={props.route || routeFromContext || null} />;
}

function HostCore({ focused, navigation, route, hideOn = PAL_BUBBLE_HIDDEN_ON }) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const sheetOpen = useSelector((s) => s.pal.sheetOpen);
  const bubbleHidden = useSelector((s) => s.pal.bubbleHidden);
  const sit = useSelector((s) => s.pal.sit);
  const nervous = useSelector((s) => s.home.nervousState);
  const pal = useSelector((s) => s.look.pal);
  const playing = useSelector((s) => s.reader.playing);
  const readerDocId = useSelector((s) => s.reader.docId);
  const [now, setNow] = useState(() => Date.now());

  const sitId = sit ? sit.id : null;
  // The sit watcher: once a second while a session exists, on the focused
  // screen only (one watcher app-wide).
  useEffect(() => {
    if (!focused || !sitId) return undefined;
    const tick = () => {
      const st = store.getState();
      tickSit(store, { pal: st.look.pal, sheetShowsSit: st.pal.sheetOpen && st.pal.section === "sit" });
      setNow(Date.now());
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [focused, sitId, store]);

  if (!focused) return null;

  const name = route ? route.name : null;
  // route param `editing` (e.g. a note open in Notes) hides it like a hidden route
  const editing = Boolean(route && route.params && route.params.editing);
  const showBubble =
    hideOn === PAL_BUBBLE_HIDDEN_ON
      ? bubbleShown(name, { bubbleHidden, sitting: Boolean(sit), editing })
      : !hideOn.includes(name) && !editing && (!bubbleHidden || Boolean(sit));
  // Above the now-playing pill and the screen's own bottom-right button,
  // outside the insets.
  const { bottom, right } = bubblePlacement(name, insets, Boolean(playing && readerDocId));

  return (
    <>
      {showBubble ? (
        <PalBuddy
          pal={pal}
          mood={moodFor(nervous)}
          sit={sit}
          now={now}
          bottom={bottom}
          right={right}
          onPress={(ref) => openPalSheet(null, { returnFocusTo: ref })}
        />
      ) : null}
      <PalSheet visible={sheetOpen} navigation={navigation} now={now} />
    </>
  );
}
