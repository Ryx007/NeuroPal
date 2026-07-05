import type {
  Anchor,
  ChatMessage,
  MvdTask,
  NpDocument,
} from "@/models/types";

/**
 * Seed content used until the Supabase backend is wired up.
 * Mirrors the two-paper mix from the web prototype and Flutter branch:
 * one neuroscience, one physics.
 */

const neuroPaper: NpDocument = {
  id: "doc-neuro-01",
  title: "Neuroplasticity and the Architecture of Attention",
  subtitle: "Hale, M. et al. — Journal of Cognitive Neuroscience, 2024",
  type: "pdf",
  progress: 0.45,
  pageCount: 24,
  lastOpened: new Date(2026, 3, 17, 14, 22),
  sections: [
    {
      id: "neuro-intro",
      heading: "Introduction",
      paragraphs: [
        "Modern cognitive science has long suggested that our attention is not a single, monolithic resource. Instead, it is a complex orchestra of neurological pathways firing in synchrony. For the neurodivergent brain, this orchestra often plays at a different tempo, finding patterns in what others might perceive as noise.",
        "When we engage in deep focus, the prefrontal cortex mediates the filter between sensory input and executive function. However, traditional reading environments — cluttered with visual distractions and rigid formatting — can lead to cognitive fatigue. By stripping away these barriers, we allow the mind to enter a state of 'The Digital Cocoon.'",
      ],
    },
    {
      id: "neuro-methods",
      heading: "Auditory Synchronisation",
      paragraphs: [
        "Research indicates that auditory synchronisation significantly enhances retention. As the words are highlighted in real time, the visual and auditory processing centers of the brain align, reducing the cognitive load required to decode phonemes. This synergy is particularly effective for individuals with dyslexia or ADHD, providing a tactile sense of progress through the digital text.",
        "In our cohort of 142 adult participants, the combined read-and-listen condition outperformed silent reading on 24-hour recall by 18.4 percentage points (p < 0.001), with the largest effects observed in self-reported ADHD participants.",
      ],
    },
    {
      id: "neuro-discussion",
      heading: "Discussion",
      paragraphs: [
        "The goal of inclusive design is not to simplify the content, but to clarify the path to it. A reading environment that removes sensory hostility without dumbing down the material lets the neurodivergent reader meet the text on their own terms.",
      ],
    },
  ],
};

const physicsPaper: NpDocument = {
  id: "doc-phys-01",
  title: "Emergent Gauge Fields in Frustrated Magnets",
  subtitle: "Mukherjee, R. et al. — Physical Review B, 2025",
  type: "pdf",
  progress: 0.12,
  pageCount: 38,
  lastOpened: new Date(2026, 3, 15, 9, 3),
  sections: [
    {
      id: "phys-intro",
      heading: "Introduction",
      paragraphs: [
        "In geometrically frustrated magnets, the competition between exchange interactions prevents the system from settling into a conventional ordered ground state. This residual entropy at low temperatures is the hallmark of a spin-liquid regime.",
        "Recent theoretical work suggests that the low-energy effective description of such systems can be cast as a lattice gauge theory, with emergent photon-like excitations playing the role of gauge bosons.",
      ],
    },
  ],
};

export const MockDocuments: NpDocument[] = [
  neuroPaper,
  physicsPaper,
  {
    id: "doc-book-01",
    title: "The Body Keeps the Score",
    subtitle: "Bessel van der Kolk",
    type: "epub",
    progress: 0.32,
    pageCount: 464,
    lastOpened: new Date(2026, 3, 12, 21, 45),
  },
  {
    id: "doc-neuro-02",
    title: "Time Perception in ADHD: A Meta-Analysis",
    subtitle: "Nikolaus, S. et al. — Neuroscience & Biobehavioral Reviews, 2023",
    type: "pdf",
    progress: 0.0,
    pageCount: 19,
  },
];

export const MockMvd = (): MvdTask[] => [
  { id: "mvd-1", title: "Stay hydrated", subtitle: "2 glasses left", done: false },
  { id: "mvd-2", title: "Take meds", subtitle: "Morning dosage", done: false },
  { id: "mvd-3", title: "Walk", subtitle: "10 minutes outside", done: false },
];

export const MockAnchors: Anchor[] = [
  {
    id: "a-1",
    title: "Morning meds",
    subtitle: "Blue, with water",
    time: { hour: 8, minute: 0 },
    status: "done",
    icon: "medication",
  },
  {
    id: "a-2",
    title: "Focus block",
    subtitle: "Neuroscience paper",
    time: { hour: 10, minute: 30 },
    status: "done",
    icon: "psychology",
  },
  {
    id: "a-3",
    title: "Lunch",
    subtitle: "Leave the desk",
    time: { hour: 13, minute: 0 },
    status: "current",
    icon: "restaurant",
  },
  {
    id: "a-4",
    title: "Walk + sunlight",
    subtitle: "10 minutes outside",
    time: { hour: 16, minute: 0 },
    status: "pending",
    icon: "directions-walk",
  },
  {
    id: "a-5",
    title: "Wind-down",
    subtitle: "Phone on greyscale",
    time: { hour: 21, minute: 30 },
    status: "pending",
    icon: "bedtime",
  },
];

export const MockSeedChat: ChatMessage[] = [
  {
    id: "c-1",
    paragraphId: "neuro-methods-0",
    question: "What do they mean by auditory synchronisation?",
    answer:
      "The paper is describing simultaneous read + listen playback: the word currently being spoken is highlighted on screen. It lets the visual and auditory cortices process the same token together instead of in sequence, which the authors argue is why the retention gain is so large (+18.4 pp at 24h).",
    citations: ["§2 para 1", "§2 para 2"],
    at: new Date(2026, 3, 17, 14, 31),
  },
];
