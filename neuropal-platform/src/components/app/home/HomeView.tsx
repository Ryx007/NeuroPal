"use client";
// Home ("Today"): the tiles in the order the person arranged (the look's Home
// layout, today's weekday/weekend rules applied): check-in, next anchor,
// focus, minimum viable day, resume reading, Pal's note. Desktop packs them
// into rows of a 3-column grid (2 on medium widths, 1 on phones), keeping
// their order: a row that can't take the next tile lets its last tile grow.
import { useEffect, useState, type CSSProperties } from "react";
import { useAppearance } from "@/components/AppearanceProvider";
import { hhmm, lastCheckin, nextAnchor, recordCheckin, setAnchorStatus, time12, useDay, type NervousState } from "@/lib/neuropal/day";
import { listDocuments } from "@/lib/neuropal/documents";
import { errorText } from "@/lib/neuropal/client";
import { homeTiles, normalizePal, palLine, palSay, type HomeTile } from "@/lib/neuropal/look";
import { helloFor, moodFor, resumeDocument, shorten } from "@/lib/neuropal/palLogic";
import { useSit } from "@/lib/neuropal/palState";
import { displayName, useAppSession } from "@/lib/neuropal/session";
import { announce } from "../common/announce";
import { STATE_INFO } from "../common/bits";
import { useNow } from "../common/useNow";
import { AnchorsDialog, type AnchorsTarget } from "./AnchorsDialog";
import { AnchorTile } from "./AnchorTile";
import { FocusTile } from "./FocusTile";
import { MvdTile } from "./MvdTile";
import { PalTile } from "./PalTile";
import { ReadingTile, type ReadingState } from "./ReadingTile";
import { StateTile } from "./StateTile";
import styles from "./home.module.css";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Column spans for `cols` columns: rows fill in order; a row's last tile takes what's left. */
export function spansFor(tiles: HomeTile[], cols: number): number[] {
  const out: number[] = [];
  let used = 0;
  tiles.forEach((t, i) => {
    const w = t.size === "L" ? Math.min(2, cols) : 1;
    if (used + w > cols) {
      if (i > 0) out[i - 1] += cols - used;
      used = 0;
    }
    out.push(w);
    used += w;
  });
  if (out.length && used < cols) out[out.length - 1] += cols - used;
  return out;
}

export function HomeView() {
  const { appearance } = useAppearance();
  const { user } = useAppSession();
  const day = useDay();
  const { sit } = useSit();
  const nowMs = useNow(30_000);
  const sitNow = useNow(sit && !sit.endedAt ? 15_000 : 60_000);
  const now = new Date(nowMs);
  const signal = appearance.skin === "signal";
  const pal = normalizePal(appearance.pal);
  const [reading, setReading] = useState<ReadingState>({ status: "loading" });
  const [anchors, setAnchors] = useState<{ target: AnchorsTarget } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    listDocuments(undefined, ctrl.signal)
      .then((docs) => setReading({ status: "ready", doc: resumeDocument(Array.isArray(docs) ? docs : []) }))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setReading({ status: "error", message: errorText(e) });
      });
    return () => ctrl.abort();
  }, []);

  const tiles = homeTiles(appearance.home, appearance.skin, now);
  const span3 = spansFor(tiles, 3);
  const span2 = spansFor(tiles, 2);
  const next = nextAnchor(day.anchors, now);
  const clock = (t: { hour: number; minute: number }) => (signal ? hhmm(t) : time12(t));
  const name = displayName(user);
  const last = lastCheckin(day);
  const lastAt = last ? new Date(last.at) : null;

  const message =
    day.state === "green"
      ? next
        ? `Good window for focus. ${next.title} starts at ${clock(next.time)}.`
        : "Good window for focus."
      : day.state === "yellow"
        ? "A gentler day. Two minutes on something counts."
        : day.state === "red"
          ? "Everything else can wait. The calming steps are one click away."
          : `Check in when you like. ${pal.name}’s note follows how you feel.`;

  const firstOpen = day.tasks.find((t) => !t.done);
  const palText =
    day.state === "red" ? palSay(pal, "helloOver") : firstOpen ? palLine(pal, `“${shorten(firstOpen.title)}”`) : helloFor(pal, day.state);

  const checkIn = (s: NervousState, lv: number, how: { viaSteps: boolean; button?: boolean }) => {
    const was = day.state;
    recordCheckin(s, lv);
    // The tile's message line (a live region) says what changed; a button
    // press that keeps the same state still gets a word back.
    if (how.button && was === s) announce(`Checked in: ${STATE_INFO[s].word}.`);
  };

  const render = (t: HomeTile) => {
    switch (t.id) {
      case "state":
        return <StateTile size={t.size} signal={signal} state={day.state} level={day.level} message={message} onCheckIn={checkIn} />;
      case "anchor":
        return (
          <AnchorTile
            size={t.size}
            signal={signal}
            anchor={next}
            count={day.anchors.length}
            now={now}
            onOpen={(target) => setAnchors({ target })}
            onDone={(id) => {
              const a = day.anchors.find((x) => x.id === id);
              setAnchorStatus(id, "done");
              if (a) announce(`${a.title}: done for today.`);
            }}
          />
        );
      case "mvd":
        return <MvdTile size={t.size} tasks={day.tasks} />;
      case "reading":
        return <ReadingTile size={t.size} signal={signal} reading={reading} />;
      case "focus":
        return <FocusTile size={t.size} signal={signal} sit={sit} now={sitNow} palName={pal.name} />;
      case "pal":
        return <PalTile size={t.size} pal={pal} mood={moodFor(day.state)} line={palText} />;
      default:
        return null;
    }
  };

  return (
    <div className={styles.home}>
      <header className={styles.homeHead}>
        {signal ? <p className="np-label">{`${DAYS[now.getDay()]} · ${now.getDate()} ${MONTHS[now.getMonth()]}`}</p> : null}
        <h1 className={`np-display ${styles.hello}`}>
          {name ? `Hello, ${name}` : "Hello"}
          {signal ? "." : ""}
        </h1>
        <p className={styles.homeLead}>One step at a time today.</p>
        {last && lastAt ? (
          <p className={styles.lastCheckin}>
            Last check-in: {STATE_INFO[last.state].word} at {clock({ hour: lastAt.getHours(), minute: lastAt.getMinutes() })}
            {lastAt.toDateString() !== now.toDateString() ? ` on ${lastAt.toLocaleDateString(undefined, { weekday: "long" })}` : ""}
          </p>
        ) : null}
      </header>

      <div className={styles.gridWrap}>
        <div className={styles.grid}>
          {tiles.map((t, i) => (
            <div key={t.id} className={styles.cell} data-size={t.size} style={{ "--span3": span3[i], "--span2": span2[i], "--i": i } as CSSProperties}>
              {render(t)}
            </div>
          ))}
        </div>
      </div>

      <AnchorsDialog open={Boolean(anchors)} onClose={() => setAnchors(null)} target={anchors?.target ?? null} anchors={day.anchors} signal={signal} now={now} />
    </div>
  );
}
