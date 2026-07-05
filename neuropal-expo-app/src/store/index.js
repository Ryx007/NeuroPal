import { configureStore } from "@reduxjs/toolkit";

import authReducer from "./slices/authSlice";
import homeReducer from "./slices/homeSlice";
import libraryReducer from "./slices/librarySlice";
import onboardingReducer from "./slices/onboardingSlice";
import readerReducer from "./slices/readerSlice";
import uiReducer from "./slices/uiSlice";

export const appStore = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    onboarding: onboardingReducer,
    home: homeReducer,
    library: libraryReducer,
    reader: readerReducer,
  },
});
