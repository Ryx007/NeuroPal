import { configureStore } from '@reduxjs/toolkit';
import libraryReducer from '../features/library/store/librarySlice';
import readerReducer from '../features/reader/store/readerSlice';
import uiReducer, { tweaksPersistMiddleware } from '../features/ui/store/uiSlice';

const store = configureStore({
  reducer: {
    ui: uiReducer,
    reader: readerReducer,
    library: libraryReducer,
  },
  middleware: (getDefault) => getDefault().concat(tweaksPersistMiddleware),
});

export default store;
