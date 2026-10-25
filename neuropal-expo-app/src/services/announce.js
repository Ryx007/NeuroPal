import { AccessibilityInfo, Platform } from "react-native";

// Tell screen-reader users what just happened, in one call, on every
// platform:
//   native  AccessibilityInfo.announceForAccessibility (TalkBack, VoiceOver)
//   web     two permanent, visually hidden live regions — react-native-web's
//           announceForAccessibility does nothing, and a live region that
//           appears already filled is never read, so the regions exist from
//           the first call on and only their text changes.
//
//   announce("Bo: Two small steps.")                 polite (waits its turn)
//   announce("Invalid email or password", { assertive: true })   interrupts
//
// Use it for results that arrive later (a reply, a list of steps, a save),
// never for text that is already focused or labelled.

const regions = { polite: null, assertive: null };

function region(kind) {
  if (typeof document === "undefined" || !document.body) return null;
  if (regions[kind]?.isConnected) return regions[kind];
  const el = document.createElement("div");
  el.setAttribute("aria-live", kind);
  el.setAttribute("aria-atomic", "true");
  if (kind === "assertive") el.setAttribute("role", "alert");
  else el.setAttribute("role", "status");
  Object.assign(el.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: "0",
    border: "0",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  });
  document.body.appendChild(el);
  regions[kind] = el;
  return el;
}

export function announce(text, { assertive = false } = {}) {
  const message = String(text || "").trim();
  if (!message) return;
  if (Platform.OS === "web") {
    const el = region(assertive ? "assertive" : "polite");
    if (!el) return;
    // Empty first, then fill on the next tick, so the same words twice are
    // still read twice.
    el.textContent = "";
    setTimeout(() => {
      el.textContent = message;
    }, 60);
    return;
  }
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // never let an announcement break the action that triggered it
  }
}

// Create the web regions early (App start) so the very first announcement is
// heard; harmless on native.
export function prepareAnnouncer() {
  if (Platform.OS !== "web") return;
  region("polite");
  region("assertive");
}
