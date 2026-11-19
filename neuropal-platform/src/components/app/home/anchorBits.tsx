// Shared bits for anchors: the kind's icon and plain words for "when".
import type { Anchor, AnchorCategory } from "@/lib/neuropal/day";
import { BookIcon, CupIcon, FlagIcon, PillIcon, WalkIcon } from "../common/icons";

export function CategoryIcon({ category }: { category: AnchorCategory }) {
  switch (category) {
    case "medication":
      return <PillIcon />;
    case "break":
      return <CupIcon />;
    case "study":
      return <BookIcon />;
    case "move":
      return <WalkIcon />;
    default:
      return <FlagIcon />;
  }
}

/** The big countdown ("25" MIN, "3" H, "NOW") and the same in words. */
export function countdown(mins: number): { big: string; unit: string; words: string } {
  if (mins <= 0) return { big: "NOW", unit: "", words: "happening now" };
  if (mins < 100) return { big: String(mins), unit: "MIN", words: `in ${mins} ${mins === 1 ? "minute" : "minutes"}` };
  const h = Math.round(mins / 60);
  return { big: String(h), unit: "H", words: `in about ${h} ${h === 1 ? "hour" : "hours"}` };
}

/** "± 30 min" / "Exact time" */
export function windowLabel(a: Pick<Anchor, "flexMinutes">): string {
  if (!a.flexMinutes) return "exact time";
  return a.flexMinutes >= 60 && a.flexMinutes % 60 === 0 ? `± ${a.flexMinutes / 60} h` : `± ${a.flexMinutes} min`;
}
