import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { OnboardingAnswers } from "@/models/types";

export interface OnboardingState {
  conditions: string[];
  energyPattern?: OnboardingAnswers["energyPattern"];
  primaryUse?: OnboardingAnswers["primaryUse"];
  completed: boolean;
}

export const initialOnboardingState: OnboardingState = {
  conditions: [],
  energyPattern: undefined,
  primaryUse: undefined,
  completed: false,
};

const onboardingSlice = createSlice({
  name: "onboarding",
  initialState: initialOnboardingState,
  reducers: {
    hydrateOnboarding(state, action: PayloadAction<Partial<OnboardingState>>) {
      Object.assign(state, action.payload);
    },
    toggleCondition(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.conditions.includes(id)) {
        state.conditions = state.conditions.filter((entry) => entry !== id);
      } else {
        state.conditions.push(id);
      }
    },
    setEnergyPattern(
      state,
      action: PayloadAction<OnboardingState["energyPattern"]>
    ) {
      state.energyPattern = action.payload;
    },
    setPrimaryUse(
      state,
      action: PayloadAction<OnboardingState["primaryUse"]>
    ) {
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
