"use client";

import { useEffect, useRef } from "react";

// Ambient WebGL background: Chladni-plate nodal lines that morph between
// plate modes, or the fringes of two coherent sources. Decorative only
// (aria-hidden). It renders on demand:
//   speed 0            → draws one still frame and stops
//   off-screen / tab hidden → the loop stops until visible again
// Without WebGL the canvas stays empty and the CSS background shows.

export type FieldMode = "Chladni" | "Interference";

export interface FieldCanvasProps {
  mode: FieldMode;
  /** Simulation-time speed multiplier; 0 holds the current frame. */
  speed: number;
  accent: string;
  base: string;
  /** 0..1 how far the brightest feature mixes from base toward accent. */
  amp: number;
  layout?: "hero" | "card";
  className?: string;
  /** Called (from the render loop) when the visible plate mode changes. */
  onModeLabel?: (label: string) => void;
}

const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uAcc;
uniform vec3 uBase;
uniform float uMode;
uniform float uAmp;
uniform vec2 uCenter;
uniform float uScale;
const float PI = 3.14159265;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Nodal-line function of a square plate (Chladni): zero along the sand lines.
float plate(vec2 u, float n, float m){
  return cos(n*PI*u.x)*cos(m*PI*u.y) - cos(m*PI*u.x)*cos(n*PI*u.y);
}
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5*uRes) / min(uRes.x, uRes.y);
  vec2 q = (p - uCenter) / uScale;
  float v = 0.0;
  if (uMode < 0.5) {
    float i = floor(uTime / 9.0);
    float s = smoothstep(0.2, 0.8, fract(uTime / 9.0));
    float n1 = 1.0 + mod(i, 3.0);
    float m1 = n1 + 2.0 + 2.0*mod(i, 2.0);
    float n2 = 1.0 + mod(i + 1.0, 3.0);
    float m2 = n2 + 2.0 + 2.0*mod(i + 1.0, 2.0);
    vec2 u = q*0.62 + 0.5;
    float f = mix(plate(u, n1, m1), plate(u, n2, m2), s);
    float z = f / 0.075;
    float line = exp(-z*z);
    // Static "sand": grains stay put and show wherever a nodal line passes.
    float grain = step(hash(floor(gl_FragCoord.xy / 2.0)), line*0.95);
    v = line*0.2 + grain*0.8;
  } else {
    // Two in-phase sources: psi = 2 cos(k*dr/2) cos(k*rbar - wt). The fixed
    // envelope gives the fringes; the travelling carrier makes the grains on
    // each bright fringe swell outward. Nodal lines never move.
    vec2 s1 = vec2(-0.22, -0.62);
    vec2 s2 = vec2(0.22, -0.62);
    float r1 = distance(q, s1);
    float r2 = distance(q, s2);
    float k = 60.0;
    float env = cos(0.5*k*(r2 - r1));
    float fringe = env*env;
    float carrier = 0.5 + 0.5*cos(0.5*k*(r1 + r2) - uTime*1.7);
    float att = exp(-0.75*length(q - vec2(0.0, -0.62)));
    float grain = step(hash(floor(gl_FragCoord.xy / 2.0)), fringe*fringe*att*(0.55 + 0.45*carrier));
    v = fringe*att*0.32 + grain*0.75;
  }
  gl_FragColor = vec4(mix(uBase, uAcc, clamp(v*uAmp, 0.0, 1.0)), 1.0);
}`;

function hexToVec(hex: string): [number, number, number] {
  let s = String(hex || "").replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16);
  if (Number.isNaN(n)) return [1, 0.24, 0.18];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function plateModeAt(t: number): string {
  const i = Math.floor(t / 9);
  const mode = (k: number) => {
    const n = 1 + (k % 3);
    return `(${n}, ${n + 2 + 2 * (k % 2)})`;
  };
  const f = t / 9 - i;
  if (f > 0.2 && f < 0.8) return `${mode(i)} → ${mode(i + 1)}`;
  return f <= 0.2 ? mode(i) : mode(i + 1);
}

// A clean single mode, (2, 6), for still frames.
const STILL_TIME = 9.5;

export function FieldCanvas(props: FieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    propsRef.current = props;
    kickRef.current();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = (() => {
      try {
        return canvas.getContext("webgl", {
          antialias: false,
          alpha: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: false,
          powerPreference: "low-power",
        });
      } catch {
        return null;
      }
    })();
    if (!gl) {
      canvas.dataset.gl = "off";
      return;
    }
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      canvas.dataset.gl = "off";
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      canvas.dataset.gl = "off";
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(prog, name);
    const U = {
      res: u("uRes"),
      time: u("uTime"),
      acc: u("uAcc"),
      base: u("uBase"),
      mode: u("uMode"),
      amp: u("uAmp"),
      center: u("uCenter"),
      scale: u("uScale"),
    };
    canvas.dataset.gl = "on";

    let raf = 0;
    let last = 0;
    let lastDraw = 0;
    let simT = STILL_TIME;
    let visible = true;
    let needsDraw = true;
    let lost = false;
    let label = "";

    const draw = (p: FieldCanvasProps) => {
      if (lost) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      let w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      let h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      const maxPx = 1_400_000;
      if (w * h > maxPx) {
        const s = Math.sqrt(maxPx / (w * h));
        w = Math.max(1, Math.floor(w * s));
        h = Math.max(1, Math.floor(h * s));
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const aspect = w / h;
      let cx = 0;
      let cy = 0;
      let scale = 1;
      if (p.layout !== "card") {
        if (aspect > 1.15) cx = Math.max(0, aspect / 2 - 0.55);
        else if (aspect < 0.9) {
          cy = 0.32 / aspect;
          scale = 0.9;
        }
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.res, w, h);
      gl.uniform1f(U.time, simT);
      const a = hexToVec(p.accent);
      const b = hexToVec(p.base);
      gl.uniform3f(U.acc, a[0], a[1], a[2]);
      gl.uniform3f(U.base, b[0], b[1], b[2]);
      gl.uniform1f(U.mode, p.mode === "Chladni" ? 0 : 1);
      gl.uniform1f(U.amp, p.amp);
      gl.uniform2f(U.center, cx, cy);
      gl.uniform1f(U.scale, scale);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (p.onModeLabel && p.mode === "Chladni") {
        const next = plateModeAt(simT);
        if (next !== label) {
          label = next;
          p.onModeLabel(next);
        }
      }
    };

    const running = () => visible && !document.hidden && propsRef.current.speed > 0 && !lost;

    const frame = (now: number) => {
      raf = 0;
      const p = propsRef.current;
      const go = running();
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = go ? now : 0;
      if (go) simT += dt * p.speed;
      // The field drifts slowly; ~30 fps is plenty and halves the GPU cost.
      if (needsDraw || (go && now - lastDraw >= 33)) {
        draw(p);
        lastDraw = now;
        needsDraw = false;
      }
      if (go) raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      needsDraw = true;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    kickRef.current = kick;

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      kick();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => kick());
    ro.observe(canvas);
    const onVisibility = () => kick();
    document.addEventListener("visibilitychange", onVisibility);
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      // Simplest robust recovery: the next mount rebuilds everything.
      canvas.dataset.gl = "off";
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    kick();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      kickRef.current = () => {};
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} className={props.className} aria-hidden="true" />;
}
