// Where Pal's floating bubble sits, shared by the bubble itself (PalBuddy)
// and by the screens that pad their last row clear of it
// (usePalBubbleClearance in openPalSheet.js), so the two always agree.

export const BUBBLE_SIZE = 52;

// Routes where the bubble stays away: the Reader owns its chrome (docked
// player, Ask, the re-summon pill) and Make it yours has its own Ask Pal and
// bottom proposal card. The sheet itself still opens there (Home tile, widget).
// A screen can also ask for it per moment with the route param
// `editing: true` (Notes, while a note's canvas and toolbar are open).
export const PAL_BUBBLE_HIDDEN_ON = ["Reader", "Studio"];

// Screens with their own bottom-right button: the bubble sits above it,
// centred on it (Library's 60 px upload FAB, Notes' "New note" pill).
const LIFT = {
  Library: { bottom: 28 + 60 + 12, right: 20 + (60 - BUBBLE_SIZE) / 2 },
  Notes: { bottom: 28 + 50 + 12, right: 20 },
};

// The now-playing pill (AppNavigator: right 14, bottom inset + 16, 44 tall).
const NOW_PLAYING = { bottom: 16, height: 44, gap: 12 };

/**
 * The bubble's offsets from the bottom-right corner, outside the safe-area
 * insets: above the now-playing pill and the screen's own bottom-right button.
 */
export function bubblePlacement(routeName, insets, nowPlaying) {
  let bottom = insets.bottom + 16;
  let right = insets.right + 16;
  if (LIFT[routeName]) {
    bottom = Math.max(bottom, LIFT[routeName].bottom);
    right = LIFT[routeName].right;
  }
  if (nowPlaying && routeName !== "Reader") {
    bottom = Math.max(bottom, insets.bottom + NOW_PLAYING.bottom + NOW_PLAYING.height + NOW_PLAYING.gap);
    right = 14;
  }
  return { bottom, right };
}

// `editing` hides it like a hidden route does: even during "Sit with me",
// which otherwise keeps the bubble up despite "Hide the bubble".
export function bubbleShown(routeName, { bubbleHidden, sitting, editing = false }) {
  return !PAL_BUBBLE_HIDDEN_ON.includes(routeName) && !editing && (!bubbleHidden || sitting);
}
