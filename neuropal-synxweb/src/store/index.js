import { configureStore } from '@reduxjs/toolkit';

import configSlice from './slices/configSlice';

// Mirrors Synxweb's `src/store/index.js` exactly: configureStore + a single
// `configs` reducer key. As the app grows you can keep adding keys without
// breaking page-level `mapStateToProps` selectors.
const store = configureStore({
    reducer: {
        configs: configSlice,
    },
});

export default store;
