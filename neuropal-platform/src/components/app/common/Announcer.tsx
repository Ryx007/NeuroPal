"use client";
// The live regions behind `announce()`. Rendered once, by the shell.
import { useAnnouncement } from "./announce";

export function Announcer() {
  const a = useAnnouncement();
  return (
    <>
      <div className="np-sr-only" aria-live="polite" aria-atomic="true">
        {a.assertive ? "" : a.text}
      </div>
      <div className="np-sr-only" aria-live="assertive" aria-atomic="true">
        {a.assertive ? a.text : ""}
      </div>
    </>
  );
}
