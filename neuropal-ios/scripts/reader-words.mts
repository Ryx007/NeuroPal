// Generates neuropal-ios/Packages/NeuroPalCore/Tests/NPCoreTests/Fixtures/reader-words.json (run scripts/make-reader-words.sh)
// from the web reader (neuropal-platform/src/lib/neuropal/reader/sections.ts +
// math.ts) and the Expo app's tokenizer (neuropal-expo-app/src/utils/math.js).
//   It runs on copies of the two sources (see the script), so the numbers come from the real JavaScript.
import { buildReaderModel } from "./src/sections.ts";
import { tokenizeMathParagraph as webTokens } from "./src/math.ts";
import { tokenizeMathParagraph as expoTokens } from "./src/expo-math.mjs";

type Tok = { kind: "word" | "math" | "equation"; text: string };

const tokOf = (t: { display: string; latex: string | null }): Tok =>
  t.latex !== null ? { kind: "math", text: t.latex } : { kind: "word", text: t.display };

// ---- paragraphs: the tokenizer alone (Expo's, checked against the web's) ----
const paragraphs = [
  "The two-photon state ($\\rho_{AB}$), the $x$-axis and $G^{(2)}(\\tau)$; the rate $R = \\eta^2 N$ is fixed.",
  "With $|\\psi\\rangle = (|HV\\rangle + |VH\\rangle)/\\sqrt{2}$, the coincidence rate is $C(\\tau)\\propto 1 - V e^{-\\tau^2/\\tau_c^2}$.",
  "Prices like $5 and $10 are not maths, and neither is US$ alone.",
  "p$$q$ and $$a$$ text, then $$ $$ and \\$x$ escaped.",
  "A display $$\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$$ inside prose, (see Eq. $(3)$).",
  "Tight: $a$$b$, $x$/$y$, [$\\alpha$], “$\\beta$”, and $\\gamma$-ray, $10^{-3}$-level.",
  "No maths here, just words.",
  "Words  with odd spaces and a　wide one.",
  "$E = mc^2$",
  "$$\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\epsilon_0}$$",
  "Unclosed $x and a lone $ here.",
];
const expoParagraphs = paragraphs.map((text) => {
  const expo = expoTokens(text).map(tokOf);
  const web = webTokens(text).map(tokOf);
  if (JSON.stringify(expo) !== JSON.stringify(web)) throw new Error(`Expo and web disagree on: ${text}`);
  return { text, tokens: expo };
});

// ---- documents: the whole word stream, as the web reader builds it ----
const prose = (n: number, seed: string) =>
  Array.from({ length: n }, (_, i) => `${seed} sentence ${i + 1} keeps the reader busy with plain words.`).join(" ");
const longMath = Array.from({ length: 90 }, (_, i) => `term ${i} uses $x_{${i}}$ and (${i}),`).join(" ") + " end.";
const salad = Array.from({ length: 200 }, (_, i) => ["∆", "x", "=", "1", "2", "∑", "a", "b"][i % 8]).join(" ");
const mathPara = paragraphs.slice(0, 6);

const documents: { name: string; title: string; text: string; toc: any[]; pageMap: any[]; pageCount: number | null }[] = [
  {
    name: "toc-with-maths",
    title: "Correlation plenoptic imaging",
    text: [
      "Correlation plenoptic imaging",
      "Abstract. " + prose(2, "Abstract"),
      "1 Introduction",
      ...mathPara,
      "〈∆X 2 a 〉= 1 2 e −2r ≈ ∑ n ∂ ψ",
      "$$\\Gamma(\\rho_1, \\rho_2) = \\langle \\Delta I_1 \\Delta I_2 \\rangle$$",
      "\\[ a^2 + b^2 = c^2 \\]",
      "2 Setup",
      prose(3, "Setup"),
      longMath,
      salad,
    ].join("\n\n"),
    toc: [
      { title: "Abstract", order: 0, startParagraph: 1, startPage: 1 },
      { title: "1 Introduction", order: 1, startParagraph: 2, startPage: 1 },
      { title: "2 Setup", order: 2, startParagraph: 12, startPage: 3 },
    ],
    pageMap: [{ page: 1, startParagraph: 0 }, { page: 2, startParagraph: 6 }, { page: 3, startParagraph: 12 }],
    pageCount: 4,
  },
  {
    name: "headings-structured",
    title: "Notes",
    text: [
      "INTRODUCTION",
      ...Array.from({ length: 6 }, (_, i) => prose(1, `Intro ${i}`)),
      "Chapter 2 Methods",
      ...Array.from({ length: 5 }, (_, i) => `Method ${i} with $\\alpha_${i}$, then ($\\beta$).`),
      "3 Results",
      "4 Discussion",
      ...Array.from({ length: 6 }, (_, i) => prose(1, `Result ${i}`)),
      "APPENDIX A",
      "Short appendix line one.",
      "Short appendix line two.",
      "Part 5 Outlook",
      ...Array.from({ length: 5 }, (_, i) => prose(1, `Outlook ${i}`)),
    ].join("\n\n"),
    toc: [],
    pageMap: [],
    pageCount: null,
  },
  {
    name: "headings-unstructured",
    title: "A short note",
    text: ["Preface", prose(2, "One"), "Chapter 1 Only chapter", prose(2, "Two"), "The end."].join("\n\n"),
    toc: [],
    pageMap: [],
    pageCount: null,
  },
  {
    name: "toc-by-pages",
    title: "A book",
    text: Array.from({ length: 30 }, (_, i) => (i % 7 === 0 ? `CHAPTER ${i / 7 + 1}` : prose(1, `Para ${i}`))).join("\n\n"),
    toc: [
      { title: "One", startPage: 1 },
      { title: "Two", startPage: 3 },
      { title: "Three", startPage: 7 },
      { title: "Four", startPage: 9 },
    ],
    pageMap: [],
    pageCount: 10,
  },
  {
    name: "toc-mapped-pages",
    title: "A paper",
    text: Array.from({ length: 12 }, (_, i) => (i === 4 ? "2 METHODS AND MORE" : prose(1, `P${i}`))).join("\n\n"),
    toc: [{ title: "Start", startPage: 1 }, { title: "Methods", startPage: 2 }, { title: "Bad", startParagraph: -1 }],
    pageMap: [{ page: 1, startParagraph: 0 }, { page: 2, startParagraph: 4 }, { page: 3, startParagraph: 8 }],
    pageCount: 3,
  },
  {
    name: "toc-that-doesnt-hold",
    title: "Thin toc",
    text: ["INTRODUCTION", prose(2, "A"), "1 Next", prose(2, "B"), "2 Last", prose(2, "C"), "3 More", prose(2, "D")].join("\n\n"),
    toc: [{ title: "Only", startParagraph: 0 }, { title: "Same", startParagraph: 0 }],
    pageMap: [],
    pageCount: null,
  },
  {
    name: "whitespace",
    title: "Spacing",
    text: "  First line\r\nstill first.\n\n\n\nSecond\tparagraph here.\n \nThird stays\n \njoined.\n\n\n",
    toc: [],
    pageMap: [],
    pageCount: null,
  },
  { name: "empty", title: "Nothing", text: "", toc: [], pageMap: [], pageCount: null },
];

const docs = documents.map((d) => {
  const model = buildReaderModel({ text: d.text, toc: d.toc, pageMap: d.pageMap, pageCount: d.pageCount ?? 0, title: d.title } as any);
  const words: [number, string, string][] = [];
  for (const p of model.paragraphs) {
    if (p.kind === "math" || p.kind === "umath") {
      words.push([p.canonical, "equation", p.latex ?? ""]);
    } else {
      for (const t of webTokens(p.text)) {
        const tok = tokOf(t);
        words.push([p.canonical, tok.kind, tok.text]);
      }
    }
  }
  if (words.length !== model.words.length) throw new Error(`${d.name}: word count mismatch`);
  return { ...d, wordCount: words.length, words };
});

process.stdout.write(
  JSON.stringify(
    {
      generatedFrom:
        "neuropal-platform/src/lib/neuropal/reader/{sections,math}.ts and neuropal-expo-app/src/utils/math.js, by neuropal-ios/scripts/make-reader-words.sh",
      paragraphs: expoParagraphs,
      documents: docs,
    },
    null,
    1,
  ) + "\n",
);
