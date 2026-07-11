import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { Provider } from "react-redux";

import { appStore } from "../store";
import {
  deserializeDocuments,
  deserializeMessages,
  serializeDocuments,
  serializeMessages,
} from "../store/serializers";
import { hydrateFlashcards } from "../store/slices/flashcardsSlice";
import { hydrateFocus } from "../store/slices/focusSlice";
import { hydrateHome } from "../store/slices/homeSlice";
import { hydrateLibrary } from "../store/slices/librarySlice";
import { hydrateOnboarding } from "../store/slices/onboardingSlice";
import { hydrateReader } from "../store/slices/readerSlice";
import { hydrateNotes } from "../store/slices/notesSlice";
import { hydrateReminders } from "../store/slices/remindersSlice";
import { hydrateUi } from "../store/slices/uiSlice";

const STORAGE_KEYS = {
  ui: "np.ui.v3",
  onboarding: "np.onboarding.v3",
  home: "np.home.v2",
  library: "np.library.v2",
  reader: "np.reader.v2",
  focus: "np.focus.v1",
  reminders: "np.reminders.v1",
  flashcards: "np.flashcards.v1",
  notes: "np.notes.v1",
};

const CRASH_KEY = "np.lastCrash";

// Lightweight crash recorder: fatal JS errors are persisted before the app
// dies, so the next launch can say WHAT crashed instead of leaving the user
// with a silent restart. (Native-level crashes bypass JS and won't appear.)
if (typeof ErrorUtils !== "undefined" && ErrorUtils.getGlobalHandler) {
  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    try {
      if (isFatal) {
        AsyncStorage.setItem(
          CRASH_KEY,
          JSON.stringify({
            message: String(error?.message || error).slice(0, 500),
            stack: String(error?.stack || "").slice(0, 2000),
            at: new Date().toISOString(),
          })
        );
      }
    } catch (e) {
      // never let the recorder itself throw
    }
    if (previousHandler) previousHandler(error, isFatal);
  });
}

async function reportLastCrash() {
  try {
    const raw = await AsyncStorage.getItem(CRASH_KEY);
    if (!raw) return;
    await AsyncStorage.removeItem(CRASH_KEY);
    const crash = JSON.parse(raw);
    // eslint-disable-next-line no-console
    console.warn("[crash] previous session died:", crash.message, crash.at);
    const Toast = require("../components/toast").default;
    setTimeout(() => {
      Toast.show({
        type: "error",
        text1: "The app crashed last time",
        text2: crash.message,
      });
    }, 2000);
  } catch (e) {
    // best effort only
  }
}

function getPersistedSlices(state) {
  return {
    [STORAGE_KEYS.ui]: JSON.stringify({
      theme: state.ui.theme,
      accent: state.ui.accent,
      readerFont: state.ui.readerFont,
      readerLayout: state.ui.readerLayout,
      density: state.ui.density,
      fontSize: state.ui.fontSize,
      lineSpacing: state.ui.lineSpacing,
      wpm: state.ui.wpm,
      voice: state.ui.voice,
      voiceId: state.ui.voiceId,
      speakEquations: state.ui.speakEquations,
    }),
    [STORAGE_KEYS.onboarding]: JSON.stringify(state.onboarding),
    [STORAGE_KEYS.home]: JSON.stringify({
      nervousState: state.home.nervousState,
      tasks: state.home.tasks,
      anchors: state.home.anchors,
      todos: state.home.todos,
      dayStamp: state.home.dayStamp,
    }),
    [STORAGE_KEYS.library]: JSON.stringify({
      docs: serializeDocuments(state.library.docs),
    }),
    [STORAGE_KEYS.reader]: JSON.stringify({
      messages: serializeMessages(state.reader.messages),
    }),
    [STORAGE_KEYS.focus]: JSON.stringify(state.focus),
    [STORAGE_KEYS.reminders]: JSON.stringify({ items: state.reminders.items }),
    [STORAGE_KEYS.flashcards]: JSON.stringify({ byDoc: state.flashcards.byDoc }),
    [STORAGE_KEYS.notes]: JSON.stringify({ items: state.notes.items }),
  };
}

export function AppProviders({ children }) {
  const [ready, setReady] = useState(false);
  const snapshotRef = useRef({});

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const pairs = await AsyncStorage.multiGet(Object.values(STORAGE_KEYS));
        const persisted = Object.fromEntries(pairs);

        if (persisted[STORAGE_KEYS.ui]) {
          appStore.dispatch(hydrateUi(JSON.parse(persisted[STORAGE_KEYS.ui])));
        }

        if (persisted[STORAGE_KEYS.onboarding]) {
          appStore.dispatch(
            hydrateOnboarding(JSON.parse(persisted[STORAGE_KEYS.onboarding]))
          );
        }

        if (persisted[STORAGE_KEYS.home]) {
          appStore.dispatch(
            hydrateHome(JSON.parse(persisted[STORAGE_KEYS.home]))
          );
        }

        if (persisted[STORAGE_KEYS.library]) {
          const parsed = JSON.parse(persisted[STORAGE_KEYS.library]);
          appStore.dispatch(
            hydrateLibrary({
              docs: deserializeDocuments(parsed.docs),
            })
          );
        }

        if (persisted[STORAGE_KEYS.reader]) {
          const parsed = JSON.parse(persisted[STORAGE_KEYS.reader]);
          appStore.dispatch(
            hydrateReader({
              messages: deserializeMessages(parsed.messages),
            })
          );
        }

        if (persisted[STORAGE_KEYS.focus]) {
          appStore.dispatch(hydrateFocus(JSON.parse(persisted[STORAGE_KEYS.focus])));
        }

        if (persisted[STORAGE_KEYS.reminders]) {
          appStore.dispatch(
            hydrateReminders(JSON.parse(persisted[STORAGE_KEYS.reminders]))
          );
        }

        if (persisted[STORAGE_KEYS.flashcards]) {
          appStore.dispatch(
            hydrateFlashcards(JSON.parse(persisted[STORAGE_KEYS.flashcards]))
          );
        }

        if (persisted[STORAGE_KEYS.notes]) {
          appStore.dispatch(hydrateNotes(JSON.parse(persisted[STORAGE_KEYS.notes])));
        }
      } catch {
        // Fall back to the bundled mock state if storage is unavailable.
      } finally {
        if (active) {
          setReady(true);
        }
        // P8 — Android drops the OS notification schedule on reboot; rebuild
        // it from the hydrated state on every launch (idempotent, no boot
        // receiver needed, never prompts for permission on its own).
        try {
          const { rearmSchedules } = require("../services/notify");
          const { setReminderNotificationId } = require("../store/slices/remindersSlice");
          const st = appStore.getState();
          const remap = await rearmSchedules({
            anchors: st.home.anchors || [],
            reminders: st.reminders.items || [],
          });
          for (const [id, notificationId] of Object.entries(remap)) {
            appStore.dispatch(setReminderNotificationId({ id, notificationId }));
          }
        } catch (e) {
          // notifications unavailable (web / no permission) — in-app popups remain
        }
      }
    }

    bootstrap();
    reportLastCrash();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return undefined;
    }

    function persist() {
      const next = getPersistedSlices(appStore.getState());
      Object.entries(next).forEach(([key, value]) => {
        if (snapshotRef.current[key] === value) {
          return;
        }

        snapshotRef.current[key] = value;
        AsyncStorage.setItem(key, value);
      });
    }

    persist();
    const unsubscribe = appStore.subscribe(persist);
    return unsubscribe;
  }, [ready]);

  // P8 — keep the OS anchor schedule in sync with edits: whenever the
  // anchors array identity changes, rebuild the daily notifications
  // (debounced; rearm is idempotent and cancels stale anchor schedules).
  useEffect(() => {
    if (!ready) return undefined;
    let lastAnchors = appStore.getState().home.anchors;
    let timer = null;
    const unsubscribe = appStore.subscribe(() => {
      const anchors = appStore.getState().home.anchors;
      if (anchors === lastAnchors) return;
      lastAnchors = anchors;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const { rearmSchedules } = require("../services/notify");
        rearmSchedules({ anchors, reminders: [] }).catch(() => {});
      }, 1200);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [ready]);

  const content = useMemo(() => {
    if (!ready) {
      return null;
    }

    return <Provider store={appStore}>{children}</Provider>;
  }, [children, ready]);

  return content;
}
