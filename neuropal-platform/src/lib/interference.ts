// Physics for the two-source interference lesson. Pure functions, SI-free
// units: everything is in centimetres for a ripple tank seen from above.
//
// Model: two point sources in phase at (±d/2, sourceY), equal amplitudes,
// ψ = cos(k r1 − ωt) + cos(k r2 − ωt), k = 2π/λ. The 1/√r fall-off of real
// 2D ripples is left out so the pattern stays legible (the lesson says so).

export const TANK = { width: 40, height: 25, sourceY: 2.5 } as const;
export const LAMBDA = { min: 1, max: 4, step: 0.1, initial: 2 } as const;
export const SEPARATION = { min: 2, max: 12, step: 0.5, initial: 6 } as const;
/** Ripple frequency used when the learner presses Play. */
export const FREQUENCY_HZ = 0.8;

/** Total number of bright (antinodal) lines: |m| ≤ d/λ, from d sin θ = mλ. */
export function brightLineCount(d: number, lambda: number): number {
  return 2 * Math.floor(d / lambda + 1e-9) + 1;
}

/** Path difference Δ = r2 − r1 at (x, y); x from the centre line, y up from the bottom edge. */
export function pathDifference(x: number, y: number, d: number): number {
  const r1 = Math.hypot(x + d / 2, y - TANK.sourceY);
  const r2 = Math.hypot(x - d / 2, y - TANK.sourceY);
  return r2 - r1;
}

/** Time-averaged brightness, normalised to 0..1: cos²(πΔ/λ). */
export function brightnessAt(x: number, y: number, d: number, lambda: number): number {
  const c = Math.cos((Math.PI * pathDifference(x, y, d)) / lambda);
  return c * c;
}

/**
 * Bright spots strictly inside the far edge: whole numbers m with |m|λ < Δmax,
 * where Δmax is the path difference at the far corners.
 */
export function farEdgeBrightCount(d: number, lambda: number): number {
  const dMax = Math.abs(pathDifference(TANK.width / 2, TANK.height, d));
  return 2 * Math.ceil(dMax / lambda - 1e-9) - 1;
}

/** Brightness along the far edge, left to right. */
export function farEdgeProfile(d: number, lambda: number, samples = 241): { x: number; i: number }[] {
  const out: { x: number; i: number }[] = [];
  for (let s = 0; s < samples; s += 1) {
    const x = -TANK.width / 2 + (TANK.width * s) / (samples - 1);
    out.push({ x, i: brightnessAt(x, TANK.height, d, lambda) });
  }
  return out;
}

/**
 * Phasor fields for fast animation: with C = cos kr1 + cos kr2 and
 * S = sin kr1 + sin kr2, the surface is ψ(t) = C cos ωt + S sin ωt and the
 * time-averaged brightness is (C² + S²) / 4.
 */
export function phasorField(cols: number, rows: number, d: number, lambda: number) {
  const C = new Float32Array(cols * rows);
  const S = new Float32Array(cols * rows);
  const k = (2 * Math.PI) / lambda;
  const x1 = -d / 2;
  const x2 = d / 2;
  for (let j = 0; j < rows; j += 1) {
    // Row 0 is the top of the picture, i.e. the far edge.
    const y = TANK.height * (1 - (j + 0.5) / rows) - TANK.sourceY;
    for (let i = 0; i < cols; i += 1) {
      const x = -TANK.width / 2 + (TANK.width * (i + 0.5)) / cols;
      const r1 = Math.hypot(x - x1, y);
      const r2 = Math.hypot(x - x2, y);
      const n = j * cols + i;
      C[n] = Math.cos(k * r1) + Math.cos(k * r2);
      S[n] = Math.sin(k * r1) + Math.sin(k * r2);
    }
  }
  return { C, S };
}

export const fmtCm = (v: number) => `${v.toFixed(1)} cm`;
