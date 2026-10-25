// App side of the "Pal" home-screen widget (Android).
//
//   app → widget  writes the snapshot (state, today's anchors, Pal, skin
//                 colours) ~1 s after anything it shows changes, then asks
//                 every placed widget to redraw;
//   widget → app  applies check-ins tapped on the widget (on start, every
//                 time the app comes to the foreground, and immediately when
//                 the app is alive in the background);
//   Ask Pal       neuropal://pal opens the assistant sheet (pal/openSheet).
//   Overwhelmed   neuropal://calm checks in as red and opens the calming
//                 steps, like moving into red on Home.
//
// Mount once, inside the Redux Provider and ThemeProvider (App.js →
// AppChrome): `useWidgetBridge();`

import { useEffect, useRef } from "react";
import { AppState, Linking } from "react-native";
import { useSelector, useStore } from "react-redux";

import { middleOfState } from "../components/home/stateScale";
import { navigateWhenReady } from "../navigation/navRef";
import { recordCheckin, setNervousState } from "../store/slices/homeSlice";
import { usePalette } from "../theme/ThemeProvider";
import { createWidgetBridge } from "./bridge";
import { calmLinkKey, isAskPalUrl, isCalmUrl } from "./model";
import { getLinkKey, onWidgetCheckin } from "./storage";

const WRITE_DELAY_MS = 1000;
const OPEN_PAL_SHEET = { type: "pal/openSheet" };

// Android keeps returning the launch URL for the activity's lifetime, so the
// cold-start deep link is handled once even if the hook remounts.
let launchUrlHandled = false;

export function useWidgetBridge() {
  const store = useStore();
  const palette = usePalette();
  // Everything the snapshot shows. The bridge reads the store itself when it
  // flushes; these only decide when to schedule a flush.
  const nervousState = useSelector((s) => s.home.nervousState);
  const anchors = useSelector((s) => s.home.anchors);
  const tasks = useSelector((s) => s.home.tasks);
  const dayStamp = useSelector((s) => s.home.dayStamp);
  const pal = useSelector((s) => s.look.pal);
  const skin = useSelector((s) => s.look.skin);

  const paletteRef = useRef(palette); // read when a flush runs, never in render
  const bridgeRef = useRef(null);

  useEffect(() => {
    paletteRef.current = palette;
  }, [palette]);

  // widget → app: pending check-ins (also creates the bridge; effects run in
  // order, so it exists before the timer below can fire).
  useEffect(() => {
    const bridge = createWidgetBridge({ store, getPalette: () => paletteRef.current });
    bridgeRef.current = bridge;
    const consume = () => {
      bridge.consumeCheckins().catch(() => {});
    };
    consume();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") consume();
      // Leaving the app: make sure the widget is current (relative times,
      // a change made in the last second).
      else if (next === "background") bridge.queueFlush({ forceRefresh: true });
    });
    const off = onWidgetCheckin(consume);
    return () => {
      sub.remove();
      off();
    };
  }, [store]);

  // app → widget: debounced snapshot write + redraw.
  useEffect(() => {
    const timer = setTimeout(() => {
      bridgeRef.current?.queueFlush();
    }, WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [nervousState, anchors, tasks, dayStamp, pal, skin, palette]);

  // Ask Pal: neuropal://pal → open the assistant sheet.
  // Overwhelmed: neuropal://calm → open the calming steps at once (the
  // Emergency screen exists signed in, signed out and in onboarding). Only a
  // link carrying this app's own key (the widget's) also checks in as red —
  // after any older widget check-ins, so a morning "Okay" can't land on top.
  useEffect(() => {
    const open = async (url) => {
      if (isAskPalUrl(url)) {
        store.dispatch(OPEN_PAL_SHEET);
        return;
      }
      if (!isCalmUrl(url)) return;
      navigateWhenReady("Emergency");
      const key = calmLinkKey(url);
      const ours = key ? await getLinkKey().catch(() => null) : null;
      if (!key || key !== ours) return;
      await bridgeRef.current?.consumeCheckins().catch(() => {});
      store.dispatch(recordCheckin({ state: "red", level: middleOfState("red") }));
      store.dispatch(setNervousState("red"));
    };
    if (!launchUrlHandled) {
      launchUrlHandled = true;
      Linking.getInitialURL().then(open).catch(() => {});
    }
    const sub = Linking.addEventListener("url", (event) => {
      open(event?.url).catch(() => {});
    });
    return () => sub.remove();
  }, [store]);
}
