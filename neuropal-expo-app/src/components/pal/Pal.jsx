import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import { usePalette, useTheme } from "../../theme/ThemeProvider";
import { PAL_OPTIONS, normalizePal, palDescription, palFaceInk, palVisor } from "../../theme/tokens";

// The user's own companion character (docs/PLATFORM-PLAN.md — "Build your
// Pal"; Birk & Mandryk 2019: a self-made avatar raises identification).
// Pure SVG so it renders identically on Android, iOS and web. Geometry is a
// 168×148 body box drawn in a padded viewBox so accessories (antenna,
// headphones) can stick out.

const BODY = {
  Pebble: "M84 0 C131 0 168 32 168 78 C168 121 131 148 84 148 C37 148 0 121 0 78 C0 32 37 0 84 0 Z",
  Bean: "M66 3 C116 -6 167 25 165 78 C163 127 124 150 76 146 C29 142 1 113 3 70 C5 30 28 9 66 3 Z",
};

function BodyShape({ shape, dx = 0, dy = 0, fill, stroke, strokeWidth = 0 }) {
  const common = { fill, stroke, strokeWidth };
  if (shape === "Box") return <Rect x={dx} y={dy} width={168} height={148} rx={27} {...common} />;
  if (shape === "Moon") return <Ellipse cx={84 + dx} cy={74 + dy} rx={84} ry={74} {...common} />;
  return <Path d={BODY[shape] || BODY.Pebble} transform={dx || dy ? `translate(${dx} ${dy})` : undefined} {...common} />;
}

// mood: 'okay' | 'off' | 'over' — Pal mirrors the user's state (narrower,
// dimmer visor and no blinking when overwhelmed: quieter, not alarming).
export function Pal({ pal: rawPal, size = 120, mood = "okay", speaking = false, accessibilityLabel, decorative = false }) {
  const palette = usePalette();
  const { motionLevel } = useTheme();
  const pal = normalizePal(rawPal);
  const still = motionLevel === "Still";
  const body = PAL_OPTIONS.colour[pal.colour];
  const ink = palFaceInk(body);
  const accent = palette.skin === "signal" ? palette.accentFill : palette.accent;
  const visor = palVisor(body, accent);
  const glint = visor === accent ? "rgba(255,255,255,0.85)" : body;
  const stroke = palette.skin === "signal" ? palette.shadowColor : palette.outlineVariant;
  const shadow = palette.skin === "signal" ? Math.max(3, palette.shape.shadow) : 0;

  const [blink, setBlink] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(false);
  const breath = useSharedValue(0);

  useEffect(() => {
    if (still || mood === "over") {
      breath.value = 0;
      return undefined;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: motionLevel === "Calm" ? 3500 : 2250, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return undefined;
  }, [breath, still, mood, motionLevel]);

  useEffect(() => {
    if (still || mood === "over") return undefined;
    let t2;
    const t = setInterval(() => {
      setBlink(true);
      t2 = setTimeout(() => setBlink(false), 140);
    }, 5200);
    return () => {
      clearInterval(t);
      if (t2) clearTimeout(t2);
    };
  }, [still, mood]);

  useEffect(() => {
    if (!speaking || still) {
      setMouthOpen(false);
      return undefined;
    }
    const t = setInterval(() => setMouthOpen((v) => !v), 160);
    return () => clearInterval(t);
  }, [speaking, still]);

  const breathe = useAnimatedStyle(() => ({
    transform: [{ translateY: -2 * breath.value }, { scale: 1 + 0.03 * breath.value }],
  }));

  const visorInset = mood === "over" ? 13 : mood === "off" ? 8 : 0;
  const visorOpacity = mood === "over" ? 0.45 : mood === "off" ? 0.85 : 1;
  const showOh = pal.mouth === "Oh" || (speaking && pal.mouth === "None") || (speaking && mouthOpen);
  const height = (size * 240) / 260;

  return (
    <View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : "image"}
      accessibilityLabel={decorative ? undefined : accessibilityLabel || `Your Pal, ${palDescription(pal)}`}
      importantForAccessibility={decorative ? "no-hide-descendants" : "auto"}
      style={{ width: size, height }}
    >
      <Animated.View style={[{ width: size, height }, breathe]}>
        <Svg width={size} height={height} viewBox="-46 -50 260 240">
          {pal.extra === "Antenna" ? (
            <G>
              <Path d="M84 2 V-28" stroke={stroke} strokeWidth={4} strokeLinecap="round" />
              <Circle cx={84} cy={-37} r={9} fill={accent} stroke={stroke} strokeWidth={3} />
            </G>
          ) : null}
          {shadow ? <BodyShape shape={pal.shape} dx={shadow} dy={shadow} fill={stroke} /> : null}
          <BodyShape shape={pal.shape} fill={body} stroke={stroke} strokeWidth={3} />
          {pal.extra === "Headphones" ? (
            <G>
              <Path d="M-6 74 C-10 -26 178 -26 174 74" fill="none" stroke={stroke} strokeWidth={9} strokeLinecap="round" />
              <Rect x={-22} y={54} width={26} height={46} rx={11} fill={accent} stroke={stroke} strokeWidth={3} />
              <Rect x={164} y={54} width={26} height={46} rx={11} fill={accent} stroke={stroke} strokeWidth={3} />
            </G>
          ) : null}
          {pal.extra === "Lab goggles" ? (
            <G>
              <Path d="M0 22 H168" stroke={stroke} strokeWidth={7} />
              <Circle cx={60} cy={22} r={17} fill="rgba(190,235,255,0.6)" stroke={stroke} strokeWidth={4} />
              <Circle cx={108} cy={22} r={17} fill="rgba(190,235,255,0.6)" stroke={stroke} strokeWidth={4} />
            </G>
          ) : null}
          {/* eyes — collapse to a line while blinking */}
          <G opacity={visorOpacity}>
            {pal.eyes === "Visor" ? (
              <G>
                <Rect x={24 + visorInset} y={blink ? 58 : 44} width={120 - 2 * visorInset} height={blink ? 4 : 32} rx={blink ? 2 : 16} fill={visor} stroke={stroke} strokeWidth={3} />
                {!blink ? (
                  <G>
                    <Rect x={46 + visorInset / 2} y={53} width={16} height={12} rx={5} fill={glint} />
                    <Rect x={106 - visorInset / 2} y={53} width={16} height={12} rx={5} fill={glint} />
                  </G>
                ) : null}
              </G>
            ) : null}
            {pal.eyes === "Dots" ? (
              blink ? (
                <Path d="M50 62 h20 M98 62 h20" stroke={ink} strokeWidth={5} strokeLinecap="round" />
              ) : (
                <G>
                  <Circle cx={60} cy={62} r={11} fill={ink} />
                  <Circle cx={108} cy={62} r={11} fill={ink} />
                  <Circle cx={64} cy={58} r={3.5} fill={body} />
                  <Circle cx={112} cy={58} r={3.5} fill={body} />
                </G>
              )
            ) : null}
            {pal.eyes === "Sleepy" ? (
              <Path d="M46 60 q14 12 28 0 M94 60 q14 12 28 0" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
            ) : null}
            {pal.eyes === "Wide" ? (
              blink ? (
                <Path d="M42 62 h32 M94 62 h32" stroke={ink} strokeWidth={5} strokeLinecap="round" />
              ) : (
                <G>
                  <Circle cx={58} cy={60} r={18} fill="#FFFFFF" stroke={stroke} strokeWidth={3} />
                  <Circle cx={110} cy={60} r={18} fill="#FFFFFF" stroke={stroke} strokeWidth={3} />
                  <Circle cx={62} cy={64} r={8} fill="#141416" />
                  <Circle cx={114} cy={64} r={8} fill="#141416" />
                </G>
              )
            ) : null}
          </G>
          {/* mouth */}
          {showOh ? <Ellipse cx={84} cy={104} rx={8} ry={speaking && !mouthOpen ? 4 : 9} fill={ink} /> : null}
          {!showOh && pal.mouth === "Smile" ? <Path d="M66 98 q18 16 36 0" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" /> : null}
          {!showOh && pal.mouth === "Flat" ? <Path d="M70 104 h28" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" /> : null}
          {pal.extra === "Scarf" ? (
            <G>
              <Rect x={10} y={114} width={148} height={22} rx={11} fill={accent} stroke={stroke} strokeWidth={3} />
              <Rect x={116} y={122} width={20} height={46} rx={6} transform="rotate(-10 126 145)" fill={accent} stroke={stroke} strokeWidth={3} />
            </G>
          ) : null}
        </Svg>
      </Animated.View>
    </View>
  );
}
