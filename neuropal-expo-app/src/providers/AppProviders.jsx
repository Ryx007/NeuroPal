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
import { hydrateHome } from "../store/slices/homeSlice";
import { hydrateLibrary } from "../store/slices/librarySlice";
import { hydrateOnboarding } from "../store/slices/onboardingSlice";
import { hydrateReader } from "../store/slices/readerSlice";
import { hydrateUi } from "../store/slices/uiSlice";

const STORAGE_KEYS = {
  ui: "np.ui.v3",
  onboarding: "np.onboarding.v3",
  home: "np.home.v2",
  library: "np.library.v2",
  reader: "np.reader.v2",
};

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
    }),
    [STORAGE_KEYS.onboarding]: JSON.stringify(state.onboarding),
    [STORAGE_KEYS.home]: JSON.stringify({
      nervousState: state.home.nervousState,
      tasks: state.home.tasks,
      anchors: state.home.anchors,
    }),
    [STORAGE_KEYS.library]: JSON.stringify({
      docs: serializeDocuments(state.library.docs),
    }),
    [STORAGE_KEYS.reader]: JSON.stringify({
      messages: serializeMessages(state.reader.messages),
    }),
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
      } catch {
        // Fall back to the bundled mock state if storage is unavailable.
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    bootstrap();

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

  const content = useMemo(() => {
    if (!ready) {
      return null;
    }

    return <Provider store={appStore}>{children}</Provider>;
  }, [children, ready]);

  return content;
}
