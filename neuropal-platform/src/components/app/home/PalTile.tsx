"use client";
// Pal's note on Home: one line in Pal's talk style, mirroring the check-in
// (no jokes in red). The line opens Pal.
import Link from "next/link";
import { useId } from "react";
import type { PalLook, PalMood, TileSize } from "@/lib/neuropal/look";
import { ROUTES } from "../common/appNav";
import { ChevronRightIcon } from "../common/icons";
import { PalAvatar } from "../common/PalAvatar";
import styles from "./home.module.css";

export function PalTile({ size, pal, mood, line }: { size: TileSize; pal: PalLook; mood: PalMood; line: string }) {
  const id = useId();
  const small = size === "S";
  return (
    <section className={`np-panel ${styles.tile} ${styles.palTile}`} aria-labelledby={`${id}-title`} data-size={size}>
      <h2 id={`${id}-title`} className="np-sr-only">
        {pal.name}’s note
      </h2>
      <Link href={ROUTES.pal} className={styles.palLink}>
        <PalAvatar pal={pal} size={small ? 52 : 84} mood={mood} />
        <span className={styles.palSays}>
          <b>{pal.name}: </b>
          {line}
        </span>
        <ChevronRightIcon />
      </Link>
      {!small ? (
        <Link href={`${ROUTES.settings}#pal`} className={styles.palEdit}>
          Change {pal.name}’s name and voice
        </Link>
      ) : null}
    </section>
  );
}
