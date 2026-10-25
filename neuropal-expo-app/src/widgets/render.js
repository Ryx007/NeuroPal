"use no memo";
// Builds the widget's element tree for react-native-android-widget, which
// walks it as plain function calls (see PalWidget.jsx) — keep the compiler out.
// Only Android code imports this file (registerWidget.android.js,
// useWidgetBridge.android.js); off Android the library is a no-op anyway.

import { getWidgetInfo, requestWidgetUpdateById } from "react-native-android-widget";

import { WIDGET_NAME } from "./constants";
import { buildViewModel } from "./model";
import { PalWidget } from "./PalWidget";
import { readCheckins, readSnapshot } from "./storage";

// One widget instance (WidgetInfo carries its size in dp and the font scale).
export function palElement(info, snapshot, checkins, now = new Date()) {
  const model = buildViewModel({
    snapshot,
    checkins,
    width: info.width,
    height: info.height,
    fontScale: info.screenInfo?.fontScale ?? 1,
    now,
  });
  return <PalWidget model={model} />;
}

// Re-draw every Pal widget on the home screen(s). Reads storage for whatever
// isn't passed in. `skipId` = an instance the caller has just drawn itself.
export async function refreshPalWidgets({ snapshot, checkins, skipId } = {}) {
  const infos = await getWidgetInfo(WIDGET_NAME);
  const targets = infos.filter((info) => info.widgetId !== skipId);
  if (!targets.length) return;
  const [snap, pending] = await Promise.all([
    snapshot !== undefined ? snapshot : readSnapshot(),
    checkins !== undefined ? checkins : readCheckins(),
  ]);
  const now = new Date();
  await Promise.all(
    targets.map((info) =>
      requestWidgetUpdateById({
        widgetName: WIDGET_NAME,
        widgetId: info.widgetId,
        renderWidget: (fresh) => palElement(fresh, snap, pending, now),
      })
    )
  );
}
