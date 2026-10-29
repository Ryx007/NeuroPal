"use client";
// Pal, the assistant (the Expo app's Pal sheet as a page): Pal on the left
// with a greeting that follows your check-in, and five tools as tabs —
// What now? · Break it down · Brain dump · Sit with me · Talk. All but Talk
// work offline. The open tool is in the address (?tool=…), so Home can link
// straight to one.
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import { useAppearance } from "@/components/AppearanceProvider";
import { useDay } from "@/lib/neuropal/day";
import { normalizePal } from "@/lib/neuropal/look";
import { helloFor, moodFor, type PalTool } from "@/lib/neuropal/palLogic";
import { useSit } from "@/lib/neuropal/palState";
import { ROUTES } from "../common/appNav";
import { ChatIcon, CompassIcon, InboxIcon, SitIcon, SplitIcon } from "../common/icons";
import { PalAvatar } from "../common/PalAvatar";
import { BreakdownPanel } from "./BreakdownPanel";
import { DumpPanel } from "./DumpPanel";
import { NowPanel } from "./NowPanel";
import { SitPanel } from "./SitPanel";
import { TalkPanel } from "./TalkPanel";
import styles from "./pal.module.css";

const TOOLS: { id: PalTool; title: string; sub: string; Icon: typeof CompassIcon }[] = [
  { id: "now", title: "What now?", sub: "One next step, picked for right now", Icon: CompassIcon },
  { id: "breakdown", title: "Break it down", sub: "Big task in, tiny steps out", Icon: SplitIcon },
  { id: "dump", title: "Brain dump", sub: "Get thoughts out of your head", Icon: InboxIcon },
  { id: "sit", title: "Sit with me", sub: "Quiet company while you work", Icon: SitIcon },
  { id: "talk", title: "Talk", sub: "A short chat", Icon: ChatIcon },
];

const isTool = (v: string | null): v is PalTool => TOOLS.some((t) => t.id === v);

// Wide screens stack the tabs vertically (aria-orientation follows).
const wideQuery = "(min-width: 1000px)";
const wideStore = {
  subscribe(l: () => void) {
    const mq = window.matchMedia(wideQuery);
    mq.addEventListener("change", l);
    return () => mq.removeEventListener("change", l);
  },
  get: () => window.matchMedia(wideQuery).matches,
  getServer: () => true,
};

export function PalView() {
  const id = useId();
  const params = useSearchParams();
  const { appearance } = useAppearance();
  const pal = normalizePal(appearance.pal);
  const day = useDay();
  const { sit, notes } = useSit();
  const wide = useSyncExternalStore(wideStore.subscribe, wideStore.get, wideStore.getServer);
  const asked = params.get("tool");
  const tool: PalTool = isTool(asked) ? asked : "now";
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusPanel = useRef(false);

  const select = (t: PalTool, opts: { focus?: "tab" | "panel" } = {}) => {
    // The native History API keeps Next's router and useSearchParams in step.
    window.history.replaceState(null, "", `${ROUTES.pal}?tool=${t}`);
    if (opts.focus === "tab") tabRefs.current[t]?.focus();
    if (opts.focus === "panel") focusPanel.current = true;
  };

  // An action inside a tool opened another tool: continue there.
  useEffect(() => {
    if (!focusPanel.current) return;
    focusPanel.current = false;
    document.getElementById(`${id}-panel-${tool}`)?.focus();
  }, [tool, id]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TOOLS.findIndex((t) => t.id === tool);
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % TOOLS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + TOOLS.length) % TOOLS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TOOLS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(TOOLS[next].id, { focus: "tab" });
  };

  const sub = (t: (typeof TOOLS)[number]) => {
    if (t.id === "dump" && day.dump.length) return `${day.dump.length} saved`;
    if (t.id === "sit" && sit) return sit.endedAt ? "Done. Want to note it?" : "Sitting with you now";
    if (t.id === "talk") return `A short chat with ${pal.name}`;
    return t.sub;
  };

  return (
    <div className={styles.page}>
      <aside className={styles.side} aria-labelledby={`${id}-name`}>
        <div className={styles.who}>
          <PalAvatar pal={pal} size={wide ? 168 : 76} mood={moodFor(day.state)} className={styles.avatar} />
          <div className={styles.whoText}>
            <p className="np-label">Pal · your assistant</p>
            <h1 id={`${id}-name`} className={`np-display ${styles.name}`}>
              {pal.name}
            </h1>
            <p className={styles.hello}>{helloFor(pal, day.state)}</p>
          </div>
        </div>
        <div role="tablist" aria-label={`${pal.name}’s tools`} aria-orientation={wide ? "vertical" : "horizontal"} className={styles.tabs}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              id={`${id}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tool === t.id}
              aria-controls={`${id}-panel-${t.id}`}
              tabIndex={tool === t.id ? 0 : -1}
              className={styles.tab}
              onClick={() => select(t.id)}
              onKeyDown={onTabKey}
            >
              <span className={styles.tabIcon} aria-hidden="true">
                <t.Icon />
              </span>
              <span className={styles.tabText}>
                <span className={styles.tabTitle}>{t.title}</span>
                <span className={styles.tabSub}>{sub(t)}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className={styles.panels}>
        {TOOLS.map((t) => (
          <section
            key={t.id}
            id={`${id}-panel-${t.id}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${t.id}`}
            tabIndex={0}
            hidden={tool !== t.id}
            className={`np-panel ${styles.panel}`}
          >
            {t.id === "now" ? <NowPanel pal={pal} day={day} active={tool === "now"} onTool={(x) => select(x, { focus: "panel" })} /> : null}
            {t.id === "breakdown" ? <BreakdownPanel pal={pal} onSit={() => select("sit", { focus: "panel" })} /> : null}
            {t.id === "dump" ? <DumpPanel pal={pal} items={day.dump} /> : null}
            {t.id === "sit" ? <SitPanel pal={pal} sit={sit} notes={notes} tasks={day.tasks} mood={moodFor(day.state)} /> : null}
            {t.id === "talk" ? <TalkPanel pal={pal} day={day} /> : null}
          </section>
        ))}
      </div>
    </div>
  );
}
