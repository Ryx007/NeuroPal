"use no memo";
// Headless task for the "Pal" widget (react-native-android-widget). Runs in
// the app's JS runtime — started in the background if the app isn't open —
// whenever the widget is added, resized, periodically updated (every 30 min,
// app.json → updatePeriodMillis) or tapped. "Ask Pal" (OPEN_URI) is handled
// natively and never reaches this function.

import { CHECKIN_ACTION, WIDGET_NAME } from "./constants";
import { isState } from "./model";
import { palElement, refreshPalWidgets } from "./render";
import { notifyWidgetCheckin, readCheckins, readSnapshot, recordCheckin } from "./storage";

export async function widgetTaskHandler(props) {
  const { widgetInfo, widgetAction, clickAction, clickActionData } = props;
  if (!widgetInfo || widgetInfo.widgetName !== WIDGET_NAME) return;

  switch (widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      const [snapshot, checkins] = await Promise.all([readSnapshot(), readCheckins()]);
      props.renderWidget(palElement(widgetInfo, snapshot, checkins));
      break;
    }

    case "WIDGET_CLICK": {
      const state = clickActionData && clickActionData.state;
      if (clickAction !== CHECKIN_ACTION || !isState(state)) break;
      // Record first, then redraw from the list that now includes this tap,
      // so the new state shows immediately without opening the app.
      const checkins = await recordCheckin(state);
      const snapshot = await readSnapshot();
      props.renderWidget(palElement(widgetInfo, snapshot, checkins));
      // A second Pal widget elsewhere on the home screen shows it too.
      await refreshPalWidgets({ snapshot, checkins, skipId: widgetInfo.widgetId }).catch(() => {});
      // If the app is alive in the background, it applies the check-in now.
      notifyWidgetCheckin();
      break;
    }

    default:
      // WIDGET_DELETED: nothing stored per instance.
      break;
  }
}
