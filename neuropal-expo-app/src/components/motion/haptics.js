import { Platform } from "react-native";

// Small haptic cues for the check-in slider. Native only: on the web the
// Vibration API buzzes the whole phone, which is not a "tick". Loaded lazily
// and fully guarded, so an APK built before expo-haptics was added simply
// stays silent instead of crashing. Android uses the system haptic constants
// (no VIBRATE needed, and they follow the phone's own touch-feedback switch).

let mod;
function haptics() {
  if (Platform.OS === "web") return null;
  if (mod === undefined) {
    try {
      mod = require("expo-haptics");
    } catch (e) {
      mod = null;
    }
  }
  return mod;
}

function fire(run) {
  const H = haptics();
  if (!H) return;
  try {
    const p = run(H);
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {
    // native module missing or the device can't do it — stay silent
  }
}

// Crossing a region boundary while dragging.
export function hapticTick() {
  fire((H) => (Platform.OS === "android" ? H.performAndroidHapticsAsync(H.AndroidHaptics.Segment_Tick) : H.selectionAsync()));
}

// A check-in was saved.
export function hapticCommit() {
  fire((H) =>
    Platform.OS === "android" ? H.performAndroidHapticsAsync(H.AndroidHaptics.Confirm) : H.impactAsync(H.ImpactFeedbackStyle.Light)
  );
}
