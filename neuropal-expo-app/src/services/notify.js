import { Platform } from "react-native";

// Local notifications for the pomodoro timer and reminders. Scheduled
// notifications fire through the OS scheduler, so they arrive even when the
// app is backgrounded or killed. Web has no reliable scheduled-notification
// story — callers fall back to in-app behavior there.

let Notifications = null;
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

// Schedule a notification at an absolute Date. Returns the id (needed to
// cancel) or null when unavailable (web / permission denied).
export async function scheduleAt(date, title, body) {
  const N = api();
  if (!N) return null;
  if (!(await ensureNotifyPermission())) return null;
  try {
    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync("default", {
        name: "NeuroPal",
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    return await N.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date },
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
