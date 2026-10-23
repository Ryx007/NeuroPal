// Copy for the landing page. Plain, warm, precise; every research claim is a
// paraphrase of the linked source's own abstract or summary.

export const PRINCIPLES = [
  {
    title: "Science-first",
    body: "Every design choice and every lesson claim points to its source. Where the evidence is small or mixed, we say so.",
  },
  {
    title: "No ads",
    body: "None, ever. Your attention is not for sale.",
  },
  {
    title: "No data selling",
    body: "Your documents, notes and check-ins are yours. They are never sold or shared.",
  },
  {
    title: "No streaks",
    body: "Missing a day costs you nothing. No points, no chains to keep, no guilt.",
  },
  {
    title: "Accessible: WCAG 2.1 AA",
    body: "A floor, not a goal: screen readers, full keyboard use, contrast you can tune, and reduced motion honoured.",
  },
  {
    title: "Your data never trains models",
    body: "Not ours, not anyone else’s. That rule decides which AI providers NeuroPal may use.",
  },
];

export type ResearchStatus = "On this site" | "In the app" | "On this site and in the app" | "Everywhere" | "Planned";

export interface ResearchItem {
  title: string;
  finding: string;
  use: string;
  status: ResearchStatus;
  sources: { cite: string; url: string }[];
}

export const RESEARCH: ResearchItem[] = [
  {
    title: "Presets before fine-tuning",
    finding: "Choice overload grows with the complexity of the choice in front of you.",
    use: "Make it yours opens on five ready-made vibes. The eight detailed settings wait one tap away.",
    status: "On this site and in the app",
    sources: [
      {
        cite: "Chernev, Böckenholt & Goodman (2015), Journal of Consumer Psychology",
        url: "https://www.kellogg.northwestern.edu/academics-research/research/detail/2015/when-product-assortment-leads-to-choice-overload-a-conceptual/",
      },
    ],
  },
  {
    title: "Change things by asking, with preview and undo",
    finding:
      "Customising software by conversation opens up a lot, but it brings risks such as wrong behaviour and hidden content, which people handled by keeping an eye on every change.",
    use: "Describe a change in your own words. Pal shows a preview and the exact list of changes; nothing applies until you choose Apply, and Undo takes it back.",
    status: "On this site and in the app",
    sources: [{ cite: "Sreedhar, Kaul & Chilton (2026), arXiv", url: "https://arxiv.org/abs/2605.11149" }],
  },
  {
    title: "Build your own companion",
    finding:
      "Customising an avatar made people identify with it more, kept them more engaged with a mental-health training task, and made that training work better.",
    use: "You build Pal yourself: shape, colour, face, voice and the way it talks.",
    status: "In the app",
    sources: [{ cite: "Birk & Mandryk (2019), Journal of Medical Internet Research", url: "https://jmir.org/2019/1/e10133/" }],
  },
  {
    title: "No streaks",
    finding: "When a streak is broken, people engage less afterwards than when it is intact.",
    use: "There are no streaks, points or chains to break, anywhere. A minimum day still counts.",
    status: "Everywhere",
    sources: [
      {
        cite: "Silverman & Barasch (2023), Journal of Consumer Research",
        url: "https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions",
      },
    ],
  },
  {
    title: "Animation stays out of learning content",
    finding: "Interesting but irrelevant extras in a lesson, known as seductive details, reduce learning.",
    use: "Motion lives in the frame of a page, never in the text you read or the lesson you study. Lesson simulations move only when you press Play.",
    status: "On this site and in the app",
    sources: [
      {
        cite: "Sundararajan & Adesope (2020), Educational Psychology Review",
        url: "https://news.wsu.edu/2020/03/19/seductive-details-inhibit-learning/",
      },
    ],
  },
  {
    title: "Hints before answers",
    finding:
      "Students who practised with an AI that handed out answers did worse once it was taken away, while a tutor version that gave hints largely avoided the harm. A physics AI tutor built on good teaching practice helped students learn more, in less time, than an active-learning class.",
    use: "Lessons ask you to try first, then offer a hint, and show the answer only when you ask for it.",
    status: "On this site",
    sources: [
      {
        cite: "Bastani et al. (2025), PNAS, summarised by Knowledge at Wharton",
        url: "https://knowledge.wharton.upenn.edu/article/without-guardrails-generative-ai-can-harm-education/",
      },
      { cite: "Kestin et al. (2025), Scientific Reports", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/" },
    ],
  },
  {
    title: "Teach through interests",
    finding:
      "Across 20 studies, building lessons around autistic children’s strong interests improved learning, social engagement or both, with very few negative effects.",
    use: "Every lesson can explain itself through music, video games, cooking and more.",
    status: "On this site",
    sources: [
      { cite: "Gunn & Delafield-Butt (2016), Review of Educational Research", url: "https://strathprints.strath.ac.uk/54357/" },
    ],
  },
  {
    title: "Focus alongside people",
    finding:
      "In a small virtual-reality study, adults with ADHD finished a task faster, and felt more accurate and focused, with a human or AI body double beside them. Separately, heavier daily chatbot use went with more loneliness and less time with people.",
    use: "Focus sessions will let you work alongside people or Pal, and Pal is designed to nudge you toward people, not replace them.",
    status: "Planned",
    sources: [
      { cite: "Ara et al. (2025), arXiv", url: "https://arxiv.org/abs/2509.12153" },
      { cite: "Fang et al. (2025), arXiv", url: "https://arxiv.org/abs/2503.17473" },
    ],
  },
  {
    title: "Background noise: a little help with ADHD traits, not without",
    finding:
      "In children and teenagers, white or pink noise gave a small benefit to those with ADHD or attention problems, and a small cost to those without.",
    use: "Focus sound will be opt-in, and every sound mode will show its evidence grade.",
    status: "Planned",
    sources: [
      {
        cite: "Nigg et al. (2024), Journal of the American Academy of Child & Adolescent Psychiatry",
        url: "https://ohsu.elsevierpure.com/en/publications/systematic-review-and-meta-analysis-do-white-noise-or-pink-noise-",
      },
    ],
  },
];
