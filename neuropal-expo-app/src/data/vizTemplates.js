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
`;

function page(title, blurb, sliders, script) {
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
    blurb: "A single qubit |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩ on the Bloch sphere, with optional Larmor precession.",
    html: page(
      "Bloch sphere",
      "Set θ and φ, or turn on precession (rotation about ẑ, like a spin in a magnetic field).",
      [
        { id: "theta", label: "θ (deg)", min: 0, max: 180, step: 5, value: 60 },
        { id: "phi", label: "φ (deg)", min: 0, max: 360, step: 5, value: 30 },
        { id: "omega", label: "Precession ω", min: 0, max: 3, step: 0.1, value: 0.8 },
      ],
      `
let t = 0;
function project(x, y, z, cx, cy, R){
  // simple orthographic with slight tilt so the sphere reads as 3D
  const tilt = 0.42;
  const px = cx + R * x;
  const py = cy - R * (z*Math.cos(tilt) - y*Math.sin(tilt));
  const depth = y*Math.cos(tilt) + z*Math.sin(tilt);
  return [px, py, depth];
}
function draw(){
  t += 0.016;
  const w = W(), h = H(), cx = w/2, cy = h/2, R = Math.min(w,h)*0.36;
  ctx.clearRect(0,0,w,h);
  // sphere outline + equator
  ctx.strokeStyle = '#534347'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.stroke();
  ctx.beginPath();
  for (let a=0;a<=360;a+=6){
    const r = a*Math.PI/180;
    const [x,y] = project(Math.cos(r), Math.sin(r), 0, cx, cy, R);
    if (a===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
  // axes
  const axes = [[[0,0,1],'|0⟩'],[[0,0,-1],'|1⟩'],[[1,0,0],'x'],[[0,1,0],'y']];
  ctx.fillStyle = '#D0C6C8'; ctx.font = '13px monospace';
  axes.forEach(([v,label]) => {
    const [x,y] = project(v[0],v[1],v[2],cx,cy,R*1.12);
    ctx.fillText(label, x-6, y+4);
  });
  // state vector
  const th = P.theta*Math.PI/180;
  const ph = P.phi*Math.PI/180 + P.omega*t;
  const sx = Math.sin(th)*Math.cos(ph), sy = Math.sin(th)*Math.sin(ph), sz = Math.cos(th);
  const [px,py,depth] = project(sx,sy,sz,cx,cy,R);
  ctx.strokeStyle = depth < 0 ? 'rgba(255,127,142,0.45)' : '#FF7F8E';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(px,py); ctx.stroke();
  ctx.fillStyle = '#F3C77B'; ctx.beginPath(); ctx.arc(px,py,6,0,7); ctx.fill();
  ctx.fillStyle = '#D0C6C8'; ctx.font = '12px monospace';
  ctx.fillText('⟨σz⟩ = ' + sz.toFixed(2) + '   φ(t) = ' + ((ph*180/Math.PI)%360).toFixed(0) + '°', 16, 24);
  requestAnimationFrame(draw);
}
draw();`
    ),
  },
];
