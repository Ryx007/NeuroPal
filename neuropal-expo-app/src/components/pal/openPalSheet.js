import { useRoute } from "@react-navigation/native";
import { useCallback } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";

import { appStore } from "../../store";
import { PAL_SECTIONS, closeSheet, openSection, openSheet } from "../../store/slices/palSlice";
import { BUBBLE_SIZE, bubblePlacement, bubbleShown } from "./bubbleGeometry";

// Open Pal's assistant sheet from anywhere — the Home Pal tile, a header
// button, the widget's deep link, plain JS outside React.
//
//   openPalSheet()          the list of actions (or the running sit)
//   openPalSheet("talk")    straight to one action: now | breakdown | dump | sit | talk
//   openPalSheet(null, { returnFocusTo: ref })
//                           …and when the sheet closes, screen-reader focus
//                           goes back to `ref` (the button that opened it)
//
// Safe as an onPress handler: a press event is not a section, so it opens
// the list. The sheet itself is drawn by PalBuddyHost on the focused screen.

// The control that opened the sheet (a ref), or null.
let trigger = null;
// The sheet closes without an animation (PalSheet unmounts its Modal), but
// Android needs the dialog window gone before focus can move back.
const RETURN_FOCUS_MS = 500;

export function openPalSheet(section, options) {
  trigger = options && options.returnFocusTo ? options.returnFocusTo : null;
  appStore.dispatch(PAL_SECTIONS.includes(section) ? openSection(section) : openSheet());
}

export function closePalSheet() {
  appStore.dispatch(closeSheet());
}

// The sheet closed (PalSheet calls this): native screen readers don't put
// focus back on the trigger by themselves (the web does, so it's left alone).
export function returnFocusToPalTrigger() {
  const ref = trigger;
  trigger = null;
  if (!ref || Platform.OS === "web") return;
  setTimeout(() => {
    const node = ref.current;
    if (!node) return;
    try {
      AccessibilityInfo.sendAccessibilityEvent(node, "focus");
    } catch {
      // best effort: the trigger may have gone meanwhile
    }
  }, RETURN_FOCUS_MS);
}

// The sheet is closing to go to another screen: focus belongs there.
export function forgetPalTrigger() {
  trigger = null;
}

// The same as a hook, for components that prefer their own dispatch.
export function usePalSheet() {
  const dispatch = useDispatch();
  const open = useCallback(
    (section) => {
      trigger = null;
      dispatch(PAL_SECTIONS.includes(section) ? openSection(section) : openSheet());
    },
    [dispatch]
  );
  const close = useCallback(() => dispatch(closeSheet()), [dispatch]);
  return { open, close };
}

// Bottom padding a scrolling screen needs so the floating bubble never sits
// on its last row: where the bubble is on this screen (above a FAB, above
// the now-playing pill, outside the nav-bar inset) + its size + room to
// breathe; 0 where no bubble shows. Use as
//   paddingBottom: Math.max(ownPadding, usePalBubbleClearance())
export function usePalBubbleClearance() {
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const bubbleHidden = useSelector((s) => s.pal.bubbleHidden);
  const sitting = useSelector((s) => Boolean(s.pal.sit));
  const nowPlaying = useSelector((s) => Boolean(s.reader.playing && s.reader.docId));
  const name = route ? route.name : null;
  const editing = Boolean(route && route.params && route.params.editing);
  if (!bubbleShown(name, { bubbleHidden, sitting, editing })) return 0;
  return bubblePlacement(name, insets, nowPlaying).bottom + BUBBLE_SIZE + 12;
}
