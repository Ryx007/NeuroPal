import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  conditions: [],
  energyPattern: undefined,
  primaryUse: undefined,
  completed: false,
};

const onboardingSlice = createSlice({
  name: "onboarding",
  initialState,
  reducers: {
    hydrateOnboarding(state, action) {
      Object.assign(state, action.payload);
    },
    toggleCondition(state, action) {
      const id = action.payload;
      if (state.conditions.includes(id)) {
        state.conditions = state.conditions.filter((entry) => entry !== id);
      } else {
        state.conditions.push(id);
      }
    },
    setEnergyPattern(state, action) {
      state.energyPattern = action.payload;
    },
    setPrimaryUse(state, action) {
      state.primaryUse = action.payload;
    },
    completeOnboarding(state) {
      state.completed = true;
    },
  },
});

export const {
  completeOnboarding,
  hydrateOnboarding,
  setEnergyPattern,
  setPrimaryUse,
  toggleCondition,
} = onboardingSlice.actions;

export default onboardingSlice.reducer;
