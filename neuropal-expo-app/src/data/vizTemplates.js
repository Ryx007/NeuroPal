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
const TILT = 0.45;

const readout = document.getElementById('readout');
const presetRow = document.getElementById('presets');
const playBtn = document.getElementById('play');
const tScrub = document.getElementById('tscrub');

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
  return [
    cx + R * x,
    cy - R * (z*Math.cos(TILT) - y*Math.sin(TILT)),
    y*Math.cos(TILT) + z*Math.sin(TILT), // depth: >0 toward viewer
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
  const cx = rect.width/2, cy = rect.height/2, R = Math.min(rect.width, rect.height)*0.34;
  const ex = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left - cx)/R;
  const ey = (cy - ((e.touches ? e.touches[0].clientY : e.clientY) - rect.top))/R;
  // treat pointer as (x, z') on the visible disc; recover y from the sphere
  const r2 = ex*ex + ey*ey;
  const x = Math.max(-1, Math.min(1, ex));
  const zc = Math.max(-1, Math.min(1, ey / Math.cos(TILT)));
  let y = 1 - x*x - zc*zc;
  y = y > 0 ? Math.sqrt(y) : 0; // front hemisphere
  const th = Math.acos(Math.max(-1, Math.min(1, zc)));
  let ph = Math.atan2(y, x) * 180/Math.PI;
  const phTotal = ((ph % 360) + 360) % 360;
  setState(Math.round(th*180/Math.PI), Math.round(phTotal));
}
canvas.addEventListener('mousedown', e => { dragging = true; pointerToState(e); });
addEventListener('mousemove', e => { if (dragging) pointerToState(e); });
addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('touchstart', e => { dragging = true; pointerToState(e); e.preventDefault(); }, {passive:false});
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
        <input type="range" id="tscrub" min="0" max="20" step="0.01" value="0" aria-label="Time scrub" style="flex:1;accent-color:#F3C77B">
      </div>
      <div id="presets" class="presetrow"></div>
      <div id="readout" class="readout" aria-live="polite"></div>`
    ),
  },
];
