// ─── Data: papers, library items, citations, user ────────────────────

export const NEURO_PAPER = {
  id: 'neuro-1',
  kind: 'PREPRINT',
  journal: 'Nature Reviews Neuroscience',
  year: 2024,
  minutes: 12,
  title: 'Neuroplasticity and the Architecture of Attention',
  authors: ['Okafor, A.', 'Lindqvist, M.', 'Chen, R.'],
  doi: '10.1038/nrn-2024-0417',
  sections: [
    {
      id: 's1', heading: 'Introduction',
      paragraphs: [
        { id: 'p1', text: 'Modern cognitive science has long suggested that attention is not a single, monolithic resource. Instead, it is an orchestra of neurological pathways firing in rough synchrony — each contributing a specific harmonic to what we experience as focus. For the neurodivergent brain this orchestra often plays at a different tempo, finding patterns in what others perceive as noise.' },
        { id: 'p2', text: 'We situate this review inside three decades of work on selective attention, beginning with the spotlight models of Posner and the biased-competition framework of Desimone. The central question remains practical: how do we design environments that cooperate with the attentional system we actually have, rather than the one we wish we had?' },
      ],
    },
    {
      id: 's2', heading: 'Prefrontal Mediation and Filtering',
      paragraphs: [
        { id: 'p3', text: 'When we engage in deep focus, the prefrontal cortex mediates the filter between sensory input and executive function. Traditional reading environments — cluttered with visual distractions, inconsistent formatting and interruption budgets that assume neurotypical defaults — can lead to cognitive fatigue within minutes. By stripping away these barriers, we allow the mind to enter what Csikszentmihalyi would have called flow, and what recent work from the Broadbent lab terms the digital cocoon.' },
        { id: 'p4', text: 'This is not a license to oversimplify. Removing signal removes meaning. The goal is to remove noise while preserving the semantic density of the text; to reduce the cost of re-entry after inevitable attentional drift.' },
      ],
    },
    {
      id: 's3', heading: 'Auditory Synchronisation and Retention',
      paragraphs: [
        { id: 'p5', text: 'Research indicates that auditory synchronisation significantly enhances retention. As words are highlighted in real time, the visual and auditory processing centres of the brain align, reducing the cognitive load required to decode phonemes. This synergy is particularly effective for individuals with dyslexia or ADHD, providing a tactile sense of progress through the digital text.' },
        { id: 'p6', text: 'Controlled studies with 312 participants across three universities reported a 34% increase in recall at 48 hours when text-to-speech was paired with word-level visual anchoring, compared with silent reading alone. Improvements were most pronounced in participants self-identifying as dyslexic (Δ = 48%).' },
      ],
    },
    {
      id: 's4', heading: 'Designing for Re-Entry',
      paragraphs: [
        { id: 'p7', text: 'Attentional drift is not a failure state; it is a feature of the system. Neurodivergent attention is frequently non-stationary — governed by interest gradients rather than clock-time. The most humane reading environments therefore minimise the cost of coming back: a persistent position marker, a predictable chrome, and a listening mode that never loses its place.' },
        { id: 'p8', text: 'We close with a pull-quote that has guided our lab for the last ten years, and which we encourage every product designer working in this space to internalise.' },
      ],
      pullquote: 'The goal of inclusive design is not to simplify the content, but to clarify the path to it.',
    },
  ],
};

export const PHYSICS_PAPER = {
  id: 'phys-1',
  kind: 'PREPRINT',
  journal: 'arXiv:cond-mat/2409.11204',
  year: 2024,
  minutes: 22,
  title: 'Emergent U(1) Gauge Fields in a Frustrated Kagome Antiferromagnet',
  authors: ['Álvarez-Castillo, P.', 'Nakamura, S.', 'Whitfield, J.'],
  doi: 'arXiv:2409.11204',
  sections: [
    {
      id: 's1', heading: 'Abstract',
      paragraphs: [
        { id: 'p1', text: 'We report signatures of an emergent compact U(1) gauge field in a spin-½ kagome antiferromagnet at fields 0.3 ≤ h/J ≤ 0.7, extracted from inelastic neutron scattering on polycrystalline samples of Cu₃V₂O₇(OH)₂·2H₂O. The low-energy response is consistent with a photon-like mode with linear dispersion ω = v|k|, v ≈ 4.1(2) meV·Å, and a broad two-spinon continuum above the gauge excitation band.' },
      ],
    },
    {
      id: 's2', heading: 'Model and Numerics',
      paragraphs: [
        { id: 'p2', text: 'The minimal Hamiltonian retains nearest-neighbour Heisenberg exchange on the kagome lattice, a modest Dzyaloshinskii–Moriya coupling D/J ≈ 0.08 consistent with structural chirality, and a Zeeman term. DMRG on 4×12 cylinders with bond dimension χ = 4000 reproduces the measured static structure factor to within 6%.' },
        { id: 'p3', text: 'A variational Monte Carlo analysis of Gutzwiller-projected Dirac spin liquid states yields a competitive energy, suggesting that the proximity of several spin-liquid orders governs the observed finite-temperature crossovers.' },
      ],
    },
    {
      id: 's3', heading: 'Experimental Signatures',
      paragraphs: [
        { id: 'p4', text: 'At T = 50 mK we observe a V-shaped continuum centred at the Γ point, with spectral weight scaling as ω¹·⁰⁸⁽⁴⁾ — the hallmark of a gapless linearly-dispersing mode. The low-energy intensity collapses onto a single scaling curve I(ω, T) = T^α · f(ω/T), with α = 1.9(1), consistent with a CFT exponent for an emergent photon.' },
        { id: 'p5', text: 'Crucially, the continuum is robust against 3% non-magnetic substitution, ruling out trivial magnon explanations and reinforcing the deconfined picture. We discuss remaining tensions with the specific-heat data in §4.' },
      ],
    },
  ],
};

export const PAPERS = { 'neuro-1': NEURO_PAPER, 'phys-1': PHYSICS_PAPER };

export const NEURO_NOTES = [
  { anchorPara: 'p3', q: "What does 'the digital cocoon' refer to?", a: "A minimal-stimuli reading environment — no sidebars, ads or formatting noise — that lets the prefrontal filter stop fighting the UI and start processing the text. The term originates with the Broadbent lab (2019).", cite: '§2 ¶1 · Broadbent et al., 2019' },
  { anchorPara: 'p5', q: 'How strong is the retention effect?', a: 'In the 312-participant study, TTS + word-level highlighting produced +34% recall at 48h vs silent reading. Dyslexic participants saw +48%.', cite: '§3 ¶2 · Okafor 2024, Table 1' },
  { anchorPara: 'p7', q: 'Why is attention framed as non-stationary?', a: "Because neurodivergent focus tends to follow interest gradients rather than the clock. Designing for re-entry (persistent markers, predictable chrome) is more humane than penalising drift.", cite: '§4 ¶1' },
];

export const PHYSICS_NOTES = [
  { anchorPara: 'p1', q: "What's a compact U(1) gauge field in plain terms?", a: "An emergent photon-like excitation: a collective mode of the spins that behaves mathematically like electromagnetism, even though no real photons are involved. The signature is a linear, gapless dispersion.", cite: '§1 Abstract' },
  { anchorPara: 'p4', q: 'Why does intensity scaling matter?', a: "I(ω,T) = T^α · f(ω/T) is a conformal-field-theory fingerprint. An exponent α ≈ 2 is consistent with an emergent photon CFT, ruling out ordinary magnon descriptions.", cite: '§3 ¶1' },
];

export const LIBRARY_ITEMS = [
  { id: 'neuro-1', title: 'Neuroplasticity and the Architecture of Attention', authors: 'Okafor, Lindqvist & Chen · 2024', kind: 'Neuroscience', progress: 0.45, minutes: 12, color: 'primary' },
  { id: 'phys-1', title: 'Emergent U(1) Gauge Fields in a Frustrated Kagome Antiferromagnet', authors: 'Álvarez-Castillo, Nakamura & Whitfield · 2024', kind: 'Physics · arXiv', progress: 0.12, minutes: 22, color: 'info' },
  { id: 'body-score', title: 'The Body Keeps the Score', authors: 'Bessel van der Kolk · 2014', kind: 'Book', progress: 0.63, minutes: 540, color: 'secondary' },
  { id: 'defaultmode', title: 'Default Mode Network and Rumination in PTSD', authors: 'Hassan & Pereira · 2023', kind: 'Neuroscience', progress: 0.0, minutes: 18, color: 'primary' },
];

export const CITATION_GRAPH = {
  center: { id: 'neuro-1', label: 'This paper', x: 50, y: 50 },
  nodes: [
    { id: 'n1', label: 'Posner 1980', cat: 'foundation', x: 20, y: 22 },
    { id: 'n2', label: 'Desimone 1995', cat: 'foundation', x: 78, y: 20 },
    { id: 'n3', label: 'Broadbent 2019', cat: 'direct', x: 14, y: 58 },
    { id: 'n4', label: 'Okafor 2022', cat: 'self', x: 82, y: 62 },
    { id: 'n5', label: 'Lindqvist 2021', cat: 'self', x: 30, y: 82 },
    { id: 'n6', label: 'phys-1 · Kagome', cat: 'cross', x: 70, y: 86 },
    { id: 'n7', label: 'Csikszentmihalyi', cat: 'foundation', x: 52, y: 14 },
  ],
};
