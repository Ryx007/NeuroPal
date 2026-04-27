import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  combineReducers,
  configureStore,
  type ThunkAction,
  type UnknownAction,
} from "@reduxjs/toolkit";
import {
  persistReducer,
  persistStore,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";

import documents from "./slices/documents";
import mvd from "./slices/mvd";
import nervous from "./slices/nervous";
import onboarding from "./slices/onboarding";
import readerChat from "./slices/readerChat";
import readerPlayback from "./slices/readerPlayback";
import tweaks from "./slices/tweaks";

/**
 * Root reducer.
 * Only `tweaks` and `onboarding` are persisted — the rest is either
 * transient (nervous state check-in, reader playback) or server-owned
 * (documents, chat) and will flip to TanStack Query / Supabase once
 * Phase 1.3 ships.
 */
const rootReducer = combineReducers({
  tweaks,
  onboarding,
  nervous,
  mvd,
  documents,
  readerChat,
  readerPlayback,
});

const persistedReducer = persistReducer(
  {
    key: "np.root.v1",
    storage: AsyncStorage,
    whitelist: ["tweaks", "onboarding"],
  },
  rootReducer
);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefault) =>
    getDefault({
      serializableCheck: {
        ignoredActions: [
          FLUSH,
          REHYDRATE,
          PAUSE,
          PERSIST,
          PURGE,
          REGISTER,
          "readerChat/ask",
        ],
        // `at: Date` in ChatMessage isn't serializable-by-default
        ignoredPaths: ["readerChat.messages"],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  UnknownAction
>;
