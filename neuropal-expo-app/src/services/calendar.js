import { Platform } from "react-native";

// P8 — device-calendar events for reminders/anchors (expo-calendar, §12
// approved). Complements (does not replace) the Google-Calendar template
// link: this one writes to whatever calendar the PHONE syncs, offline, no
// browser round-trip. Web has no calendar API — callers keep the Google
// link there.

export async function addToDeviceCalendar({ title, startMs, durationMin = 15, notes }) {
  if (Platform.OS === "web") {
    throw new Error("Device calendars aren't reachable from the browser — use the Google Calendar link.");
  }
  const Calendar = require("expo-calendar");
  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Calendar permission was declined.");
  }
  let calendarId = null;
  if (Platform.OS === "ios") {
    const def = await Calendar.getDefaultCalendarAsync();
    calendarId = def?.id;
  } else {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writable = cals.filter((c) => c.allowsModifications);
    // prefer the primary Google account calendar when present
    calendarId = (writable.find((c) => c.isPrimary) || writable[0])?.id;
  }
  if (!calendarId) throw new Error("No writable calendar on this device.");
  return Calendar.createEventAsync(calendarId, {
    title,
    startDate: new Date(startMs),
    endDate: new Date(startMs + durationMin * 60000),
    notes: notes || "Set in NeuroPal",
  });
}
