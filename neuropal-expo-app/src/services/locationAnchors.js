import { Platform } from "react-native";

// P8 — place-based anchors (expo-location, §12 approved), FOREGROUND v1:
// when the app is open (Home gains focus), anchors that carry a location
// fire if the phone is inside their radius. Honest scope note: closed-app
// geofencing needs background-location permission + TaskManager and real
// on-device iteration — deliberately deferred; time-based anchors already
// cover closed-app via the OS scheduler.

const NOTIFY_COOLDOWN_MS = 45 * 60 * 1000; // don't re-fire while lingering
const lastFired = new Map(); // anchorId → epoch ms

export async function getCurrentCoords() {
  if (Platform.OS === "web") {
    // browser geolocation works fine for ATTACHING a location on web
    return new Promise((resolve, reject) => {
      if (!navigator?.geolocation) return reject(new Error("No geolocation in this browser."));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(new Error(err?.message || "Location unavailable.")),
        { enableHighAccuracy: false, timeout: 10000 }
      );
    });
  }
  const Location = require("expo-location");
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error("Location permission was declined.");
  const pos =
    (await Location.getLastKnownPositionAsync()) ||
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Returns the location-anchors currently in range (cooldown-filtered).
// Never throws and never prompts — if permission isn't already granted,
// this quietly returns [] (the ATTACH flow is where the user is asked).
export async function anchorsInRange(anchors) {
  const located = (anchors || []).filter((a) => a?.location?.lat != null);
  if (located.length === 0 || Platform.OS === "web") return [];
  try {
    const Location = require("expo-location");
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return [];
    const pos =
      (await Location.getLastKnownPositionAsync()) ||
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const now = Date.now();
    return located.filter((a) => {
      const dist = haversineMeters(here, a.location);
      const inRange = dist <= (a.location.radius || 150);
      const cooled = now - (lastFired.get(a.id) || 0) > NOTIFY_COOLDOWN_MS;
      if (inRange && cooled) {
        lastFired.set(a.id, now);
        return true;
      }
      return false;
    });
  } catch (e) {
    return [];
  }
}
