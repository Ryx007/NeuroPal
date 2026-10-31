"use client";
// The user's own companion, drawn from the appearance's Pal (shape, colour,
// eyes, mouth, extra): a port of the Expo app's components/pal/Pal.jsx with
// the same geometry (a 168 × 148 body in a padded viewBox so the antenna and
// headphones can stick out). It breathes and blinks only when motion is
// allowed (html[data-motion] isn't "Still" and reduced motion is off), and
// never while overwhelmed: quieter, not alarming.
import { useAppearance } from "@/components/AppearanceProvider";
import { normalizePal, PAL_OPTIONS, palDescription, palFaceInk, palVisor, type PalLook, type PalMood } from "@/lib/neuropal/look";
import styles from "./common.module.css";

const BODY: Record<string, string> = {
  Pebble: "M84 0 C131 0 168 32 168 78 C168 121 131 148 84 148 C37 148 0 121 0 78 C0 32 37 0 84 0 Z",
  Bean: "M66 3 C116 -6 167 25 165 78 C163 127 124 150 76 146 C29 142 1 113 3 70 C5 30 28 9 66 3 Z",
};

function BodyShape({ shape, dx = 0, dy = 0, fill, stroke, strokeWidth = 0 }: { shape: string; dx?: number; dy?: number; fill: string; stroke?: string; strokeWidth?: number }) {
  const common = { fill, stroke, strokeWidth };
  if (shape === "Box") return <rect x={dx} y={dy} width={168} height={148} rx={27} {...common} />;
  if (shape === "Moon") return <ellipse cx={84 + dx} cy={74 + dy} rx={84} ry={74} {...common} />;
  return <path d={BODY[shape] || BODY.Pebble} transform={dx || dy ? `translate(${dx} ${dy})` : undefined} {...common} />;
}

/** "Your Pal, Pal: pebble shape, chalk body, visor eyes, smile mouth, headphones" */
export const palImageLabel = (pal: PalLook) => `Your Pal, ${palDescription(pal)}`;

export interface PalAvatarProps {
  pal: PalLook | Record<string, unknown>;
  /** Width in px (height follows the 260 × 240 box). */
  size?: number;
  mood?: PalMood;
  /** Mouth moves (while Pal's line is spoken). */
  speaking?: boolean;
  /** Give it a spoken label (role img). Without one it is decorative. */
  label?: string;
  className?: string;
}

export function PalAvatar({ pal: raw, size = 120, mood = "okay", speaking = false, label, className }: PalAvatarProps) {
  const { palette } = useAppearance();
  const pal = normalizePal(raw);
  const signal = palette.skin === "signal";
  const body = PAL_OPTIONS.colour[pal.colour] ?? PAL_OPTIONS.colour.Chalk;
  const ink = palFaceInk(body);
  const accent = signal ? palette.accentFill : palette.accent;
  const visor = palVisor(body, accent);
  const glint = visor === accent ? "rgba(255,255,255,0.85)" : body;
  const stroke = signal ? palette.shadowColor : palette.outlineVariant;
  const shadow = signal ? Math.max(3, palette.shape.shadow) : 0;
  const height = Math.round((size * 240) / 260);
  const calm = mood === "over";
  const visorInset = mood === "over" ? 13 : mood === "off" ? 8 : 0;
  const visorOpacity = mood === "over" ? 0.45 : mood === "off" ? 0.85 : 1;
  const showOh = pal.mouth === "Oh" || speaking;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };

  return (
    <span className={`${styles.pal} ${className ?? ""}`} style={{ width: size, height }} {...a11y}>
      <svg
        className={`${styles.palSvg} ${calm ? "" : styles.palBreathe}`}
        width={size}
        height={height}
        viewBox="-46 -50 260 240"
        focusable="false"
        aria-hidden="true"
      >
        {pal.extra === "Antenna" ? (
          <g>
            <path d="M84 2 V-28" stroke={stroke} strokeWidth={4} strokeLinecap="round" />
            <circle cx={84} cy={-37} r={9} fill={accent} stroke={stroke} strokeWidth={3} />
          </g>
        ) : null}
        {shadow ? <BodyShape shape={pal.shape} dx={shadow} dy={shadow} fill={stroke} /> : null}
        <BodyShape shape={pal.shape} fill={body} stroke={stroke} strokeWidth={3} />
        {pal.extra === "Headphones" ? (
          <g>
            <path d="M-6 74 C-10 -26 178 -26 174 74" fill="none" stroke={stroke} strokeWidth={9} strokeLinecap="round" />
            <rect x={-22} y={54} width={26} height={46} rx={11} fill={accent} stroke={stroke} strokeWidth={3} />
            <rect x={164} y={54} width={26} height={46} rx={11} fill={accent} stroke={stroke} strokeWidth={3} />
          </g>
        ) : null}
        {pal.extra === "Lab goggles" ? (
          <g>
            <path d="M0 22 H168" stroke={stroke} strokeWidth={7} />
            <circle cx={60} cy={22} r={17} fill="rgba(190,235,255,0.6)" stroke={stroke} strokeWidth={4} />
            <circle cx={108} cy={22} r={17} fill="rgba(190,235,255,0.6)" stroke={stroke} strokeWidth={4} />
          </g>
        ) : null}
        <g opacity={visorOpacity} className={calm ? undefined : styles.palBlink}>
          {pal.eyes === "Visor" ? (
            <g>
              <rect x={24 + visorInset} y={44} width={120 - 2 * visorInset} height={32} rx={16} fill={visor} stroke={stroke} strokeWidth={3} />
              <rect x={46 + visorInset / 2} y={53} width={16} height={12} rx={5} fill={glint} />
              <rect x={106 - visorInset / 2} y={53} width={16} height={12} rx={5} fill={glint} />
            </g>
          ) : null}
          {pal.eyes === "Dots" ? (
            <g>
              <circle cx={60} cy={62} r={11} fill={ink} />
              <circle cx={108} cy={62} r={11} fill={ink} />
              <circle cx={64} cy={58} r={3.5} fill={body} />
              <circle cx={112} cy={58} r={3.5} fill={body} />
            </g>
          ) : null}
          {pal.eyes === "Sleepy" ? (
            <path d="M46 60 q14 12 28 0 M94 60 q14 12 28 0" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
          ) : null}
          {pal.eyes === "Wide" ? (
            <g>
              <circle cx={58} cy={60} r={18} fill="#FFFFFF" stroke={stroke} strokeWidth={3} />
              <circle cx={110} cy={60} r={18} fill="#FFFFFF" stroke={stroke} strokeWidth={3} />
              <circle cx={62} cy={64} r={8} fill="#141416" />
              <circle cx={114} cy={64} r={8} fill="#141416" />
            </g>
          ) : null}
        </g>
        {showOh ? <ellipse className={speaking ? styles.palTalk : undefined} cx={84} cy={104} rx={8} ry={9} fill={ink} /> : null}
        {!showOh && pal.mouth === "Smile" ? <path d="M66 98 q18 16 36 0" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" /> : null}
        {!showOh && pal.mouth === "Flat" ? <path d="M70 104 h28" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" /> : null}
        {pal.extra === "Scarf" ? (
          <g>
            <rect x={10} y={114} width={148} height={22} rx={11} fill={accent} stroke={stroke} strokeWidth={3} />
            <rect x={116} y={122} width={20} height={46} rx={6} transform="rotate(-10 126 145)" fill={accent} stroke={stroke} strokeWidth={3} />
          </g>
        ) : null}
      </svg>
    </span>
  );
}
