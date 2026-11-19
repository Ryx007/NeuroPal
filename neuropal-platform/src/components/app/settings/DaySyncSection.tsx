"use client";
// "Your day" in Settings: "Keep my day in sync" (on by default) and the one
// status line under it — the only place a day-sync problem is ever shown
// (docs/DAY-SYNC.md §8). The line isn't a live region: a background sync
// every few minutes must not talk over whatever the person is doing. The
// switch describes itself with it, and switching says what it did.
import { useId } from "react";
import { useAppearance } from "@/components/AppearanceProvider";
import { dayStore } from "@/lib/neuropal/day";
import { syncStatus, type SyncTone } from "@/lib/neuropal/dayModel";
import { setDaySyncEnabled, useDaySyncBusy } from "@/lib/neuropal/daySync";
import { useStored } from "@/lib/store";
import { announce } from "../common/announce";
import { Switch } from "../common/bits";
import { CheckIcon, ClockIcon, CloudOffIcon, RefreshIcon } from "../common/icons";
import { useNow } from "../common/useNow";
import styles from "./settings.module.css";

// Decorative: the words say it all (never the icon or a colour alone).
function toneIcon(tone: SyncTone) {
  if (tone === "ok") return <CheckIcon />;
  if (tone === "busy") return <RefreshIcon />;
  if (tone === "problem") return <CloudOffIcon />;
  if (tone === "none") return <ClockIcon />;
  return null;
}

export function DaySyncSection() {
  const id = useId();
  const day = useStored(dayStore);
  const busy = useDaySyncBusy();
  const nowMs = useNow(30_000);
  const { appearance } = useAppearance();
  const { enabled, last, syncedAt } = day.sync;
  const status = syncStatus({ enabled, syncing: busy, last, syncedAt, now: new Date(nowMs), clock24: appearance.skin === "signal" });
  const icon = toneIcon(status.tone);

  return (
    <div className={styles.sectionBody}>
      <div className={styles.switchRow}>
        <div>
          <p id={`${id}-sync`} className={styles.switchLabel}>
            Keep my day in sync
          </p>
          <p id={`${id}-sync-help`} className="np-help">
            Check-ins, anchors, the minimum viable day and the brain dump are kept on your NeuroPal server too, so your other devices see them.
            Sync never sends them to an AI.
          </p>
        </div>
        <Switch
          checked={enabled}
          labelledBy={`${id}-sync`}
          describedBy={`${id}-sync-help ${id}-status`}
          onChange={(on) => {
            if (!setDaySyncEnabled(on)) return;
            announce(on ? "Your day will sync with your server." : "Off. Your day stays in this browser.");
          }}
        />
      </div>
      <p id={`${id}-status`} className={styles.syncStatus} data-tone={status.tone}>
        {icon ? <span className={styles.syncIcon}>{icon}</span> : null}
        <span>{status.text}</span>
      </p>
    </div>
  );
}
