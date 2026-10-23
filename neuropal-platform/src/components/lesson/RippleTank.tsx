"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pause, Play, Reset } from "@/components/icons";
import {
  brightLineCount,
  farEdgeBrightCount,
  farEdgeProfile,
  fmtCm,
  FREQUENCY_HZ,
  LAMBDA,
  phasorField,
  SEPARATION,
  TANK,
} from "@/lib/interference";
import styles from "./lesson.module.css";

type View = "ripples" | "brightness";

interface TankState {
  lambda: number;
  sep: number;
  playing: boolean;
  view: View;
}

const DARK = [10, 10, 11];
const LIGHT = [242, 242, 240];

function cssVar(el: Element, name: string, fallback: string) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dpr: number, align: "left" | "center" | "right") {
  ctx.font = `700 ${12 * dpr}px ui-monospace, "Atkinson Hyperlegible Mono", monospace`;
  const w = ctx.measureText(text).width + 10 * dpr;
  const h = 18 * dpr;
  const left = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  ctx.fillStyle = "rgba(10,10,11,0.86)";
  ctx.fillRect(left, y - h / 2, w, h);
  ctx.fillStyle = "#F2F2F0";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, left + 5 * dpr, y + 0.5 * dpr);
}

function drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, st: TankState, accent: string) {
  const sx = (x: number) => ((x + TANK.width / 2) / TANK.width) * W;
  const sy = (y: number) => (1 - y / TANK.height) * H;

  // Far edge, where the brightness profile below is measured.
  ctx.save();
  ctx.setLineDash([7 * dpr, 6 * dpr]);
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, 1.5 * dpr);
  ctx.lineTo(W, 1.5 * dpr);
  ctx.stroke();
  ctx.restore();
  tag(ctx, "FAR EDGE", W - 10 * dpr, 16 * dpr, dpr, "right");

  // The two sources.
  const ys = sy(TANK.sourceY);
  [
    [-st.sep / 2, "S1"],
    [st.sep / 2, "S2"],
  ].forEach(([x, label]) => {
    const cx = sx(Number(x));
    ctx.beginPath();
    ctx.arc(cx, ys, 7 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.lineWidth = 2.5 * dpr;
    ctx.strokeStyle = "#0A0A0B";
    ctx.stroke();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = "#F2F2F0";
    ctx.beginPath();
    ctx.arc(cx, ys, 9.5 * dpr, 0, Math.PI * 2);
    ctx.stroke();
    tag(ctx, String(label), cx, ys - 22 * dpr, dpr, "center");
  });

  // Scale bar: 10 cm.
  const len = (10 / TANK.width) * W;
  const bx = 12 * dpr;
  const by = H - 12 * dpr;
  ctx.fillStyle = "rgba(10,10,11,0.86)";
  ctx.fillRect(bx - 6 * dpr, by - 24 * dpr, len + 12 * dpr, 30 * dpr);
  ctx.strokeStyle = "#F2F2F0";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.moveTo(bx, by - 6 * dpr);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + len, by);
  ctx.lineTo(bx + len, by - 6 * dpr);
  ctx.stroke();
  ctx.font = `700 ${12 * dpr}px ui-monospace, "Atkinson Hyperlegible Mono", monospace`;
  ctx.fillStyle = "#F2F2F0";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("10 cm", bx + len / 2, by - 8 * dpr);
}

export function RippleTank() {
  const [lambda, setLambda] = useState<number>(LAMBDA.initial);
  const [sep, setSep] = useState<number>(SEPARATION.initial);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<View>("ripples");
  const [touched, setTouched] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<TankState>({ lambda, sep, playing, view });
  const kickRef = useRef<() => void>(() => {});
  const id = useId();

  const total = brightLineCount(sep, lambda);
  const onEdge = farEdgeBrightCount(sep, lambda);
  const ratio = sep / lambda;
  const summary = `${total} bright ${total === 1 ? "line" : "lines"} in total; ${onEdge} ${onEdge === 1 ? "crosses" : "cross"} the far edge.`;
  const description =
    `Ripple tank seen from above, showing ${view === "ripples" ? "the ripples at one moment" : "the average brightness"}. ` +
    `Two sources ${fmtCm(sep)} apart near the bottom edge send out ripples ${fmtCm(lambda)} long. ` +
    `Bright and dark lines fan out from between them: ${summary}`;

  useEffect(() => {
    stateRef.current = { lambda, sep, playing, view };
    kickRef.current();
  }, [lambda, sep, playing, view]);

  // Tell screen-reader users what changed, once they pause on a value.
  useEffect(() => {
    if (!touched) return;
    const t = window.setTimeout(() => setAnnouncement(summary), 700);
    return () => window.clearTimeout(t);
  }, [summary, touched]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    if (!offCtx) return;

    let field: { C: Float32Array; S: Float32Array; key: string } | null = null;
    let image: ImageData | null = null;
    let phase = 0;
    let raf = 0;
    let last = 0;
    let visible = true;

    const draw = () => {
      const st = stateRef.current;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (!cssW || !cssH) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(cssW * dpr);
      const H = Math.round(cssH * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      const cols = Math.max(160, Math.min(560, Math.round(cssW)));
      const rows = Math.round((cols * TANK.height) / TANK.width);
      const key = `${cols}x${rows}:${st.sep}:${st.lambda}`;
      if (!field || field.key !== key || !image) {
        field = { ...phasorField(cols, rows, st.sep, st.lambda), key };
        off.width = cols;
        off.height = rows;
        image = offCtx.createImageData(cols, rows);
      }
      const { C, S } = field;
      const data = image.data;
      const cw = Math.cos(phase);
      const sw = Math.sin(phase);
      const avg = st.view === "brightness";
      for (let n = 0, p = 0; n < C.length; n += 1, p += 4) {
        const g = avg ? (C[n] * C[n] + S[n] * S[n]) * 0.25 : 0.5 + 0.25 * (C[n] * cw + S[n] * sw);
        data[p] = DARK[0] + (LIGHT[0] - DARK[0]) * g;
        data[p + 1] = DARK[1] + (LIGHT[1] - DARK[1]) * g;
        data[p + 2] = DARK[2] + (LIGHT[2] - DARK[2]) * g;
        data[p + 3] = 255;
      }
      offCtx.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(off, 0, 0, W, H);
      drawOverlay(ctx, W, H, dpr, st, cssVar(canvas, "--np-accent-fill", "#FF3D2E"));
    };

    const canRun = () => stateRef.current.playing && visible && !document.hidden;
    const loop = (now: number) => {
      raf = 0;
      if (!canRun()) {
        last = 0;
        draw();
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      phase = (phase + 2 * Math.PI * FREQUENCY_HZ * dt) % (2 * Math.PI);
      draw();
      raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (raf) return;
      if (canRun()) raf = requestAnimationFrame(loop);
      else draw();
    };
    kickRef.current = kick;

    const ro = new ResizeObserver(() => kick());
    ro.observe(canvas);
    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      kick();
    });
    io.observe(canvas);
    const onVisibility = () => kick();
    document.addEventListener("visibilitychange", onVisibility);
    kick();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      kickRef.current = () => {};
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const profile = farEdgeProfile(sep, lambda);
  const px = (x: number) => ((x + TANK.width / 2) / TANK.width) * 400;
  const py = (i: number) => 86 - i * 76;
  const line = profile.map((p, i) => `${i ? "L" : "M"}${px(p.x).toFixed(1)} ${py(p.i).toFixed(1)}`).join(" ");
  const area = `${line} L400 86 L0 86 Z`;

  const lambdaId = `${id}-lambda`;
  const sepId = `${id}-sep`;

  return (
    <div className={styles.tank}>
      <div className={styles.tankScreen}>
        <canvas ref={canvasRef} className={styles.tankCanvas} role="img" aria-label={description} />
      </div>

      <figure className={styles.profile}>
        <svg
          viewBox="0 0 400 90"
          preserveAspectRatio="none"
          className={styles.profileSvg}
          role="img"
          aria-label={`Brightness along the far edge, left to right: ${onEdge} bright ${onEdge === 1 ? "spot" : "spots"}.`}
        >
          <line x1="0" y1="86" x2="400" y2="86" className={styles.profileAxis} vectorEffect="non-scaling-stroke" />
          <line x1="200" y1="4" x2="200" y2="86" className={styles.profileCentre} vectorEffect="non-scaling-stroke" />
          <path d={area} className={styles.profileArea} />
          <path d={line} className={styles.profileLine} vectorEffect="non-scaling-stroke" />
        </svg>
        <figcaption className={styles.profileCaption}>
          <span>Brightness along the far edge</span>
          <span className="np-mono" aria-hidden="true">
            −20 cm · 0 · +20 cm
          </span>
        </figcaption>
      </figure>

      <div className={styles.controls}>
        <div className={styles.slider}>
          <div className={styles.sliderHead}>
            <label htmlFor={lambdaId} className={styles.sliderLabel}>
              Wavelength <i>λ</i>
            </label>
            <span className={`np-mono ${styles.sliderValue}`} aria-hidden="true">
              {fmtCm(lambda)}
            </span>
          </div>
          <input
            id={lambdaId}
            className="np-range"
            type="range"
            min={LAMBDA.min}
            max={LAMBDA.max}
            step={LAMBDA.step}
            value={lambda}
            aria-valuetext={`${lambda.toFixed(1)} centimetres`}
            onChange={(e) => {
              setLambda(Number(e.target.value));
              setTouched(true);
            }}
          />
          <p className={styles.sliderHint}>The distance from one crest to the next.</p>
        </div>

        <div className={styles.slider}>
          <div className={styles.sliderHead}>
            <label htmlFor={sepId} className={styles.sliderLabel}>
              Source separation <i>d</i>
            </label>
            <span className={`np-mono ${styles.sliderValue}`} aria-hidden="true">
              {fmtCm(sep)}
            </span>
          </div>
          <input
            id={sepId}
            className="np-range"
            type="range"
            min={SEPARATION.min}
            max={SEPARATION.max}
            step={SEPARATION.step}
            value={sep}
            aria-valuetext={`${sep.toFixed(1)} centimetres`}
            onChange={(e) => {
              setSep(Number(e.target.value));
              setTouched(true);
            }}
          />
          <p className={styles.sliderHint}>How far apart the two sources are.</p>
        </div>
      </div>

      <dl className={styles.readouts}>
        <div>
          <dt>
            <i>d</i> / <i>λ</i>
          </dt>
          <dd className="np-mono">{ratio.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Bright lines in total</dt>
          <dd className="np-mono">{total}</dd>
        </div>
        <div>
          <dt>Crossing the far edge</dt>
          <dd className="np-mono">{onEdge}</dd>
        </div>
      </dl>

      <div className={styles.tankActions}>
        <button type="button" className="np-btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause /> : <Play />}
          {playing ? "Pause ripples" : "Play ripples"}
        </button>
        <button
          type="button"
          className="np-btn np-btn--ghost np-btn--small"
          onClick={() => {
            setLambda(LAMBDA.initial);
            setSep(SEPARATION.initial);
            setTouched(true);
          }}
        >
          <Reset />
          Reset
        </button>
        <div role="group" aria-labelledby={`${id}-view`} className={styles.viewGroup}>
          <span id={`${id}-view`} className={styles.viewLabel}>
            Show
          </span>
          <button type="button" className="np-chip" aria-pressed={view === "ripples"} onClick={() => setView("ripples")}>
            Ripples
          </button>
          <button
            type="button"
            className="np-chip"
            aria-pressed={view === "brightness"}
            onClick={() => setView("brightness")}
          >
            Average brightness
          </button>
        </div>
      </div>
      <p className={styles.tankNote}>
        {view === "ripples"
          ? "Light means a crest, dark means a trough. The picture moves only while you play it."
          : "Light means the water swings strongly over time, dark means it stays almost still."}
      </p>
      <p className="np-sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
