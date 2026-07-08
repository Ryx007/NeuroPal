# 4 — Visualizer — NOTES

**Directive:** D12 (Manim / Qiskit / textbook-grade visuals)
**File:** `mockup.html` (3 frames: gallery · **interactive Bloch sphere** · upgraded interference)

## What changed
- **D12 — quality bar** applied as target look across all 5 templates (Pendulum,
  Interference, Standing waves, Lissajous, Bloch sphere): crisp vector geometry,
  **labeled axes**, **LaTeX labels** (KaTeX), refined theme-tinted palette,
  smoother motion, legends/readouts. Gallery upgraded with **per-sim live preview
  thumbnails** + category tags.
- **Bloch sphere (specifically called out) — genuinely interactive in the mockup:**
  - **Dotted trajectory arcs**: the precession path is drawn as dots; the portion
    traced so far is brighter accent, the rest faint; front/back hemispheres are
    depth-shaded (front solid, back dashed) for a true Qiskit-doc 3D read.
  - **Live coordinate readout** updating as you **drag TIME** (Ω = ω·t), **drag β**
    (drive-axis tilt), press **▶**, or tap a **gate preset (X / H / T / |0⟩)**:
    **θ, φ, ⟨σx⟩, ⟨σy⟩, ⟨σz⟩** and the amplitudes **|ψ⟩ = cos(θ/2)|0⟩ +
    e^{iφ}sin(θ/2)|1⟩**. Math is correct (Rodrigues precession about a tilted axis;
    ⟨σᵢ⟩ = Bloch components; θ=arccos z, φ=atan2(y,x)).
- **Interference (upgraded sample)** demonstrating the Manim/Qiskit look on a second
  sim: labeled axes (I(x) vs detector x), LaTeX formula
  `I(x) ∝ cos²(πd x/λL), Δ = d sinθ`, live 2-source field (animated) over the
  intensity fringe plot, with **λ** and **d** sliders that reshape the pattern.

## Elements touched (→ `02` Visualizer table)
Gallery rows (→ richer cards w/ preview thumbnails; same open action + 5 templates);
Template view (→ labeled axes / LaTeX / readouts; Bloch trajectory + live readout).

## Recommended default
- Ship the **Bloch sphere interaction model shown here** (time scrubber + β +
  gate presets + live readout) as the reference. Interference as the template-CSS
  styling reference for the other sims.

## Choices left for owner
- **Bloch drive model**: shown as Larmor precession about a tilt-β axis with X/H/T
  presets. Alt: expose an explicit gate sequence builder (append X, H, T, …). Flagged;
  default is the precession + presets model.
- **3D engine**: SVG here is enough for the target look. For production Manim-grade
  motion the dev may use Three.js/`expo-three` (per D12) — this mockup is the visual
  spec, not the final renderer.

## Backend / behavioral notes
- Sim controls + rendering live in each template’s **HTML/CSS** (`BASE_CSS` in
  `data/vizTemplates.js`), inside the `VizView` WebView/iframe — the dev pass
  reworks the templates there (RN is only the host). No backend needed; fully offline.
- Claude (Module 7) can emit a viz JSON spec that this renderer consumes (future).
