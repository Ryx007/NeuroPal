// App icons (24 × 24, stroke, currentColor). Always decorative: the control
// they sit in carries the accessible name.
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, strokeWidth = 2, ...props }: IconProps & { children: ReactNode }) {
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

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 11.5 12 5l8 6.5" />
    <path d="M6.5 10v9h11v-9" />
    <path d="M10 19v-5h4v5" />
  </Icon>
);

export const LibraryIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5h5.5a2.5 2.5 0 0 1 2.5 2.5v11a2 2 0 0 0-2-2H4z" />
    <path d="M20 5.5h-5.5A2.5 2.5 0 0 0 12 8v11a2 2 0 0 1 2-2h6z" />
  </Icon>
);

export const PalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5c4.7 0 8 3 8 7.2 0 4.1-3.4 6.8-8 6.8s-8-2.7-8-6.8c0-4.2 3.3-7.2 8-7.2z" />
    <rect x="7.5" y="9.2" width="9" height="3.6" rx="1.8" />
    <path d="M10 15.6c1.2.7 2.8.7 4 0" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 7h9M18 7h1M5 12h3M12 12h7M5 17h7M16 17h3" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="14" cy="17" r="2" />
  </Icon>
);

/** Calming steps: a leaf. */
export const LeafIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 5c-8 0-13 4-13 10 0 1.6.5 2.9 1.2 4" />
    <path d="M19 5c0 8-4.5 13-10.5 13-.9 0-1.6-.1-2.3-.4" />
    <path d="M5 20c2.5-4 5.5-7 9-9" />
  </Icon>
);

export const KeyboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="6.5" width="18" height="11" rx="2" />
    <path d="M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17 10.5h.01M8 14h8" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.4}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.4}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.8}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.4}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12 20 4l-5 16-3.5-6.5z" />
    <path d="M11.5 13.5 20 4" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const CloudOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 18H17a4 4 0 0 0 1.4-7.7A6 6 0 0 0 8 8.2" />
    <path d="M5.6 10.7A4 4 0 0 0 7.5 18" />
    <path d="M3 3l18 18" />
  </Icon>
);

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
    <path d="M20 20v-4h-4" />
  </Icon>
);

export const UndoIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 7H4v5" />
    <path d="M4.5 12A8 8 0 1 0 7 6.2L4 9" />
  </Icon>
);

/** What now? */
export const CompassIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5z" />
  </Icon>
);

/** Break it down */
export const SplitIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20v-6l-6-6M12 14l6-6" />
    <path d="M4 8V4h4M20 8V4h-4" />
  </Icon>
);

/** Brain dump */
export const InboxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 13.5 6.5 6h11l2.5 7.5V18H4z" />
    <path d="M4 13.5h4.5l1 2h5l1-2H20" />
  </Icon>
);

/** Sit with me */
export const SitIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="5.5" r="2" />
    <path d="M6 20c1.5-1.8 3.5-2.7 6-2.7s4.5.9 6 2.7" />
    <path d="M8.5 15.5 9.5 10h5l1 5.5" />
    <path d="M5.5 13.5 9.5 10M18.5 13.5 14.5 10" />
  </Icon>
);

/** Talk */
export const ChatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 6.5h14v9.5H10l-4.5 3.5V16H5z" />
  </Icon>
);

export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z" />
  </Icon>
);

export const VolumeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10v4h4l5 4V6L8 10z" />
    <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
  </Icon>
);

export const PlayIcon = (p: IconProps) => (
  <svg className="np-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...p}>
    <path d="M8 5.5v13l10.5-6.5z" />
  </svg>
);

export const StopIcon = (p: IconProps) => (
  <svg className="np-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
  </svg>
);

export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4.5h11.5v15H6a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 6 4.5z" />
    <path d="M4.5 16.5A1.5 1.5 0 0 1 6 15h11.5" />
    <path d="M8.5 8.5h5" />
  </Icon>
);

export const ListCheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7l1.5 1.5L8 6M4 13l1.5 1.5L8 12" />
    <path d="M11 7.5h9M11 13.5h9M5 18.5h15" />
  </Icon>
);

export const AnchorIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="5.5" r="2" />
    <path d="M12 7.5V20M8 11h8" />
    <path d="M4.5 13.5a7.5 7.5 0 0 0 15 0" />
  </Icon>
);

export const TimerIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 13V9.5M10 3.5h4" />
  </Icon>
);

export const PillIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" />
    <path d="M10 8.2l3.8 7.6" />
  </Icon>
);

export const CupIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
    <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" />
    <path d="M8.5 3.5v2.5M12 3.5v2.5" />
  </Icon>
);

export const WalkIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="M9 21l2.5-6.5L14 17v4" />
    <path d="M11.5 14.5l1-5.5 3 3 2.5 1" />
    <path d="M12.5 9l-3 1.5L8 13.5" />
  </Icon>
);

export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 21V4M6 4.5h11l-2.5 4 2.5 4H6" />
  </Icon>
);

export const LogOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 5H5v14h5" />
    <path d="M14 8l4 4-4 4M18 12H9" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" />
  </Icon>
);
