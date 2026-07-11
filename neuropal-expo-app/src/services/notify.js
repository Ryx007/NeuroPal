import { Platform } from "react-native";

// Local notifications for reminders, anchors and the pomodoro timer.
// Scheduled notifications fire through the OS scheduler, so they arrive even
// when the app is backgrounded or killed. Web has no reliable
// scheduled-notification story — callers fall back to in-app behavior there.
//
// P8: one Android CHANNEL PER CATEGORY so importance/vibration differ —
// a medication alert must not feel like a pomodoro ping — and every
// scheduled notification is tagged (content.data.kind/refId) so
// rearmSchedules() can rebuild the OS schedule idempotently after a reboot
// (Android silently drops schedules on restart; re-arming on app launch is
// the reliable no-boot-receiver fix).

const CHANNELS = {
  medication: {
    name: "Medication",
    importance: "MAX",
    vibrationPattern: [0, 400, 200, 400, 200, 400],
  },
  anchor: {
    name: "Anchors",
    importance: "HIGH",
    vibrationPattern: [0, 250, 250, 250],
  },
  reminder: {
    name: "Reminders",
    importance: "HIGH",
    vibrationPattern: [0, 250, 250, 250],
  },
  pomodoro: {
    name: "Pomodoro",
    importance: "DEFAULT",
    vibrationPattern: [0, 150],
  },
};

let Notifications = null;
let channelsReady = false;

function api() {
  if (Platform.OS === "web") return null;
  if (!Notifications) {
    Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return Notifications;
}

async function ensureChannels(N) {
  if (channelsReady || Platform.OS !== "android") return;
  for (const [id, ch] of Object.entries(CHANNELS)) {
    await N.setNotificationChannelAsync(id, {
      name: ch.name,
      importance: N.AndroidImportance[ch.importance],
      vibrationPattern: ch.vibrationPattern,
      sound: "default",
    });
  }
  channelsReady = true;
}

export async function ensureNotifyPermission() {
  const N = api();
  if (!N) return false;
  try {
    const current = await N.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await N.requestPermissionsAsync();
    return Boolean(asked.granted);
  } catch (e) {
    return false;
  }
}

// Schedule a notification at an absolute Date on a category channel.
// `data` should carry { kind, refId } so re-arming can recognize it.
// Returns the id (needed to cancel) or null when unavailable.
export async function scheduleAt(date, title, body, { category = "reminder", data } = {}) {
  const N = api();
  if (!N) return null;
  if (!(await ensureNotifyPermission())) return null;
  try {
    await ensureChannels(N);
    return await N.scheduleNotificationAsync({
      content: { title, body, sound: true, data: { kind: category, ...data } },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: category,
      },
    });
  } catch (e) {
    return null;
  }
}

// Recurring daily notification (anchors) at hour:minute local time.
export async function scheduleDaily(hour, minute, title, body, { category = "anchor", data } = {}) {
  const N = api();
  if (!N) return null;
  if (!(await ensureNotifyPermission())) return null;
  try {
    await ensureChannels(N);
    return await N.scheduleNotificationAsync({
      content: { title, body, sound: true, data: { kind: category, ...data } },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: category,
      },
    });
  } catch (e) {
    return null;
  }
}

export async function cancelScheduled(notificationId) {
  const N = api();
  if (!N || !notificationId) return;
  try {
    await N.cancelScheduledNotificationAsync(notificationId);
  } catch (e) {
    // already fired or never existed — fine
  }
}

// P8 — rebuild the OS schedule from app state on launch. Android drops
// every scheduled notification on reboot; this makes launch idempotent:
//   anchors    → cancel all kind:'anchor', reschedule a DAILY per anchor
//   reminders  → any future one-shot whose refId is no longer in the OS
//                schedule gets rescheduled (returns {reminderId: newNotifId}
//                so the caller can patch the slice)
export async function rearmSchedules({ anchors = [], reminders = [] } = {}) {
  const N = api();
  if (!N) return {};
  try {
    const current = await N.getPermissionsAsync();
    if (!current.granted) return {}; // never prompt from a background rearm
    await ensureChannels(N);

    const scheduled = await N.getAllScheduledNotificationsAsync();
    const byRef = new Map();
    for (const s of scheduled) {
      const d = s.content?.data || {};
      if (d.refId) byRef.set(String(d.refId), s.identifier);
      if (d.kind === "anchor") {
        await N.cancelScheduledNotificationAsync(s.identifier).catch(() => {});
      }
    }

    for (const a of anchors) {
      if (!a?.time) continue;
      await scheduleDaily(
        a.time.hour,
        a.time.minute,
        a.title,
        a.subtitle || "Anchor",
        { category: categoryForAnchor(a), data: { refId: a.id } }
      );
    }

    const remap = {};
    for (const r of reminders) {
      if (r.done || !r.at || r.at <= Date.now()) continue;
      if (byRef.has(String(r.id))) continue; // still armed
      const nid = await scheduleAt(new Date(r.at), "Reminder", r.title, {
        category: r.category === "medication" ? "medication" : "reminder",
        data: { refId: r.id },
      });
      if (nid) remap[r.id] = nid;
    }
    return remap;
  } catch (e) {
    return {};
  }
}

// medication-shaped anchors ride the medication channel (ties to
// Anchor.hapticPattern intent: meds must buzz harder than a walk reminder)
export function categoryForAnchor(anchor) {
  return /\bmed(s|ication)?\b|\bpill|\bdose/i.test(
    `${anchor?.title || ""} ${anchor?.subtitle || ""}`
  )
    ? "medication"
    : "anchor";
}
