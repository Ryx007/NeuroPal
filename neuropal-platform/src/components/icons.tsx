// Small inline icons. Always decorative: the control they sit in carries the
// accessible name.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const stroke: IconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

export function ArrowRight(props: IconProps) {
  return (
    <svg className="np-icon" {...stroke} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowUpRight(props: IconProps) {
  return (
    <svg className="np-icon" {...stroke} {...props}>
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

export function Undo(props: IconProps) {
  return (
    <svg className="np-icon" {...stroke} {...props}>
      <path d="M9 7H4v5" />
      <path d="M4.5 12A8 8 0 1 0 7 6.2L4 9" />
    </svg>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <svg className="np-icon" {...stroke} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function Check(props: IconProps) {
  return (
    <svg className="np-icon" {...stroke} strokeWidth={2.8} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function Play(props: IconProps) {
  return (
    <svg className="np-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable={false} {...props}>
      <path d="M7 5v14l12-7z" />
    </svg>
  );
}

export function Pause(props: IconProps) {
  return (
    <svg className="np-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable={false} {...props}>
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  );
}

export function Reset(props: IconProps) {
  return (
    <svg className="np-icon" {...stroke} {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
