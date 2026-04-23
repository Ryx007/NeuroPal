import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Provider } from "react-redux";

import { appStore, type RootState } from "@/store";
import { deserializeDocuments, deserializeMessages, serializeDocuments, serializeMessages } from "@/store/serializers";
import { hydrateHome } from "@/store/slices/homeSlice";
import { hydrateLibrary } from "@/store/slices/librarySlice";
import { hydrateOnboarding } from "@/store/slices/onboardingSlice";
import { hydrateReader } from "@/store/slices/readerSlice";
import { hydrateUi } from "@/store/slices/uiSlice";

const STORAGE_KEYS = {
  ui: "np.ui.v2",
  onboarding: "np.onboarding.v2",
  home: "np.home.v1",
  library: "np.library.v1",
  reader: "np.reader.v1",
} as const;

function getPersistedSlices(state: RootState) {
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

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const snapshotRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const pairs = await AsyncStorage.multiGet(Object.values(STORAGE_KEYS));
        const persisted = Object.fromEntries(pairs);

        if (persisted[STORAGE_KEYS.ui]) {
          appStore.dispatch(hydrateUi(JSON.parse(persisted[STORAGE_KEYS.ui]!)));
        }

        if (persisted[STORAGE_KEYS.onboarding]) {
          appStore.dispatch(
            hydrateOnboarding(JSON.parse(persisted[STORAGE_KEYS.onboarding]!))
          );
        }

        if (persisted[STORAGE_KEYS.home]) {
          appStore.dispatch(hydrateHome(JSON.parse(persisted[STORAGE_KEYS.home]!)));
        }

        if (persisted[STORAGE_KEYS.library]) {
          const parsed = JSON.parse(persisted[STORAGE_KEYS.library]!);
          appStore.dispatch(
            hydrateLibrary({
              docs: deserializeDocuments(parsed.docs),
            })
          );
        }

        if (persisted[STORAGE_KEYS.reader]) {
          const parsed = JSON.parse(persisted[STORAGE_KEYS.reader]!);
          appStore.dispatch(
            hydrateReader({
              messages: deserializeMessages(parsed.messages),
            })
          );
        }
      } catch {
        // Start from defaults when persisted state is unavailable or corrupt.
      } finally {
        if (active) setReady(true);
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const persist = () => {
      const next = getPersistedSlices(appStore.getState());
      for (const [key, value] of Object.entries(next)) {
        if (snapshotRef.current[key] === value) continue;
        snapshotRef.current[key] = value;
        void AsyncStorage.setItem(key, value);
      }
    };

    persist();
    const unsubscribe = appStore.subscribe(persist);
    return unsubscribe;
  }, [ready]);

  const content = useMemo(() => {
    if (!ready) return null;
    return <Provider store={appStore}>{children}</Provider>;
  }, [children, ready]);

  return content;
}
