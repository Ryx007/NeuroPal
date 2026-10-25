import { useIsFocused } from "@react-navigation/native";
import { Asset } from "expo-asset";
import { createElement, useId } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";
import { useSelector } from "react-redux";

import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { RED_STATE_FIELD } from "../../theme/tokens";
import { stateTint } from "../home/stateScale";
import { StatePulse } from "../motion/StatePulse";
import { withAlpha } from "../primitives";
import { SignalField } from "./SignalField";

const GRAIN = require("../../../assets/grain.png");

// Web: RN-web's Image draws a "repeat" source once, so the grain is a plain
// CSS background there. Native: Image resizeMode="repeat" tiles it.
function Grain({ opacity }) {
  if (Platform.OS === "web") {
    const uri = Asset.fromModule(GRAIN).uri;
    return createElement("div", {
      "aria-hidden": true,
      style: { position: "absolute", inset: 0, backgroundImage: `url(${uri})`, backgroundRepeat: "repeat", opacity, pointerEvents: "none" },
    });
  }
  return <Image source={GRAIN} resizeMode="repeat" style={[StyleSheet.absoluteFill, { opacity }]} />;
}

// Engineering grid + optional living field + texture, behind a screen's
// content. Renders nothing in the Classic skin (Classic keeps its plain
// surfaces), so screens can mount it unconditionally.
//
//   field  — show the Chladni/interference GL field (Home + studio preview).
//            Everywhere else: grid and texture only.
// Screens use SignalBackdrop (pauses the field when the screen loses focus);
// anything outside a navigator uses SignalBackdropView with `focused`.
// The screen with the living field (Home) also gets a brief, faint wash of
// the state colour when your check-in changes (statePulse).
export function SignalBackdrop({ field = false }) {
  const focused = useIsFocused();
  return <SignalBackdropView field={field} focused={focused} statePulse={field && focused} />;
}

// Reads the check-in from the store; only mounted where statePulse is on.
function StateWash() {
  const palette = usePalette();
  const nervous = useSelector((s) => s.home.nervousState);
  return <StatePulse kind="backdrop" state={nervous} color={stateTint(palette, nervous)} />;
}

export function SignalBackdropView({ field = false, focused = true, paletteOverride, statePulse = false }) {
  const themePalette = usePalette();
  const { motionLevel: themeMotion, redState, reduceMotion } = useTheme();
  const palette = paletteOverride || themePalette;
  // SVG pattern ids are document-global on web: two backdrops (a drawer
  // screen + a stack screen) must not share one, or the hidden one wins.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (palette.skin !== "signal") return null;
  // A preview palette carries its own motion setting; the OS reduce-motion
  // switch still wins.
  const motionLevel = paletteOverride ? (reduceMotion ? "Still" : palette.motion.level) : themeMotion;

  const showField = field && (palette.field === "Chladni" || palette.field === "Interference");
  const gridStrong = palette.field === "Grid";
  const baseSpeed = { Still: 0, Calm: 0.35, Lively: 1, Wild: 1.9 }[motionLevel] ?? 1;
  const speed = focused ? baseSpeed * (redState ? RED_STATE_FIELD.speed : 1) : 0;
  const amp = (palette.dark ? 0.62 : 0.42) * (redState ? RED_STATE_FIELD.amplitude : 1);
  const gridColor = withAlpha(palette.grid, gridStrong ? palette.gridAlpha * 2.6 : palette.gridAlpha);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
      {showField ? (
        <SignalField mode={palette.field} accent={palette.accentFill} background={palette.surface} speed={speed} amplitude={amp} />
      ) : null}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <Pattern id={`np-grid-${uid}`} width={23} height={23} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0.5} x2={23} y2={0.5} stroke={gridColor} strokeWidth={1} />
            <Line x1={0.5} y1={0} x2={0.5} y2={23} stroke={gridColor} strokeWidth={1} />
          </Pattern>
          <Pattern id={`np-scan-${uid}`} width={4} height={3} patternUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={4} height={1} fill="rgba(0,0,0,0.35)" />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#np-grid-${uid})`} />
        {palette.texture === "Scanlines" ? <Rect x={0} y={0} width="100%" height="100%" fill={`url(#np-scan-${uid})`} opacity={0.5} /> : null}
      </Svg>
      {palette.texture === "Grain" ? <Grain opacity={palette.dark ? 0.5 : 0.7} /> : null}
      {statePulse && !paletteOverride ? <StateWash /> : null}
    </View>
  );
}
