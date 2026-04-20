// ─── Redux store ─────────────────────────────────────────────────────
import { configureStore } from '@reduxjs/toolkit';
import uiReducer from './slices/uiSlice';
import readerReducer from './slices/readerSlice';
import libraryReducer from './slices/librarySlice';

import { tweaksPersistMiddleware } from './slices/uiSlice';

const store = configureStore({
  reducer: {
    ui: uiReducer,
    reader: readerReducer,
    library: libraryReducer,
  },
  middleware: (getDefault) => getDefault().concat(tweaksPersistMiddleware),
});

export default store;
