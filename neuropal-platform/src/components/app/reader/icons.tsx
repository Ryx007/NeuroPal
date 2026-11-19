// Reader, Library and Ask icons (24 × 24 stroke, like the shell's set).
// Always decorative: the control they sit in carries the accessible name.
import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Icon({ children, strokeWidth = 2, ...props }: P & { children: ReactNode }) {
  return (
    <svg
      className="np-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
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

export const PlayGlyph = (p: P) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5Z" />
  </Icon>
);

export const PauseGlyph = (p: P) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4.2" height="14" rx="1" />
    <rect x="13.8" y="5" width="4.2" height="14" rx="1" />
  </Icon>
);

/** Previous sentence: a bar and a back triangle. */
export const SentenceBackIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 6v12" />
    <path d="M18 6.5 9.5 12l8.5 5.5Z" />
  </Icon>
);

export const SentenceNextIcon = (p: P) => (
  <Icon {...p}>
    <path d="M18 6v12" />
    <path d="M6 6.5 14.5 12 6 17.5Z" />
  </Icon>
);

/** Previous paragraph: a pilcrow-like block with an arrow. */
export const ParagraphBackIcon = (p: P) => (
  <Icon {...p}>
    <path d="M11 6 5 12l6 6" />
    <path d="M19 6 13 12l6 6" />
  </Icon>
);

export const ParagraphNextIcon = (p: P) => (
  <Icon {...p}>
    <path d="m13 6 6 6-6 6" />
    <path d="m5 6 6 6-6 6" />
  </Icon>
);

export const ListIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth={3} />
  </Icon>
);

export const TextSizeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 19 8.5 5h1L15 19" />
    <path d="M5.2 14h7.6" />
    <path d="M15.5 19 18.5 11.5h.5L22 19" />
    <path d="M16.6 16.4h4.8" />
  </Icon>
);

export const PagesIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="3.5" width="12" height="15.5" rx="1.5" />
    <path d="M8 21h10.5a1.5 1.5 0 0 0 1.5-1.5V8" />
    <path d="M7.5 8h5M7.5 11.5h5M7.5 15h3" />
  </Icon>
);

export const TextLinesIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 6h16M4 10.5h16M4 15h11M4 19.5h7" />
  </Icon>
);

export const SparkIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5c.4 3.9 2.1 6.1 6 6.5-3.9.4-5.6 2.6-6 6.5-.4-3.9-2.1-6.1-6-6.5 3.9-.4 5.6-2.6 6-6.5Z" />
    <path d="M19 15.5c.2 1.7.9 2.5 2.5 2.7-1.6.2-2.3 1-2.5 2.7-.2-1.7-.9-2.5-2.5-2.7 1.6-.2 2.3-1 2.5-2.7Z" />
  </Icon>
);

export const SlidersIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Icon>
);

export const LocateIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </Icon>
);

export const CopyIcon = (p: P) => (
  <Icon {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Icon>
);

export const UploadIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 15.5V4.5" />
    <path d="m7.5 9 4.5-4.5L16.5 9" />
    <path d="M4.5 15v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
  </Icon>
);

export const SearchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5 5" />
  </Icon>
);

export const MoreIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.2} />
  </Icon>
);

export const MinusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);

export const DocIcon = (p: P) => (
  <Icon {...p}>
    <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" />
    <path d="M14 3.5V8h4.5" />
  </Icon>
);

export const WarnIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 4 2.8 19.5h18.4L12 4Z" />
    <path d="M12 10v4.5M12 17h.01" />
  </Icon>
);

export const ChevronLeftIcon = (p: P) => (
  <Icon {...p}>
    <path d="m14.5 6-6 6 6 6" />
  </Icon>
);

export const ChevronRightSmallIcon = (p: P) => (
  <Icon {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);
