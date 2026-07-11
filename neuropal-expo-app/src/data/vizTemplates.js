// Physics visualizer templates (Module 9 Tier 1). Each is a fully
// self-contained HTML document — canvas + inline JS + its own parameter
// sliders — rendered in a WebView (native) or iframe (web). No network, no
// external libraries: everything must work offline on the LAN.

const BASE_CSS = `
  html,body{margin:0;padding:0;background:#131313;color:#E4E2E1;
    font-family:-apple-system,Roboto,sans-serif;overflow-x:hidden}
  canvas{display:block;width:100vw;height:62vh;background:#0E0E0E}
  .panel{padding:14px 16px}
  .row{display:flex;align-items:center;gap:10px;margin:10px 0}
  .row label{flex:0 0 118px;font-size:12px;letter-spacing:.6px;color:#D0C6C8}
  .row input[type=range]{flex:1;accent-color:#FF7F8E}
  .row output{flex:0 0 64px;text-align:right;font-family:monospace;
    font-size:12px;color:#FF7F8E}
  h2{font-size:14px;margin:12px 16px 0;letter-spacing:1px;color:#FF7F8E}
  p{font-size:12px;color:#D0C6C8;margin:6px 16px;line-height:1.5}
  .vizbtn{background:#1F2020;color:#E4E2E1;border:1px solid #534347;
    border-radius:10px;padding:6px 14px;font-size:14px;cursor:pointer}
  .presetrow{display:flex;gap:8px;padding:8px 16px;flex-wrap:wrap}
  .presetrow button{background:#1F2020;color:#FFAFC1;border:1px solid #534347;
    border-radius:99px;padding:6px 12px;font-size:13px;font-family:monospace;cursor:pointer}
  .readout{font-family:monospace;font-size:12px;color:#F3C77B;
    padding:6px 16px;white-space:pre-wrap}
`;

export function buildVizPage(title, blurb, sliders, script, extraHtml = "") {
  const sliderHtml = sliders
    .map(
      (s) => `
    <div class="row">
      <label for="${s.id}">${s.label}</label>
      <input type="range" id="${s.id}" min="${s.min}" max="${s.max}"
             step="${s.step}" value="${s.value}">
      <output id="${s.id}-out">${s.value}</output>
    </div>`
    )
    .join("");

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>${BASE_CSS}</style></head><body>
<canvas id="c"></canvas>
<h2>${title.toUpperCase()}</h2>
<p>${blurb}</p>
${extraHtml}
<div class="panel">${sliderHtml}</div>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
function fit(){ canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * 0.62 * devicePixelRatio;
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); }
fit(); addEventListener('resize', fit);
const P = {};
document.querySelectorAll('input[type=range]').forEach(el => {
  P[el.id] = parseFloat(el.value);
  el.addEventListener('input', () => {
    P[el.id] = parseFloat(el.value);
    document.getElementById(el.id + '-out').textContent = el.value;
  });
});
const W = () => canvas.width / devicePixelRatio;
const H = () => canvas.height / devicePixelRatio;
${script}
</script></body></html>`;
}

const page = buildVizPage;

export const VIZ_TEMPLATES = [
  {
    id: "hom",
    title: "Hong–Ou–Mandel interference",
    icon: "call-merge",
    verified: true,
    blurb:
      "Two indistinguishable photons on a 50/50 beam-splitter: |1,1⟩ → (|2,0⟩−|0,2⟩)/√2 — they BUNCH, coincidences vanish. Sweep the delay and trace the dip.",
    html: page(
      "Hong–Ou–Mandel",
      "P_coinc(Δt) = ½·[1 − V·e^{−(Δt/τc)²}]. At Δt=0, V=1 every pair exits the SAME port (bunching) — the dip. Distinguishable photons (V→0) give the classical ½.",
      [
        { id: "dt", label: "Delay Δt", min: -4, max: 4, step: 0.05, value: 0 },
        { id: "tauc", label: "Coherence τc", min: 0.3, max: 3, step: 0.05, value: 1 },
        { id: "V", label: "Indisting. V", min: 0, max: 1, step: 0.01, value: 1 },
        { id: "rate", label: "Trials / frame", min: 1, max: 40, step: 1, value: 8 },
      ],
      String.raw`
// Physics checks this file must satisfy (work order §6.2):
//   P(Δt=0, V=1) = 0        — full dip, perfect bunching
//   P(|Δt|→∞)   → 1/2       — distinguishable limit
//   lower V     → shallower dip; coincidences must NEVER peak at Δt=0
const Pc = () => 0.5 * (1 - P.V * Math.exp(-((P.dt / P.tauc) ** 2)));

// Monte-Carlo counters — reset whenever ANY slider moves so the empirical
// fraction always refers to the current parameters.
let trials = 0, coinc = 0;
const flights = []; // animated photon pairs in transit
document.querySelectorAll('input[type=range]').forEach((el) =>
  el.addEventListener('input', () => { trials = 0; coinc = 0; flights.length = 0; })
);

// Layout: schematic on top (inputs → BS → detectors), dip plot below.
function geom(){
  const w = W(), h = H();
  const sch = { x0: 16, y0: 10, w: w - 32, h: h * 0.46 };
  const plot = { x0: 52, y0: h * 0.56, w: w - 76, h: h * 0.38 };
  const bs = { x: sch.x0 + sch.w * 0.48, y: sch.y0 + sch.h * 0.52 };
  return { w, h, sch, plot, bs,
    inA: { x: sch.x0 + 8, y: sch.y0 + sch.h * 0.12 },
    inB: { x: sch.x0 + 8, y: sch.y0 + sch.h * 0.92 },
    detC: { x: sch.x0 + sch.w - 14, y: sch.y0 + sch.h * 0.12 },
    detD: { x: sch.x0 + sch.w - 14, y: sch.y0 + sch.h * 0.92 } };
}

function fire(){
  // one quantum trial: anti-bunch (coincidence) with prob Pc, else bunch
  const g = geom();
  const isCoinc = Math.random() < Pc();
  trials += 1; if (isCoinc) coinc += 1;
  const same = Math.random() < 0.5 ? 'C' : 'D'; // bunch port
  flights.push({
    born: performance.now(),
    isCoinc,
    // photon a: from input A; photon b delayed visually by Δt
    aTo: isCoinc ? 'C' : same,
    bTo: isCoinc ? 'D' : same,
    lag: P.dt * 26, // px of visual lag for the delayed photon
  });
  if (flights.length > 90) flights.shift();
}

function lerp(a, b, u){ return a + (b - a) * u; }

function photonPos(from, to, u, g){
  // two legs: input → BS (u 0..0.5), BS → detector (u 0.5..1)
  const dest = to === 'C' ? g.detC : g.detD;
  if (u < 0.5) {
    const v = u / 0.5;
    return [lerp(from.x, g.bs.x, v), lerp(from.y, g.bs.y, v)];
  }
  const v = (u - 0.5) / 0.5;
  return [lerp(g.bs.x, dest.x, v), lerp(g.bs.y, dest.y, v)];
}

const FLIGHT_MS = 1400;

function draw(){
  const g = geom();
  ctx.clearRect(0, 0, g.w, g.h);
  for (let i = 0; i < P.rate; i++) {
    if (Math.random() < 0.25) fire(); // stagger births across frames
  }

  // ---- schematic ----------------------------------------------------------
  ctx.strokeStyle = '#534347'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(g.inA.x, g.inA.y); ctx.lineTo(g.bs.x, g.bs.y);
  ctx.lineTo(g.detC.x, g.detC.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.inB.x, g.inB.y); ctx.lineTo(g.bs.x, g.bs.y);
  ctx.lineTo(g.detD.x, g.detD.y); ctx.stroke();
  // beam splitter
  ctx.save(); ctx.translate(g.bs.x, g.bs.y); ctx.rotate(Math.PI / 4);
  ctx.fillStyle = 'rgba(127,168,208,0.35)'; ctx.fillRect(-3, -26, 6, 52);
  ctx.restore();
  ctx.fillStyle = '#7FA8D0'; ctx.font = '11px monospace';
  ctx.fillText('50/50 BS', g.bs.x - 26, g.bs.y + 40);
  // detectors
  for (const [d, label] of [[g.detC, 'D_c'], [g.detD, 'D_d']]) {
    ctx.fillStyle = '#1F2020'; ctx.strokeStyle = '#F3C77B'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(d.x, d.y, 11, -Math.PI/2, Math.PI/2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F3C77B'; ctx.fillText(label, d.x - 8, d.y - 16);
  }
  ctx.fillStyle = '#D0C6C8';
  ctx.fillText('a →', g.inA.x, g.inA.y - 8);
  ctx.fillText('b →', g.inB.x, g.inB.y + 18);

  // photons in flight — on bunch trials BOTH dots visibly exit one port
  const now = performance.now();
  for (const f of flights) {
    const u = (now - f.born) / FLIGHT_MS;
    if (u >= 1) continue;
    const [ax, ay] = photonPos(g.inA, f.aTo, u, g);
    // the delayed photon trails by |lag| px along its own path
    const ub = Math.max(0, u - Math.abs(f.lag) / 500);
    const [bx, by] = photonPos(g.inB, f.bTo, ub, g);
    ctx.fillStyle = '#FF7F8E';
    ctx.beginPath(); ctx.arc(ax, ay, 4, 0, 7); ctx.fill();
    ctx.fillStyle = f.isCoinc ? '#FF7F8E' : '#F3C77B';
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, 7); ctx.fill();
  }

  // ---- the HOM dip plot ----------------------------------------------------
  const p = g.plot;
  ctx.strokeStyle = '#534347'; ctx.lineWidth = 1;
  ctx.strokeRect(p.x0, p.y0, p.w, p.h);
  // axes ticks: x = Δt in [-4,4], y = P in [0, 0.6]
  const X = (dt) => p.x0 + ((dt + 4) / 8) * p.w;
  const Y = (pr) => p.y0 + p.h - (pr / 0.6) * p.h;
  ctx.fillStyle = '#D0C6C8'; ctx.font = '10px monospace';
  for (const tk of [-4, -2, 0, 2, 4]) {
    ctx.fillText(String(tk), X(tk) - 5, p.y0 + p.h + 12);
    ctx.strokeStyle = 'rgba(83,67,71,0.5)';
    ctx.beginPath(); ctx.moveTo(X(tk), p.y0); ctx.lineTo(X(tk), p.y0 + p.h); ctx.stroke();
  }
  for (const pr of [0, 0.25, 0.5]) {
    ctx.fillText(pr.toFixed(2), p.x0 - 34, Y(pr) + 3);
    ctx.strokeStyle = 'rgba(83,67,71,0.5)';
    ctx.beginPath(); ctx.moveTo(p.x0, Y(pr)); ctx.lineTo(p.x0 + p.w, Y(pr)); ctx.stroke();
  }
  ctx.fillText('Δt / τc-units', p.x0 + p.w / 2 - 30, p.y0 + p.h + 24);
  ctx.save(); ctx.translate(p.x0 - 38, p.y0 + p.h / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('P_coinc', -20, 0); ctx.restore();

  // theory curve for the CURRENT V, τc
  ctx.strokeStyle = '#FF7F8E'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const dt = -4 + (8 * i) / 200;
    const pr = 0.5 * (1 - P.V * Math.exp(-((dt / P.tauc) ** 2)));
    const x = X(dt), y = Y(pr);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // marker at the current Δt: theory (ring) + empirical (dot)
  const emp = trials > 0 ? coinc / trials : null;
  ctx.strokeStyle = '#F3C77B'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(X(P.dt), Y(Pc()), 6, 0, 7); ctx.stroke();
  if (emp !== null) {
    ctx.fillStyle = '#F3C77B';
    ctx.beginPath(); ctx.arc(X(P.dt), Y(Math.min(emp, 0.6)), 4, 0, 7); ctx.fill();
  }

  // ---- readout -------------------------------------------------------------
  ctx.fillStyle = '#D0C6C8'; ctx.font = '12px monospace';
  ctx.fillText(
    'theory P = ' + Pc().toFixed(3) +
    '   simulated = ' + (emp === null ? '—' : emp.toFixed(3)) +
    '   (' + coinc + '/' + trials + ' coincidences)',
    16, g.h * 0.53
  );
  requestAnimationFrame(draw);
}
draw();`
    ),
  },
  {
    id: "doubleslit",
    title: "Single-photon double slit",
    icon: "blur-linear",
    verified: true,
    blurb:
      "Photons arrive ONE at a time — each lands at a single point, yet the fringe pattern builds up. I(y) ∝ cos²(πd·y/λL)·sinc²(πa·y/λL).",
    html: page(
      "Single-photon double slit",
      "Each dot is one photon, sampled from |ψ₁+ψ₂|². The interference pattern emerges statistically — no photon 'splits'. Slit separation d sets fringe spacing; slit width a sets the envelope.",
      [
        { id: "d", label: "Separation d (µm)", min: 10, max: 100, step: 1, value: 40 },
        { id: "a", label: "Slit width a (µm)", min: 2, max: 30, step: 1, value: 8 },
        { id: "lam", label: "λ (nm)", min: 400, max: 700, step: 10, value: 550 },
        { id: "rate", label: "Photons / frame", min: 1, max: 60, step: 1, value: 12 },
      ],
      String.raw`
// Fraunhofer two-slit intensity at screen position y (small angle):
//   I(y) ∝ cos²(π d y / (λ L)) · sinc²(π a y / (λ L))
// with L the slit→screen distance. Photons are sampled from I(y) by
// rejection sampling — the buildup IS the physics here.
const Lmm = 1.0; // slit→screen distance, meters (fixed)
let hits = [];        // recent photon dots (y, age)
let histo = null;     // accumulated counts per screen bin
let total = 0;
const BINS = 160;

function intensity(y){
  // y in mm on screen; d,a in µm; λ in nm → SI
  const d = P.d * 1e-6, a = P.a * 1e-6, lam = P.lam * 1e-9, ym = y * 1e-3;
  const b1 = Math.PI * d * ym / (lam * Lmm);
  const b2 = Math.PI * a * ym / (lam * Lmm);
  const sinc = b2 === 0 ? 1 : Math.sin(b2) / b2;
  return Math.cos(b1) ** 2 * sinc * sinc;
}

const YMAX = 30; // screen half-extent in mm
function samplePhoton(){
  for (let k = 0; k < 60; k++) {
    const y = (Math.random() * 2 - 1) * YMAX;
    if (Math.random() < intensity(y)) return y;
  }
  return null;
}

document.querySelectorAll('input[type=range]').forEach((el) =>
  el.addEventListener('input', () => {
    if (el.id !== 'rate') { hits = []; histo = new Float64Array(BINS); total = 0; }
  })
);
histo = new Float64Array(BINS);

function draw(){
  const w = W(), h = H();
  ctx.clearRect(0, 0, w, h);
  // fire photons
  for (let i = 0; i < P.rate; i++) {
    const y = samplePhoton();
    if (y === null) continue;
    hits.push({ y, born: performance.now() });
    histo[Math.min(BINS - 1, Math.floor(((y + YMAX) / (2 * YMAX)) * BINS))] += 1;
    total += 1;
  }
  if (hits.length > 4000) hits.splice(0, hits.length - 4000);

  // layout: slits sketch left, dotted screen centre, histogram right
  const slitX = w * 0.09, screenX = w * 0.52, histX0 = w * 0.60, histW = w * 0.36;
  const yToPx = (y) => h / 2 + (y / YMAX) * (h * 0.46);

  // slits
  ctx.strokeStyle = '#534347'; ctx.lineWidth = 4;
  const dPx = Math.max(8, P.d * 0.6);
  ctx.beginPath(); ctx.moveTo(slitX, 8); ctx.lineTo(slitX, h/2 - dPx/2 - 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(slitX, h/2 - dPx/2 + 5); ctx.lineTo(slitX, h/2 + dPx/2 - 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(slitX, h/2 + dPx/2 + 5); ctx.lineTo(slitX, h - 8); ctx.stroke();
  ctx.fillStyle = '#D0C6C8'; ctx.font = '11px monospace';
  ctx.fillText('slits', slitX - 14, h - 12);

  // impact dots on the screen line (recent ones glow)
  const now = performance.now();
  for (const p of hits) {
    const age = (now - p.born) / 1200;
    const alpha = age < 1 ? 0.9 - 0.55 * age : 0.35;
    ctx.fillStyle = 'rgba(255,127,142,' + alpha.toFixed(3) + ')';
    // scatter dots in a thin vertical band, deterministic x from y hash
    const jitter = (Math.abs(Math.sin(p.y * 91.7)) - 0.5) * 26;
    ctx.fillRect(screenX + jitter, yToPx(p.y), 2, 2);
  }
  ctx.strokeStyle = '#534347'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(screenX - 20, 8); ctx.lineTo(screenX - 20, h - 8); ctx.stroke();

  // histogram + theory overlay
  let maxBin = 1;
  for (let i = 0; i < BINS; i++) maxBin = Math.max(maxBin, histo[i]);
  ctx.fillStyle = 'rgba(243,199,123,0.55)';
  for (let i = 0; i < BINS; i++) {
    const y0 = (i / BINS) * (h * 0.92) + h * 0.04;
    const bw = (histo[i] / maxBin) * histW;
    ctx.fillRect(histX0, y0, bw, (h * 0.92) / BINS - 1);
  }
  // theory curve, normalized to the same width
  ctx.strokeStyle = '#FF7F8E'; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i <= BINS; i++) {
    const y = -YMAX + (2 * YMAX * i) / BINS;
    const x = histX0 + intensity(y) * histW;
    const yp = (i / BINS) * (h * 0.92) + h * 0.04;
    if (i === 0) ctx.moveTo(x, yp); else ctx.lineTo(x, yp);
  }
  ctx.stroke();

  ctx.fillStyle = '#D0C6C8'; ctx.font = '12px monospace';
  ctx.fillText(total + ' photons   fringe spacing λL/d = ' +
    ((P.lam * 1e-9) * Lmm / (P.d * 1e-6) * 1e3).toFixed(2) + ' mm', 16, 20);
  requestAnimationFrame(draw);
}
draw();`
    ),
  },
  {
    id: "wells",
    title: "1D wells & tunnelling",
    icon: "vertical-align-bottom",
    verified: true,
    blurb:
      "Infinite / finite square well, harmonic oscillator, and barrier tunnelling — real eigenvalues (transcendental roots for the finite well), exact T(E) for the barrier. ħ = m = 1.",
    html: page(
      "1D potentials",
      "Pick a potential. Levels are computed, not sketched: the finite well solves k·tan(kL/2)=κ / −k·cot(kL/2)=κ; the barrier readout is the exact transmission coefficient.",
      [
        { id: "n", label: "State n", min: 1, max: 6, step: 1, value: 1 },
        { id: "size", label: "Width L", min: 1, max: 6, step: 0.1, value: 3 },
        { id: "V0", label: "Depth/height V₀", min: 1, max: 30, step: 0.5, value: 10 },
        { id: "E", label: "E (barrier)", min: 0.5, max: 40, step: 0.5, value: 6 },
      ],
      String.raw`
// Units ħ = m = 1 throughout.
let mode = 'infinite';
let t = 0;

const modeRow = document.getElementById('modes');
const readout = document.getElementById('readout');
const MODES = [['infinite','Infinite'],['finite','Finite'],['harmonic','Harmonic'],['barrier','Barrier']];
const btns = {};
MODES.forEach(([key,label]) => {
  const b = document.createElement('button');
  b.textContent = label; btns[key] = b;
  b.onclick = () => { mode = key; relabel(); highlight(); };
  modeRow.appendChild(b);
});
function highlight(){
  MODES.forEach(([key]) => { btns[key].style.borderColor = key === mode ? '#FF7F8E' : '#534347'; });
}
function relabel(){
  const lbl = document.querySelector('label[for=size]');
  lbl.textContent = mode === 'harmonic' ? 'Frequency ω' : mode === 'barrier' ? 'Barrier width a' : 'Width L';
}
highlight(); relabel();

// ---- solvers ---------------------------------------------------------------
function infiniteLevels(L){
  const out = [];
  for (let n = 1; n <= 8; n++) out.push((n*n*Math.PI*Math.PI)/(2*L*L));
  return out;
}
function harmonicLevels(w){
  const out = [];
  for (let n = 0; n < 8; n++) out.push((n + 0.5) * w);
  return out;
}
// finite well: V = −? — convention here: V = 0 inside [−L/2, L/2], V0 outside.
// Bound states 0 < E < V0. Even: k·tan(kL/2) = κ ; odd: −k·cot(kL/2) = κ.
function finiteLevels(L, V0){
  const roots = [];
  const f = (E, even) => {
    const k = Math.sqrt(2*E), kap = Math.sqrt(2*(V0 - E));
    return even ? k*Math.tan(k*L/2) - kap : -k/Math.tan(k*L/2) - kap;
  };
  for (const even of [true, false]) {
    const N = 4000;
    let prev = f(V0*1e-6 + 1e-9, even), prevE = V0*1e-6 + 1e-9;
    for (let i = 1; i <= N; i++) {
      const E = (i/N) * (V0 - 1e-9);
      const val = f(E, even);
      // skip tan/cot poles: they flip sign with huge magnitude
      if (isFinite(val) && isFinite(prev) && prev * val < 0 &&
          Math.abs(prev) < 1e3 && Math.abs(val) < 1e3) {
        let lo = prevE, hi = E;
        for (let k2 = 0; k2 < 50; k2++) {
          const mid = (lo + hi)/2;
          (f(lo, even) * f(mid, even) <= 0) ? hi = mid : lo = mid;
        }
        roots.push({ E: (lo+hi)/2, even });
      }
      prev = val; prevE = E;
    }
  }
  roots.sort((a,b) => a.E - b.E);
  return roots;
}
// Hermite via recurrence
function hermite(k, x){
  if (k === 0) return 1;
  let hm = 1, h = 2*x;
  for (let i = 1; i < k; i++) { const nx = 2*x*h - 2*i*hm; hm = h; h = nx; }
  return h;
}
// barrier transmission (exact)
function barrierT(E, V0, a){
  if (Math.abs(E - V0) < 1e-9) { const k = Math.sqrt(2*E); return 1/(1 + (k*a/2)**2); }
  if (E < V0) {
    const kap = Math.sqrt(2*(V0 - E));
    return 1/(1 + (V0*V0*Math.sinh(kap*a)**2)/(4*E*(V0-E)));
  }
  const k2 = Math.sqrt(2*(E - V0));
  return 1/(1 + (V0*V0*Math.sin(k2*a)**2)/(4*E*(E-V0)));
}

function draw(){
  t += 1/60;
  const w = W(), h = H();
  ctx.clearRect(0,0,w,h);
  const m = 46, x0 = m, x1 = w - m, plotH = h - 60;
  const xw = x1 - x0;
  ctx.font = '11px monospace';

  if (mode === 'barrier') {
    const a = P.size, V0 = P.V0, E = P.E;
    const T = barrierT(E, V0, a), R = 1 - T;
    // x domain: [-3a, 4a]; barrier on [0, a]
    const XPX = (x) => x0 + ((x + 3*a) / (7*a)) * xw;
    const yBase = h - 40, eScale = plotH / Math.max(V0, E) / 1.6;
    // potential
    ctx.strokeStyle = '#F3C77B'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(XPX(-3*a), yBase); ctx.lineTo(XPX(0), yBase);
    ctx.lineTo(XPX(0), yBase - V0*eScale); ctx.lineTo(XPX(a), yBase - V0*eScale);
    ctx.lineTo(XPX(a), yBase); ctx.lineTo(XPX(4*a), yBase); ctx.stroke();
    // energy line
    ctx.strokeStyle = '#7FA8D0'; ctx.setLineDash([5,4]);
    ctx.beginPath(); ctx.moveTo(x0, yBase - E*eScale); ctx.lineTo(x1, yBase - E*eScale); ctx.stroke();
    ctx.setLineDash([]);
    // |ψ|²: standing ripple left (amplitude from R), decay/oscillation inside, flat T right
    const k = Math.sqrt(2*E);
    ctx.strokeStyle = '#FF7F8E'; ctx.lineWidth = 2; ctx.beginPath();
    const psiY = (v) => yBase - E*eScale - v * 34;
    for (let px = 0; px <= xw; px += 2) {
      const x = -3*a + (px/xw) * 7*a;
      let v;
      if (x < 0) v = 1 + R + 2*Math.sqrt(R)*Math.cos(2*k*x - t*3);
      else if (x <= a) {
        if (E < V0) { const kap = Math.sqrt(2*(V0-E));
          const A0 = 1 + R + 2*Math.sqrt(R); // match left value at x=0
          v = A0 * Math.exp(-2*kap*x) + T*Math.exp(-2*kap*(a-x))*0; }
        else { const k2 = Math.sqrt(2*(E-V0)); v = T + (1-T)*(0.5+0.5*Math.cos(2*k2*x - t*3)); }
      }
      else v = T;
      const X = x0 + px, Y = psiY(v/2);
      if (px === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    readout.textContent =
      'T = ' + T.toFixed(4) + '   R = ' + R.toFixed(4) +
      (E < V0 ? '   κa = ' + (Math.sqrt(2*(V0-E))*a).toFixed(2) + '  (tunnelling)' : '   (over-barrier)');
  } else {
    // bound-state potentials
    const L = P.size;
    let levels, psi, label;
    if (mode === 'infinite') {
      levels = infiniteLevels(L);
      const n = Math.round(P.n);
      psi = (x) => (x < 0 || x > L) ? 0 : Math.sqrt(2/L)*Math.sin(n*Math.PI*x/L);
      label = 'E_n = n²π²/2L²';
    } else if (mode === 'harmonic') {
      const wfreq = P.size; levels = harmonicLevels(wfreq);
      const n = Math.round(P.n) - 1;
      const norm = Math.pow(wfreq/Math.PI, 0.25) / Math.sqrt(Math.pow(2, n) * fact(n));
      psi = (x) => norm * hermite(n, Math.sqrt(wfreq)*x) * Math.exp(-wfreq*x*x/2);
      label = 'E_n = (n+½)ω';
    } else {
      const V0 = P.V0;
      const roots = finiteLevels(L, V0);
      levels = roots.map(r => r.E);
      const idx = Math.min(Math.round(P.n) - 1, roots.length - 1);
      const r = roots[idx];
      if (r) {
        const k = Math.sqrt(2*r.E), kap = Math.sqrt(2*(V0 - r.E));
        psi = (x) => { // well centred at 0, edges ±L/2
          const inside = r.even ? Math.cos(k*x) : Math.sin(k*x);
          if (Math.abs(x) <= L/2) return inside;
          const edge = r.even ? Math.cos(k*L/2) : Math.sin(k*L/2) * Math.sign(x);
          return edge * Math.exp(-kap*(Math.abs(x) - L/2));
        };
      } else psi = () => 0;
      label = roots.length + ' bound state' + (roots.length === 1 ? '' : 's');
    }
    const nSel = Math.min(Math.round(P.n), levels.length) - 1;
    const Emax = mode === 'finite' ? P.V0 : levels[Math.min(7, levels.length-1)] * 1.15;
    const yOf = (E) => (h - 44) - (E / Emax) * (plotH - 20);
    // potential outline
    ctx.strokeStyle = '#F3C77B'; ctx.lineWidth = 2; ctx.beginPath();
    const XC = (u) => x0 + u * xw; // u in 0..1 across domain
    if (mode === 'infinite') {
      ctx.moveTo(XC(0.12), yOf(0) - plotH); ctx.lineTo(XC(0.12), yOf(0));
      ctx.lineTo(XC(0.88), yOf(0)); ctx.lineTo(XC(0.88), yOf(0) - plotH);
    } else if (mode === 'harmonic') {
      for (let u = 0; u <= 1; u += 0.01) {
        const x = (u - 0.5) * 2 * 4/Math.sqrt(P.size); // span ±4/√ω
        const V = 0.5 * P.size*P.size * x*x;
        const X = XC(u), Y = yOf(Math.min(V, Emax));
        if (u === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
    } else {
      ctx.moveTo(XC(0), yOf(P.V0)); ctx.lineTo(XC(0.25), yOf(P.V0));
      ctx.lineTo(XC(0.25), yOf(0)); ctx.lineTo(XC(0.75), yOf(0));
      ctx.lineTo(XC(0.75), yOf(P.V0)); ctx.lineTo(XC(1), yOf(P.V0));
    }
    ctx.stroke();
    // levels
    levels.forEach((E, i) => {
      if (E > Emax) return;
      ctx.strokeStyle = i === nSel ? '#FF7F8E' : 'rgba(208,198,200,0.35)';
      ctx.lineWidth = i === nSel ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(XC(0.14), yOf(E)); ctx.lineTo(XC(0.86), yOf(E)); ctx.stroke();
    });
    // ψ drawn on its level, with a gentle stationary-state phase breath
    if (levels[nSel] !== undefined && psi) {
      const E = levels[nSel];
      const base = yOf(E);
      const phase = Math.cos(E * t * 0.35);
      ctx.strokeStyle = '#FF7F8E'; ctx.lineWidth = 2; ctx.beginPath();
      // sample max |ψ| for scaling
      let peak = 1e-9;
      const domain = (u) => mode === 'infinite'
        ? (u - 0.12) / 0.76 * L
        : mode === 'harmonic' ? (u - 0.5) * 2 * 4/Math.sqrt(P.size)
        : (u - 0.5) * 2 * L; // finite: span ±L
      for (let u = 0; u <= 1; u += 0.01) peak = Math.max(peak, Math.abs(psi(domain(u))));
      for (let u = 0; u <= 1; u += 0.004) {
        const v = psi(domain(u)) / peak * 30 * phase;
        const X = XC(u), Y = base - v;
        if (u === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      readout.textContent = 'mode: ' + mode + '   n = ' + (nSel+1) + '   E = ' +
        E.toFixed(3) + '   ' + label;
    } else {
      readout.textContent = 'mode: ' + mode + '   ' + label;
    }
  }
  requestAnimationFrame(draw);
}
function fact(n){ let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
draw();`,
      `<div id="modes" class="presetrow"></div>
       <div id="readout" class="readout" aria-live="polite"></div>`
    ),
  },
  {
    id: "machzehnder",
    title: "Mach–Zehnder interferometer",
    icon: "device-hub",
    verified: true,
    blurb:
      "One photon, two paths: P(D1)=cos²(φ/2). Block either arm and interference DIES — each photon then reaches BS2 by one path and detectors go 50/50 (of the surviving half).",
    html: page(
      "Mach–Zehnder interferometer",
      "Single photons through BS1 → mirrors → phase φ on the upper arm → BS2. With both arms open the output oscillates with φ; blocking an arm destroys the superposition.",
      [
        { id: "phi", label: "Phase φ (deg)", min: 0, max: 360, step: 2, value: 0 },
        { id: "rate", label: "Photons / frame", min: 1, max: 30, step: 1, value: 6 },
      ],
      String.raw`
// Both arms open:  P(D1) = cos²(φ/2), P(D2) = sin²(φ/2)   (lossless MZI)
// One arm blocked: photon takes each arm with prob ½; blocked half absorbed,
// the survivors hit BS2 in ONE mode → 50/50: P(D1)=P(D2)=¼, P(absorbed)=½.
let block = 'none'; // 'none' | 'upper' | 'lower'
let n1 = 0, n2 = 0, nAbs = 0, total = 0;
const flights = [];

const row = document.getElementById('blocks');
const readout = document.getElementById('readout');
[['none','Both arms open'],['upper','Block upper'],['lower','Block lower']].forEach(([key,label]) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => { block = key; reset(); mark(); };
  row.appendChild(b); row['btn_'+key] = b;
});
function mark(){ ['none','upper','lower'].forEach(k => { row['btn_'+k].style.borderColor = k === block ? '#FF7F8E' : '#534347'; }); }
mark();
function reset(){ n1 = 0; n2 = 0; nAbs = 0; total = 0; flights.length = 0; }
document.querySelectorAll('input[type=range]').forEach((el) =>
  el.addEventListener('input', () => { if (el.id === 'phi') reset(); }));

function probs(){
  const phi = P.phi * Math.PI / 180;
  if (block === 'none') return { d1: Math.cos(phi/2)**2, d2: Math.sin(phi/2)**2, abs: 0 };
  return { d1: 0.25, d2: 0.25, abs: 0.5 };
}

function fire(){
  const p = probs();
  const r = Math.random();
  let fate, arm;
  if (block === 'none') { arm = 'both'; fate = r < p.d1 ? 'D1' : 'D2'; }
  else {
    arm = Math.random() < 0.5 ? 'upper' : 'lower';
    if (arm === block) fate = 'abs';
    else fate = Math.random() < 0.5 ? 'D1' : 'D2';
  }
  total += 1;
  if (fate === 'D1') n1 += 1; else if (fate === 'D2') n2 += 1; else nAbs += 1;
  flights.push({ born: performance.now(), fate, arm });
  if (flights.length > 60) flights.shift();
}

function geom(){
  const w = W(), h = H();
  const b1 = { x: w*0.16, y: h*0.62 }, m1 = { x: w*0.16, y: h*0.18 };
  const m2 = { x: w*0.62, y: h*0.62 }, b2 = { x: w*0.62, y: h*0.18 };
  return { w, h, b1, m1, m2, b2,
    d1: { x: w*0.86, y: h*0.18 }, d2: { x: w*0.62, y: h*0.04 },
    src: { x: w*0.02, y: h*0.62 } };
}
const MS = 1600;
function pos(f, u, g){
  // src→BS1 (0..0.2), arm legs (0.2..0.8), BS2→detector (0.8..1)
  const upper = f.arm === 'upper' || (f.arm === 'both' && f.fate === 'D1');
  // visual convention: 'both' trials draw along BOTH arms as a faint pair —
  // handled in draw(); here return the primary dot position
  const lerp2 = (a, b, v) => [a.x + (b.x-a.x)*v, a.y + (b.y-a.y)*v];
  if (u < 0.2) return lerp2(g.src, g.b1, u/0.2);
  if (f.fate === 'abs') {
    // dies mid-arm at the block
    const armU = Math.min((u - 0.2)/0.6, 0.5);
    return f.arm === 'upper'
      ? lerp2(g.m1, g.b2, armU) // upper horizontal leg
      : lerp2(g.b1, g.m2, armU);
  }
  if (u < 0.5) { // first arm leg
    const v = (u-0.2)/0.3;
    return upper ? lerp2(g.b1, g.m1, v) : lerp2(g.b1, g.m2, v);
  }
  if (u < 0.8) { // second arm leg into BS2
    const v = (u-0.5)/0.3;
    return upper ? lerp2(g.m1, g.b2, v) : lerp2(g.m2, g.b2, v);
  }
  const v = (u-0.8)/0.2;
  return f.fate === 'D1' ? lerp2(g.b2, g.d1, v) : lerp2(g.b2, g.d2, v);
}

function draw(){
  const g = geom();
  ctx.clearRect(0,0,g.w,g.h);
  for (let i = 0; i < P.rate; i++) if (Math.random() < 0.3) fire();

  // rails
  ctx.strokeStyle = '#534347'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(g.src.x, g.src.y); ctx.lineTo(g.b1.x, g.b1.y);
  ctx.lineTo(g.m2.x, g.m2.y); ctx.lineTo(g.b2.x, g.b2.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.b1.x, g.b1.y); ctx.lineTo(g.m1.x, g.m1.y);
  ctx.lineTo(g.b2.x, g.b2.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.b2.x, g.b2.y); ctx.lineTo(g.d1.x, g.d1.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(g.b2.x, g.b2.y); ctx.lineTo(g.d2.x, g.d2.y); ctx.stroke();

  // elements
  const bsplot = (o) => { ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.PI/4);
    ctx.fillStyle = 'rgba(127,168,208,0.35)'; ctx.fillRect(-3, -20, 6, 40); ctx.restore(); };
  bsplot(g.b1); bsplot(g.b2);
  const mirror = (o) => { ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.PI/4);
    ctx.fillStyle = '#D0C6C8'; ctx.fillRect(-2, -16, 4, 32); ctx.restore(); };
  mirror(g.m1); mirror(g.m2);
  ctx.font = '11px monospace'; ctx.fillStyle = '#7FA8D0';
  ctx.fillText('BS1', g.b1.x - 30, g.b1.y + 4);
  ctx.fillText('BS2', g.b2.x - 30, g.b2.y - 8);
  // phase plate on upper horizontal leg
  const px = (g.m1.x + g.b2.x)/2;
  ctx.fillStyle = 'rgba(243,199,123,0.5)'; ctx.fillRect(px - 5, g.m1.y - 16, 10, 32);
  ctx.fillStyle = '#F3C77B'; ctx.fillText('φ', px - 3, g.m1.y - 22);
  // block marker
  if (block !== 'none') {
    const on = block === 'upper' ? { x: (g.m1.x+g.b2.x)/2 + 44, y: g.m1.y } : { x: (g.b1.x+g.m2.x)/2, y: g.b1.y };
    ctx.fillStyle = '#B3261E';
    ctx.fillRect(on.x - 6, on.y - 14, 12, 28);
    ctx.fillText('✕', on.x - 4, on.y + 4);
  }
  // detectors + live bars
  const p = probs();
  for (const [d, label, count, theory] of [[g.d1,'D1',n1,p.d1],[g.d2,'D2',n2,p.d2]]) {
    ctx.fillStyle = '#1F2020'; ctx.strokeStyle = '#F3C77B'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(d.x, d.y, 10, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F3C77B'; ctx.fillText(label, d.x + 14, d.y + 4);
    const frac = total ? count/total : 0;
    ctx.fillStyle = 'rgba(255,127,142,0.8)';
    ctx.fillRect(d.x + 34, d.y + 2, frac * 70, 6);
    ctx.strokeStyle = '#D0C6C8';
    ctx.beginPath(); ctx.moveTo(d.x + 34 + theory*70, d.y); ctx.lineTo(d.x + 34 + theory*70, d.y + 10); ctx.stroke();
  }

  // photons
  const now = performance.now();
  for (const f of flights) {
    const u = (now - f.born)/MS;
    if (u >= 1) continue;
    if (f.fate === 'abs' && u > 0.5) continue;
    if (f.arm === 'both' && u >= 0.2 && u < 0.8) {
      // superposition: draw a fainter dot on EACH arm
      for (const armed of [{...f, arm:'upper', fate:'D1'}, {...f, arm:'lower', fate:'D2'}]) {
        const [x, y] = pos(armed, u, g);
        ctx.fillStyle = 'rgba(255,127,142,0.45)';
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      }
    } else {
      const [x, y] = pos(f, u, g);
      ctx.fillStyle = f.fate === 'abs' ? '#B3261E' : '#FF7F8E';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
    }
  }

  readout.textContent =
    'P(D1) theory ' + p.d1.toFixed(3) + '  sim ' + (total ? (n1/total).toFixed(3) : '—') +
    '    P(D2) theory ' + p.d2.toFixed(3) + '  sim ' + (total ? (n2/total).toFixed(3) : '—') +
    (block !== 'none' ? '    absorbed ' + (total ? (nAbs/total).toFixed(3) : '—') + ' (½ expected)' : '') +
    '    N = ' + total;
  requestAnimationFrame(draw);
}
draw();`,
      `<div id="blocks" class="presetrow"></div>
       <div id="readout" class="readout" aria-live="polite"></div>`
    ),
  },
  {
    id: "hydrogen",
    title: "Hydrogen densities",
    icon: "adjust",
    verified: true,
    blurb:
      "Radial density r²|R_nl|² and angular density |Y_lm|² for any (n,l,m) up to n=5 — real Laguerre/Legendre recurrences, numerically normalized. Bohr radii units.",
    html: page(
      "Hydrogen atom densities",
      "Left: where the electron lives radially (note the n−l−1 nodes). Right: the angular shape |Y_lm(θ)|² (φ-symmetric). l is clamped below n, |m| ≤ l.",
      [
        { id: "n", label: "n", min: 1, max: 5, step: 1, value: 2 },
        { id: "l", label: "l", min: 0, max: 4, step: 1, value: 1 },
        { id: "m", label: "|m|", min: 0, max: 4, step: 1, value: 0 },
      ],
      String.raw`
// R_nl(r) ∝ (2r/n)^l · e^{−r/n} · L^{2l+1}_{n−l−1}(2r/n)   (a₀ = 1)
function laguerre(k, a, x){
  if (k === 0) return 1;
  let lm = 1, l = 1 + a - x;
  for (let i = 1; i < k; i++) {
    const nx = ((2*i + 1 + a - x) * l - (i + a) * lm) / (i + 1);
    lm = l; l = nx;
  }
  return l;
}
function legendreP(l, m, x){
  // associated Legendre P_l^m, m ≥ 0
  let pmm = 1;
  if (m > 0) {
    const s = Math.sqrt((1 - x) * (1 + x));
    let f = 1;
    for (let i = 1; i <= m; i++) { pmm *= -f * s; f += 2; }
  }
  if (l === m) return pmm;
  let pm1 = x * (2*m + 1) * pmm;
  if (l === m + 1) return pm1;
  let p = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    p = ((2*ll - 1) * x * pm1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pm1; pm1 = p;
  }
  return p;
}
function clamped(){
  const n = Math.round(P.n);
  const l = Math.min(Math.round(P.l), n - 1);
  const m = Math.min(Math.round(P.m), l);
  return { n, l, m };
}
function radial(n, l){
  // sampled + numerically normalized r²R² on [0, rMax]
  const rMax = n * n * 4 + 8, N = 500;
  const vals = new Float64Array(N + 1);
  let norm = 0;
  for (let i = 0; i <= N; i++) {
    const r = (i / N) * rMax;
    const x = 2 * r / n;
    const R = Math.pow(x, l) * Math.exp(-r / n) * laguerre(n - l - 1, 2*l + 1, x);
    vals[i] = r * r * R * R;
    norm += vals[i] * (rMax / N);
  }
  for (let i = 0; i <= N; i++) vals[i] /= norm || 1;
  return { vals, rMax };
}

function draw(){
  const { n, l, m } = clamped();
  const w = W(), h = H();
  ctx.clearRect(0,0,w,h);
  ctx.font = '11px monospace';

  // ---- radial panel (left 55%) ----
  const px0 = 44, pw = w * 0.52, py0 = 26, ph = h - 70;
  const { vals, rMax } = radial(n, l);
  let peak = 1e-12; for (const v of vals) peak = Math.max(peak, v);
  ctx.strokeStyle = '#534347'; ctx.strokeRect(px0, py0, pw, ph);
  ctx.strokeStyle = '#FF7F8E'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < vals.length; i++) {
    const X = px0 + (i / (vals.length - 1)) * pw;
    const Y = py0 + ph - (vals[i] / peak) * (ph - 8);
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.stroke();
  ctx.fillStyle = '#D0C6C8';
  ctx.fillText('r²|R|²', px0 + 4, py0 + 12);
  for (const frac of [0, 0.5, 1]) {
    ctx.fillText((rMax * frac).toFixed(0) + 'a₀', px0 + frac * pw - 8, py0 + ph + 14);
  }

  // ---- angular panel (right) ----
  const cx = w * 0.79, cy = py0 + ph / 2, R0 = Math.min(w * 0.19, ph / 2 - 6);
  let apeak = 1e-12;
  for (let i = 0; i <= 180; i++) {
    const v = legendreP(l, m, Math.cos(i * Math.PI / 180)) ** 2;
    if (v > apeak) apeak = v;
  }
  ctx.strokeStyle = 'rgba(208,198,200,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R0, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#F3C77B'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 360; i++) {
    const th = i * Math.PI / 180;
    const v = legendreP(l, m, Math.cos(th)) ** 2 / apeak;
    const X = cx + R0 * v * Math.sin(th), Y = cy - R0 * v * Math.cos(th);
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.stroke();
  ctx.fillStyle = '#D0C6C8';
  ctx.fillText('|Y_lm(θ)|²', cx - 30, py0 + 12);
  ctx.fillText('z', cx - 3, cy - R0 - 6);

  ctx.fillStyle = '#F3C77B'; ctx.font = '13px monospace';
  ctx.fillText(
    '(n,l,m) = (' + n + ',' + l + ',' + m + ')   radial nodes: ' + (n - l - 1) +
    '   E = −13.6/' + n + '² eV = ' + (-13.6 / (n*n)).toFixed(2) + ' eV',
    px0, h - 22
  );
  requestAnimationFrame(draw);
}
draw();`
    ),
  },
  {
    id: "hydrogen3d",
    title: "Hydrogen orbitals — 3D cloud",
    icon: "3d-rotation",
    verified: true,
    blurb:
      "Drag to rotate a Monte-Carlo cloud of |ψ_nlm|² — 3000 electrons' worth of probability, sampled from the real density. See the dumbbells, donuts and shells in space.",
    html: page(
      "Hydrogen orbital in 3D",
      "Points are sampled from |ψ_nlm|² = |R_nl|²·|Y_lm|² (φ uniform for the |m| density). Drag to orbit the view; it slow-spins on its own otherwise.",
      [
        { id: "n", label: "n", min: 1, max: 4, step: 1, value: 3 },
        { id: "l", label: "l", min: 0, max: 3, step: 1, value: 2 },
        { id: "m", label: "|m|", min: 0, max: 3, step: 1, value: 0 },
      ],
      String.raw`
// Rejection/CDF sampling from the exact density, hand-rolled 3D projection
// with painter-style depth cues (no libraries — the whole page stays
// self-contained + offline).
function laguerre(k, a, x){
  if (k === 0) return 1;
  let lm = 1, l = 1 + a - x;
  for (let i = 1; i < k; i++) {
    const nx = ((2*i + 1 + a - x) * l - (i + a) * lm) / (i + 1);
    lm = l; l = nx;
  }
  return l;
}
function legendreP(l, m, x){
  let pmm = 1;
  if (m > 0) {
    const s = Math.sqrt((1 - x) * (1 + x));
    let f = 1;
    for (let i = 1; i <= m; i++) { pmm *= -f * s; f += 2; }
  }
  if (l === m) return pmm;
  let pm1 = x * (2*m + 1) * pmm;
  if (l === m + 1) return pm1;
  let p = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    p = ((2*ll - 1) * x * pm1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pm1; pm1 = p;
  }
  return p;
}

const NPTS = 3000;
let pts = [];       // [x,y,z] in units of rMax
let cur = '';       // which (n,l,m) the cloud belongs to
let yaw = 0.6, pitch = 0.35, dragging = false, lastX = 0, lastY = 0;

function clamped(){
  const n = Math.round(P.n);
  const l = Math.min(Math.round(P.l), n - 1);
  const m = Math.min(Math.round(P.m), l);
  return { n, l, m };
}

function rebuild(){
  const { n, l, m } = clamped();
  cur = n + ',' + l + ',' + m;
  // CDF-sample r from r²R², θ from |P_l^m(cosθ)|² sinθ, φ uniform
  const NR = 600, rMax = n * n * 4 + 6;
  const rcdf = new Float64Array(NR + 1);
  for (let i = 1; i <= NR; i++) {
    const r = (i / NR) * rMax, x = 2 * r / n;
    const R = Math.pow(x, l) * Math.exp(-r / n) * laguerre(n - l - 1, 2*l + 1, x);
    rcdf[i] = rcdf[i-1] + r * r * R * R;
  }
  const NT = 360;
  const tcdf = new Float64Array(NT + 1);
  for (let i = 1; i <= NT; i++) {
    const th = (i / NT) * Math.PI;
    tcdf[i] = tcdf[i-1] + legendreP(l, m, Math.cos(th)) ** 2 * Math.sin(th);
  }
  const inv = (cdf, N, u) => {
    const target = u * cdf[N];
    let lo = 0, hi = N;
    while (lo < hi) { const mid = (lo + hi) >> 1; (cdf[mid] < target) ? lo = mid + 1 : hi = mid; }
    return lo / N;
  };
  pts = [];
  for (let i = 0; i < NPTS; i++) {
    const r = inv(rcdf, NR, Math.random());          // 0..1 of rMax
    const th = inv(tcdf, NT, Math.random()) * Math.PI;
    const ph = Math.random() * 2 * Math.PI;
    pts.push([
      r * Math.sin(th) * Math.cos(ph),
      r * Math.sin(th) * Math.sin(ph),
      r * Math.cos(th),
    ]);
  }
}
rebuild();
document.querySelectorAll('input[type=range]').forEach((el) =>
  el.addEventListener('input', rebuild));

canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  yaw += (e.clientX - lastX) * 0.008; pitch += (e.clientY - lastY) * 0.008;
  pitch = Math.max(-1.4, Math.min(1.4, pitch));
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('touchstart', (e) => { dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; e.preventDefault(); }, {passive:false});
canvas.addEventListener('touchmove', (e) => {
  if (!dragging) return;
  yaw += (e.touches[0].clientX - lastX) * 0.008; pitch += (e.touches[0].clientY - lastY) * 0.008;
  pitch = Math.max(-1.4, Math.min(1.4, pitch));
  lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; e.preventDefault();
}, {passive:false});
addEventListener('touchend', () => { dragging = false; });

const depthSorted = new Array(NPTS);
function draw(){
  if (!dragging) yaw += 0.003; // idle slow spin
  const { n, l, m } = clamped();
  if (cur !== n + ',' + l + ',' + m) rebuild();
  const w = W(), h = H(), cx = w/2, cy = h/2, R = Math.min(w, h) * 0.44;
  ctx.clearRect(0,0,w,h);
  const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  let k = 0;
  for (const [x, y, z] of pts) {
    // yaw about z, then pitch about x
    const x1 = x * cy_ - y * sy_, y1 = x * sy_ + y * cy_;
    const y2 = y1 * cp - z * sp,  z2 = y1 * sp + z * cp;
    depthSorted[k++] = [cx + x1 * R, cy - z2 * R, y2];
  }
  depthSorted.sort((a, b) => a[2] - b[2]); // back to front
  for (const [X, Y, d] of depthSorted) {
    const a = 0.25 + 0.55 * (d + 1) / 2;
    const s = 1.2 + 1.3 * (d + 1) / 2;
    ctx.fillStyle = 'rgba(255,127,142,' + a.toFixed(3) + ')';
    ctx.fillRect(X, Y, s, s);
  }
  // z axis hint
  const zx = cx + 0, zy = cy - (Math.cos(pitch)) * R * 1.02;
  ctx.fillStyle = '#D0C6C8'; ctx.font = '11px monospace';
  ctx.fillText('z', cx - 3, Math.max(12, zy));
  ctx.fillText('(n,l,|m|) = (' + n + ',' + l + ',' + m + ')   drag to rotate', 14, 20);
  requestAnimationFrame(draw);
}
draw();`
    ),
  },
  {
    id: "pendulum",
    title: "Damped pendulum",
    icon: "schedule",
    blurb: "θ̈ = −(g/L)·sinθ − γθ̇ — integrated live (RK-lite). Push it past small angles and watch anharmonicity.",
    html: page(
      "Damped pendulum",
      "Full nonlinear equation — not the small-angle approximation. γ is the damping coefficient.",
      [
        { id: "L", label: "Length L (m)", min: 0.2, max: 3, step: 0.1, value: 1 },
        { id: "gamma", label: "Damping γ", min: 0, max: 1.5, step: 0.05, value: 0.1 },
        { id: "theta0", label: "θ₀ (deg)", min: 5, max: 175, step: 5, value: 60 },
      ],
      `
let th = P.theta0 * Math.PI/180, w = 0, lastTheta0 = P.theta0;
function step(dt){
  if (P.theta0 !== lastTheta0){ th = P.theta0*Math.PI/180; w = 0; lastTheta0 = P.theta0; }
  const g = 9.81;
  for (let i=0;i<4;i++){
    const a = -(g/P.L)*Math.sin(th) - P.gamma*w;
    w += a*dt/4; th += w*dt/4;
  }
}
function draw(){
  step(1/60);
  ctx.clearRect(0,0,W(),H());
  const cx = W()/2, cy = H()*0.18, scale = Math.min(W(),H())*0.35/1.5*Math.min(P.L,1.5)/P.L;
  const px = cx + Math.sin(th)*P.L*scale*1.4, py = cy + Math.cos(th)*P.L*scale*1.4;
  ctx.strokeStyle = '#534347'; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(px,py); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#FF7F8E'; ctx.beginPath(); ctx.arc(px,py,14,0,7); ctx.fill();
  ctx.fillStyle = '#D0C6C8'; ctx.font = '12px monospace';
  ctx.fillText('θ = ' + (th*180/Math.PI).toFixed(1) + '°   ω = ' + w.toFixed(2) + ' rad/s', 16, 24);
  requestAnimationFrame(draw);
}
draw();`
    ),
  },
  {
    id: "interference",
    title: "Two-source interference",
    icon: "waves",
    blurb: "Two coherent point sources — the classic double-slit intensity pattern, animated in real time.",
    html: page(
      "Two-source interference",
      "Brightness ∝ |ψ₁+ψ₂|². Change the separation d and wavelength λ and watch the fringes move.",
      [
        { id: "d", label: "Separation d", min: 10, max: 160, step: 2, value: 60 },
        { id: "lam", label: "Wavelength λ", min: 8, max: 60, step: 1, value: 24 },
        { id: "speed", label: "Speed", min: 0, max: 3, step: 0.1, value: 1 },
      ],
      `
let t = 0;
const GRID = 3;
function draw(){
  t += 0.08 * P.speed;
  const w = W(), h = H();
  ctx.clearRect(0,0,w,h);
  const s1y = h/2 - P.d/2, s2y = h/2 + P.d/2, sx = w*0.12;
  const k = 2*Math.PI/P.lam;
  for (let x=0; x<w; x+=GRID){
    for (let y=0; y<h; y+=GRID){
      const r1 = Math.hypot(x-sx, y-s1y), r2 = Math.hypot(x-sx, y-s2y);
      const amp = Math.cos(k*r1 - t) + Math.cos(k*r2 - t);
      const I = amp*amp/4;
      ctx.fillStyle = 'rgba(255,127,142,' + (I*0.85).toFixed(3) + ')';
      ctx.fillRect(x,y,GRID,GRID);
    }
  }
  ctx.fillStyle = '#FFF';
  ctx.beginPath(); ctx.arc(sx,s1y,4,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(sx,s2y,4,0,7); ctx.fill();
  requestAnimationFrame(draw);
}
draw();`
    ),
  },
  {
    id: "standing",
    title: "Standing waves",
    icon: "graphic-eq",
    blurb: "A string fixed at both ends: pick the harmonic n and watch nodes and antinodes form.",
    html: page(
      "Standing waves on a string",
      "y(x,t) = A·sin(nπx/L)·cos(ωt). The n-th harmonic has n−1 interior nodes.",
      [
        { id: "n", label: "Harmonic n", min: 1, max: 8, step: 1, value: 2 },
        { id: "A", label: "Amplitude", min: 10, max: 80, step: 5, value: 50 },
        { id: "f", label: "Frequency", min: 0.2, max: 3, step: 0.1, value: 1 },
      ],
      `
let t = 0;
function draw(){
  t += 0.03;
  const w = W(), h = H(), mid = h/2, m = 40;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = '#534347'; ctx.setLineDash([4,6]);
  ctx.beginPath(); ctx.moveTo(m,mid); ctx.lineTo(w-m,mid); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#FF7F8E'; ctx.lineWidth = 3; ctx.beginPath();
  for (let x=0; x<=w-2*m; x+=3){
    const y = mid - P.A*Math.sin(P.n*Math.PI*x/(w-2*m))*Math.cos(2*Math.PI*P.f*t);
    if (x===0) ctx.moveTo(m+x,y); else ctx.lineTo(m+x,y);
  }
  ctx.stroke();
  // envelope
  ctx.strokeStyle = 'rgba(243,199,123,0.5)'; ctx.lineWidth = 1;
  [1,-1].forEach(sgn => { ctx.beginPath();
    for (let x=0; x<=w-2*m; x+=3){
      const y = mid - sgn*P.A*Math.abs(Math.sin(P.n*Math.PI*x/(w-2*m)));
      if (x===0) ctx.moveTo(m+x,y); else ctx.lineTo(m+x,y);
    } ctx.stroke(); });
  ctx.fillStyle = '#D0C6C8'; ctx.font = '12px monospace';
  ctx.fillText('nodes: ' + (P.n-1) + ' interior', 16, 24);
  requestAnimationFrame(draw);
}
draw();`
    ),
  },
  {
    id: "lissajous",
    title: "Lissajous figures",
    icon: "all-inclusive",
    blurb: "x = sin(a·t+δ), y = sin(b·t) — frequency ratios draw closed curves; irrational ratios never close.",
    html: page(
      "Lissajous figures",
      "The oscilloscope classic. Try a:b = 3:2 with δ = 90°.",
      [
        { id: "a", label: "Freq a", min: 1, max: 9, step: 1, value: 3 },
        { id: "b", label: "Freq b", min: 1, max: 9, step: 1, value: 2 },
        { id: "delta", label: "Phase δ (deg)", min: 0, max: 180, step: 5, value: 90 },
      ],
      `
let t = 0;
const trail = [];
function draw(){
  t += 0.02;
  const w = W(), h = H(), cx = w/2, cy = h/2, R = Math.min(w,h)*0.38;
  const d = P.delta*Math.PI/180;
  trail.push([cx + R*Math.sin(P.a*t + d), cy + R*Math.sin(P.b*t)]);
  if (trail.length > 900) trail.shift();
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = '#FF7F8E'; ctx.lineWidth = 2; ctx.beginPath();
  trail.forEach(([x,y],i) => { if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  ctx.stroke();
  const head = trail[trail.length-1];
  ctx.fillStyle = '#F3C77B'; ctx.beginPath(); ctx.arc(head[0],head[1],5,0,7); ctx.fill();
  requestAnimationFrame(draw);
}
draw();`
    ),
  },
  {
    id: "bloch",
    title: "Bloch sphere",
    icon: "public",
    blurb:
      "Qiskit-style single qubit |\u03c8\u27e9 = cos(\u03b8/2)|0\u27e9 + e^{i\u03c6}sin(\u03b8/2)|1\u27e9 \u2014 drag the state, scrub time, read \u27e8\u03c3\u27e9 live.",
    html: page(
      "Bloch sphere",
      "Drag directly on the sphere to move |\u03c8\u27e9. Presets jump to the six cardinal states; \u03c9 precesses about \u1e91 (Larmor).",
      [
        { id: "theta", label: "\u03b8 (deg)", min: 0, max: 180, step: 1, value: 60 },
        { id: "phi", label: "\u03c6 (deg)", min: 0, max: 360, step: 1, value: 30 },
        { id: "omega", label: "Precession \u03c9", min: 0, max: 3, step: 0.1, value: 0 },
      ],
      String.raw`
// ---- Qiskit-grade Bloch sphere ------------------------------------------
// Dotted great-circle wireframe (back halves fainter), axis triad with
// arrowheads, drag-to-set-state, cardinal presets, play/pause + time scrub,
// dashed projection guides, live theta/phi/<sx><sy><sz> readout.
let t = 0, playing = true;
// P5: the whole sphere free-rotates — drag either moves the STATE (default)
// or orbits the VIEW, toggled by the button below.
let dragMode = 'state';
let viewYaw = 0, viewTilt = 0.45;
let lastPX = 0, lastPY = 0;

const readout = document.getElementById('readout');
const presetRow = document.getElementById('presets');
const playBtn = document.getElementById('play');
const tScrub = document.getElementById('tscrub');
const dragBtn = document.getElementById('dragmode');
dragBtn.onclick = () => {
  dragMode = dragMode === 'state' ? 'view' : 'state';
  dragBtn.textContent = dragMode === 'state' ? 'Drag: state' : 'Drag: view';
};

const PRESETS = [
  ['|0\u27e9', 0, 0], ['|1\u27e9', 180, 0],
  ['|+\u27e9', 90, 0], ['|\u2212\u27e9', 90, 180],
  ['|+i\u27e9', 90, 90], ['|\u2212i\u27e9', 90, 270],
];
PRESETS.forEach(([label, th, ph]) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => { setState(th, ph); t = 0; tScrub.value = 0; };
  presetRow.appendChild(b);
});
playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? '\u23f8' : '\u25b6'; };
tScrub.addEventListener('input', () => { t = parseFloat(tScrub.value); });

function setState(thDeg, phDeg){
  P.theta = thDeg; P.phi = phDeg;
  const thEl = document.getElementById('theta'), phEl = document.getElementById('phi');
  thEl.value = thDeg; phEl.value = phDeg;
  document.getElementById('theta-out').textContent = thDeg;
  document.getElementById('phi-out').textContent = phDeg;
}

function project(x, y, z, cx, cy, R){
  // yaw about z first (free view rotation), then the tilt
  const xr = x*Math.cos(viewYaw) - y*Math.sin(viewYaw);
  const yr = x*Math.sin(viewYaw) + y*Math.cos(viewYaw);
  return [
    cx + R * xr,
    cy - R * (z*Math.cos(viewTilt) - yr*Math.sin(viewTilt)),
    yr*Math.cos(viewTilt) + z*Math.sin(viewTilt), // depth: >0 toward viewer
  ];
}

// Split a parametric great circle into front/back polyline segments so the
// back half can render fainter — the classic textbook depth cue.
function drawCircle(fn, cx, cy, R, frontStyle, backStyle){
  for (const front of [false, true]) {
    ctx.strokeStyle = front ? frontStyle : backStyle;
    ctx.setLineDash([3,5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    for (let a = 0; a <= 360; a += 3){
      const [x, y, z] = fn(a * Math.PI/180);
      const [px, py, d] = project(x, y, z, cx, cy, R);
      const vis = front ? d >= 0 : d < 0;
      if (vis){ if (!started){ ctx.moveTo(px,py); started = true; } else ctx.lineTo(px,py); }
      else started = false;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function arrow(x1,y1,x2,y2,style,w){
  ctx.strokeStyle = style; ctx.fillStyle = style; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const ang = Math.atan2(y2-y1, x2-x1), L = 4 + 2*w;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - L*Math.cos(ang - 0.4), y2 - L*Math.sin(ang - 0.4));
  ctx.lineTo(x2 - L*Math.cos(ang + 0.4), y2 - L*Math.sin(ang + 0.4));
  ctx.closePath(); ctx.fill();
}

// drag on the sphere sets theta/phi (invert the projection approximately:
// use the screen offset as x/z' and clamp onto the sphere)
let dragging = false;
function pointerToState(e){
  const rect = canvas.getBoundingClientRect();
  const px = (e.touches ? e.touches[0].clientX : e.clientX);
  const py = (e.touches ? e.touches[0].clientY : e.clientY);
  if (dragMode === 'view') {
    viewYaw += (px - lastPX) * 0.008;
    viewTilt = Math.max(-1.35, Math.min(1.35, viewTilt + (py - lastPY) * 0.008));
    lastPX = px; lastPY = py;
    return;
  }
  lastPX = px; lastPY = py;
  const cx = rect.width/2, cy = rect.height/2, R = Math.min(rect.width, rect.height)*0.34;
  const ex = (px - rect.left - cx)/R;
  const ey = (cy - (py - rect.top))/R;
  // treat pointer as (x', z') on the visible disc; recover depth from the
  // sphere, then UNDO the view yaw so the recovered state is view-independent
  const xr = Math.max(-1, Math.min(1, ex));
  const zc = Math.max(-1, Math.min(1, ey / Math.cos(viewTilt)));
  let yr = 1 - xr*xr - zc*zc;
  yr = yr > 0 ? Math.sqrt(yr) : 0; // front hemisphere
  const x = xr*Math.cos(viewYaw) + yr*Math.sin(viewYaw);
  const y = -xr*Math.sin(viewYaw) + yr*Math.cos(viewYaw);
  const th = Math.acos(Math.max(-1, Math.min(1, zc)));
  let ph = Math.atan2(y, x) * 180/Math.PI;
  const phTotal = ((ph % 360) + 360) % 360;
  setState(Math.round(th*180/Math.PI), Math.round(phTotal));
}
canvas.addEventListener('mousedown', e => { dragging = true; lastPX = e.clientX; lastPY = e.clientY; pointerToState(e); });
addEventListener('mousemove', e => { if (dragging) pointerToState(e); });
addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('touchstart', e => { dragging = true; lastPX = e.touches[0].clientX; lastPY = e.touches[0].clientY; pointerToState(e); e.preventDefault(); }, {passive:false});
canvas.addEventListener('touchmove', e => { if (dragging){ pointerToState(e); e.preventDefault(); } }, {passive:false});
addEventListener('touchend', () => { dragging = false; });

function draw(){
  if (playing && !dragging) { t += 0.016; if (t > 20) t = 0; tScrub.value = t.toFixed(2); }
  const w = W(), h = H(), cx = w/2, cy = h/2, R = Math.min(w,h)*0.34;
  ctx.clearRect(0,0,w,h);

  // silhouette
  ctx.strokeStyle = '#534347'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.stroke();

  // dotted wireframe: equator + two meridians + two latitude circles
  drawCircle(a => [Math.cos(a), Math.sin(a), 0], cx, cy, R, 'rgba(208,198,200,0.55)', 'rgba(208,198,200,0.18)');
  drawCircle(a => [Math.cos(a), 0, Math.sin(a)], cx, cy, R, 'rgba(208,198,200,0.4)', 'rgba(208,198,200,0.14)');
  drawCircle(a => [0, Math.cos(a), Math.sin(a)], cx, cy, R, 'rgba(208,198,200,0.4)', 'rgba(208,198,200,0.14)');
  for (const zl of [0.5, -0.5]) {
    const rl = Math.sqrt(1 - zl*zl);
    drawCircle(a => [rl*Math.cos(a), rl*Math.sin(a), zl], cx, cy, R, 'rgba(208,198,200,0.22)', 'rgba(208,198,200,0.08)');
  }

  // axis triad
  const AXES = [
    [[1.25,0,0], 'x\u0302', '#8FB58F'],
    [[0,1.25,0], 'y\u0302', '#7FA8D0'],
    [[0,0,1.25], '', '#D0C6C8'],
    [[0,0,-1.25], '', '#D0C6C8'],
  ];
  for (const [v, label, col] of AXES){
    const [px, py] = project(v[0], v[1], v[2], cx, cy, R);
    arrow(cx, cy, px, py, col, 1);
    if (label){ ctx.fillStyle = col; ctx.font = 'italic 13px serif'; ctx.fillText(label, px + 4, py + 4); }
  }
  ctx.fillStyle = '#D0C6C8'; ctx.font = '13px monospace';
  const [zx, zy] = project(0, 0, 1.38, cx, cy, R);
  ctx.fillText('|0\u27e9', zx - 10, zy);
  const [zx2, zy2] = project(0, 0, -1.38, cx, cy, R);
  ctx.fillText('|1\u27e9', zx2 - 10, zy2 + 8);

  // state vector (+ precession)
  const th = P.theta * Math.PI/180;
  const ph = P.phi * Math.PI/180 + P.omega * t;
  const sx = Math.sin(th)*Math.cos(ph), sy = Math.sin(th)*Math.sin(ph), sz = Math.cos(th);
  const [px, py, depth] = project(sx, sy, sz, cx, cy, R);

  // dashed projection guides (tip -> equator plane -> z axis), Qiskit-style
  const [ex, ey] = project(sx, sy, 0, cx, cy, R);
  const [ax, ay] = project(0, 0, sz, cx, cy, R);
  ctx.setLineDash([4,4]); ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(243,199,123,0.5)';
  ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(ex,ey); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(ax,ay); ctx.stroke();
  ctx.strokeStyle = 'rgba(243,199,123,0.3)';
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke();
  ctx.setLineDash([]);

  // the ket itself
  arrow(cx, cy, px, py, depth < 0 ? 'rgba(255,127,142,0.5)' : '#FF7F8E', 3);
  ctx.fillStyle = '#F3C77B'; ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#0E0E0E'; ctx.beginPath(); ctx.arc(px, py, 2.5, 0, 7); ctx.fill();

  // live readout
  const phiNow = ((ph*180/Math.PI) % 360 + 360) % 360;
  readout.textContent =
    '\u03b8 = ' + (th*180/Math.PI).toFixed(1) + '\u00b0    ' +
    '\u03c6(t) = ' + phiNow.toFixed(1) + '\u00b0    ' +
    '\u27e8\u03c3x\u27e9 = ' + sx.toFixed(3) + '    ' +
    '\u27e8\u03c3y\u27e9 = ' + sy.toFixed(3) + '    ' +
    '\u27e8\u03c3z\u27e9 = ' + sz.toFixed(3);
  requestAnimationFrame(draw);
}
draw();`,
      `<div class="row" style="padding:0 16px">
        <button id="play" class="vizbtn" aria-label="Play or pause precession">\u23f8</button>
        <button id="dragmode" class="vizbtn" aria-label="Toggle whether dragging moves the state or rotates the view">Drag: state</button>
        <input type="range" id="tscrub" min="0" max="20" step="0.01" value="0" aria-label="Time scrub" style="flex:1;accent-color:#F3C77B">
      </div>
      <div id="presets" class="presetrow"></div>
      <div id="readout" class="readout" aria-live="polite"></div>`
    ),
  },
];
