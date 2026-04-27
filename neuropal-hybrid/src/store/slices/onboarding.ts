import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import type { OnboardingAnswers } from "@/models/types";

type State = {
  conditions: string[];
  energyPattern?: "morning" | "night" | "variable";
  primaryUse?: "reading" | "regulation" | "both";
  completed: boolean;
};

const initialState: State = {
  conditions: [],
  energyPattern: undefined,
  primaryUse: undefined,
  completed: false,
};

const slice = createSlice({
  name: "onboarding",
  initialState,
  reducers: {
    toggleCondition: (s, a: PayloadAction<string>) => {
      const idx = s.conditions.indexOf(a.payload);
      if (idx >= 0) s.conditions.splice(idx, 1);
      else s.conditions.push(a.payload);
    },
    setEnergy: (s, a: PayloadAction<OnboardingAnswers["energyPattern"]>) => {
      s.energyPattern = a.payload;
    },
    setPrimaryUse: (
      s,
      a: PayloadAction<OnboardingAnswers["primaryUse"]>
    ) => {
      s.primaryUse = a.payload;
    },
    complete: (s) => {
      s.completed = true;
    },
  },
});

export const { toggleCondition, setEnergy, setPrimaryUse, complete } =
  slice.actions;

export default slice.reducer;
