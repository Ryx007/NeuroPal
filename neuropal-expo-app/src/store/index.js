import { configureStore } from "@reduxjs/toolkit";

import authReducer from "./slices/authSlice";
import flashcardsReducer from "./slices/flashcardsSlice";
import focusReducer from "./slices/focusSlice";
import homeReducer from "./slices/homeSlice";
import libraryReducer from "./slices/librarySlice";
import lookReducer from "./slices/lookSlice";
import notesReducer from "./slices/notesSlice";
import onboardingReducer from "./slices/onboardingSlice";
import readerReducer from "./slices/readerSlice";
import remindersReducer from "./slices/remindersSlice";
import uiReducer from "./slices/uiSlice";

export const appStore = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    look: lookReducer,
    onboarding: onboardingReducer,
    home: homeReducer,
    library: libraryReducer,
    reader: readerReducer,
    focus: focusReducer,
    reminders: remindersReducer,
    flashcards: flashcardsReducer,
    notes: notesReducer,
  },
});
