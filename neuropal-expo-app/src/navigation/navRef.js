import { createNavigationContainerRef } from "@react-navigation/native";

// Navigation from outside the screens — a deep link from the home-screen
// widget, before or after the navigator exists. On a cold start the link
// arrives while the app is still connecting (no navigator yet), so it waits
// and runs once the container is ready (AppNavigator → onReady). The
// navigator watches what's waiting (subscribePendingRoute/getPendingRoute):
// the calming steps open at once instead of after the connection check.
export const navRef = createNavigationContainerRef();

let pending = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // a broken listener must not block navigation
    }
  });
}

export function navigateWhenReady(name, params) {
  if (navRef.isReady()) {
    navRef.navigate(name, params);
    return;
  }
  pending = { name, params };
  emit();
}

export function flushPendingNavigation() {
  if (!pending || !navRef.isReady()) return;
  const { name, params } = pending;
  pending = null;
  emit();
  navRef.navigate(name, params);
}

// For useSyncExternalStore: the route waiting to open, or null.
export function subscribePendingRoute(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getPendingRoute() {
  return pending ? pending.name : null;
}
