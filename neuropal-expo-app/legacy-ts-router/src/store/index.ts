import { configureStore } from "@reduxjs/toolkit";

import homeReducer from "@/store/slices/homeSlice";
import libraryReducer from "@/store/slices/librarySlice";
import onboardingReducer from "@/store/slices/onboardingSlice";
import readerReducer from "@/store/slices/readerSlice";
import uiReducer from "@/store/slices/uiSlice";

export const appStore = configureStore({
  reducer: {
    ui: uiReducer,
    onboarding: onboardingReducer,
    home: homeReducer,
    library: libraryReducer,
    reader: readerReducer,
  },
});

export type RootState = ReturnType<typeof appStore.getState>;
export type AppDispatch = typeof appStore.dispatch;
