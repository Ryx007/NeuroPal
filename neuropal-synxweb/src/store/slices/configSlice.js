import { createSlice } from '@reduxjs/toolkit';

// Single mega-slice — same pattern as Synxweb's `configSlice` (which holds
// theme, login, plans, workers, slots, ...). For NeuroPal we collapse all
// global state here:
//   • Tweaks (theme/accent/font/layout/density/size/spacing/wpm/voice)
//   • Onboarding answers + completion flag
//   • Boot config from /app/preview (companyName, themeColor, ...)
//   • Auth (loggedIn, userId, userName)
//   • Nervous-system check-in
//   • MVD task list
//   • Document library
//   • Reader chat / playback
// As the app grows past Phase 1 you can split this into domain slices, but
// for now one slice keeps the boot pipeline trivially debuggable.

const configSlice = createSlice({
    name: 'configSlice',
    initialState: {
        // ---- Auth & boot ----
        loggedIn: null, // null = booting, false = signed out, true = signed in
        userId: '',
        userName: '',
        workerName: '',

        // ---- Tenant config (from /app/preview) ----
        companyName: 'NeuroPal',
        companyLogo: '',
        billUrl: '',
        themeColor: '#B1C5FF',

        // ---- Reader tweaks ----
        theme: 'dark',
        accent: 'blue',
        readerFont: 'inter',
        readerLayout: 'split',
        density: 'calm',
        fontSize: 20,
        lineSpacing: 1.7,
        wpm: 225,
        voice: 'soft',

        // ---- Onboarding ----
        conditions: [],
        energyPattern: '',
        primaryUse: '',
        onboardingComplete: false,

        // ---- Nervous-system state check-in ----
        nervousState: null, // 'green' | 'yellow' | 'red' | null

        // ---- MVD ----
        mvdTasks: [],

        // ---- Library ----
        documents: [],

        // ---- Reader transient state ----
        readerPlaying: false,
        readerWordIndex: 0,
        readerTotalWords: 0,
        readerChat: [],

        // ---- Plans / workers (placeholder for Phase 3) ----
        plans: [],
        activePlans: [],
        workers: {},
        storeWorkers: {},
    },
    reducers: {
        // ---- Auth ----
        updateLogin(state, action) {
            state.loggedIn = action.payload;
        },
        updateUserId(state, action) {
            state.userId = action.payload;
        },
        updateUserName(state, action) {
            state.userName = action.payload;
        },
        updateWorkerName(state, action) {
            state.workerName = action.payload;
        },

        // ---- Tenant ----
        updateCompanyName(state, action) {
            state.companyName = action.payload;
        },
        updateCompanyLogo(state, action) {
            state.companyLogo = action.payload;
        },
        updateBillUrl(state, action) {
            state.billUrl = action.payload;
        },
        updateThemeColor(state, action) {
            state.themeColor = action.payload;
        },

        // ---- Tweaks ----
        updateTheme(state, action) {
            state.theme = action.payload;
        },
        updateAccent(state, action) {
            state.accent = action.payload;
        },
        updateReaderFont(state, action) {
            state.readerFont = action.payload;
        },
        updateReaderLayout(state, action) {
            state.readerLayout = action.payload;
        },
        updateDensity(state, action) {
            state.density = action.payload;
        },
        updateFontSize(state, action) {
            state.fontSize = action.payload;
        },
        updateLineSpacing(state, action) {
            state.lineSpacing = action.payload;
        },
        updateWpm(state, action) {
            state.wpm = action.payload;
        },
        updateVoice(state, action) {
            state.voice = action.payload;
        },

        // ---- Onboarding ----
        toggleCondition(state, action) {
            const idx = state.conditions.indexOf(action.payload);
            if (idx >= 0) state.conditions.splice(idx, 1);
            else state.conditions.push(action.payload);
        },
        updateEnergyPattern(state, action) {
            state.energyPattern = action.payload;
        },
        updatePrimaryUse(state, action) {
            state.primaryUse = action.payload;
        },
        completeOnboarding(state) {
            state.onboardingComplete = true;
        },

        // ---- Nervous state ----
        updateNervousState(state, action) {
            state.nervousState = action.payload;
        },

        // ---- MVD ----
        setMvdTasks(state, action) {
            state.mvdTasks = action.payload;
        },
        toggleMvdTask(state, action) {
            const t = state.mvdTasks.find((x) => x.id === action.payload);
            if (t) t.done = !t.done;
        },

        // ---- Library ----
        setDocuments(state, action) {
            state.documents = action.payload;
        },
        addDocument(state, action) {
            state.documents.unshift(action.payload);
        },

        // ---- Reader ----
        playReader(state) {
            state.readerPlaying = true;
        },
        pauseReader(state) {
            state.readerPlaying = false;
        },
        resetReader(state) {
            state.readerPlaying = false;
            state.readerWordIndex = 0;
        },
        setReaderTotalWords(state, action) {
            state.readerTotalWords = action.payload;
        },
        setReaderWord(state, action) {
            state.readerWordIndex = action.payload;
        },
        advanceReader(state) {
            if (state.readerWordIndex + 1 >= state.readerTotalWords) {
                state.readerPlaying = false;
                return;
            }
            state.readerWordIndex += 1;
        },
        appendReaderChat(state, action) {
            state.readerChat.push(action.payload);
        },

        // ---- Plans / workers ----
        updatePlans(state, action) {
            state.plans = action.payload;
        },
        updateActivePlans(state, action) {
            state.activePlans = action.payload;
        },
        updateWorkers(state, action) {
            state.workers = action.payload;
        },
        updateStoreWorkers(state, action) {
            state.storeWorkers = action.payload;
        },
    },
});

export const {
    updateLogin,
    updateUserId,
    updateUserName,
    updateWorkerName,
    updateCompanyName,
    updateCompanyLogo,
    updateBillUrl,
    updateThemeColor,
    updateTheme,
    updateAccent,
    updateReaderFont,
    updateReaderLayout,
    updateDensity,
    updateFontSize,
    updateLineSpacing,
    updateWpm,
    updateVoice,
    toggleCondition,
    updateEnergyPattern,
    updatePrimaryUse,
    completeOnboarding,
    updateNervousState,
    setMvdTasks,
    toggleMvdTask,
    setDocuments,
    addDocument,
    playReader,
    pauseReader,
    resetReader,
    setReaderTotalWords,
    setReaderWord,
    advanceReader,
    appendReaderChat,
    updatePlans,
    updateActivePlans,
    updateWorkers,
    updateStoreWorkers,
} = configSlice.actions;

export default configSlice.reducer;
