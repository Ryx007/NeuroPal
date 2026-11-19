// Study icons (24 × 24 stroke, like the reader's set). Always decorative:
// the control they sit in carries the accessible name.
import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: P & { children: ReactNode }) {
  return (
    <svg
      className="np-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** A mortarboard: the study tools. */
export const StudyIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5Z" />
    <path d="M6.5 11.5v4.2c0 1.3 2.5 2.8 5.5 2.8s5.5-1.5 5.5-2.8v-4.2" />
    <path d="M21.5 9.5v5" />
  </Icon>
);

/** A heading and lines: the summary. */
export const SummaryIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 5.5h10" strokeWidth={2.6} />
    <path d="M4 10.5h16M4 14.5h16M4 18.5h10" />
  </Icon>
);

/** A question in a speech bubble: the quiz. */
export const QuizIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 16h-7l-4 3.5V16H6a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
    <path d="M10 8.3a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.3" />
    <path d="M12 13.4h.01" strokeWidth={2.6} />
  </Icon>
);

/** One dense page: the cheat sheet. */
export const CheatSheetIcon = (p: P) => (
  <Icon {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
    <path d="M8 7.5h3M8 10.5h8M8 13.5h8M8 16.5h5" />
    <path d="M14 7.5h2" />
  </Icon>
);

/** Two stacked cards: flashcards. */
export const CardsIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="7" width="13" height="13" rx="1.8" />
    <path d="M7.5 7V5.5A1.5 1.5 0 0 1 9 4h10a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 17h-2.5" />
    <path d="M10 11.5v4M8 13.5h4" />
  </Icon>
);

/** A lit spark over a line of text: explain a passage. */
export const ExplainIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 3.5c.3 2.6 1.4 3.7 4 4-2.6.3-3.7 1.4-4 4-.3-2.6-1.4-3.7-4-4 2.6-.3 3.7-1.4 4-4Z" />
    <path d="M4 16h16M4 20h10" />
    <path d="M17.5 5v4M15.5 7h4" />
  </Icon>
);

/** Shuffle: two crossing arrows. */
export const ShuffleIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h3.5c2.2 0 3.4 1.2 4.5 3.2l1 1.6c1.1 2 2.3 3.2 4.5 3.2H20" />
    <path d="M4 17h3.5c1.4 0 2.4-.5 3.2-1.3M13.3 8.3c.8-.8 1.8-1.3 3.2-1.3H20" />
    <path d="m17.5 4.5 2.5 2.5-2.5 2.5M17.5 14.5l2.5 2.5-2.5 2.5" />
  </Icon>
);
