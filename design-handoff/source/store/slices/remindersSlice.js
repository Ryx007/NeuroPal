import { createSlice } from "@reduxjs/toolkit";

// Reminders: [{ id, title, at (epoch ms), notificationId, done }]

const initialState = {
  items: [],
};

const remindersSlice = createSlice({
  name: "reminders",
  initialState,
  reducers: {
    hydrateReminders(state, action) {
      if (Array.isArray(action.payload?.items)) {
        state.items = action.payload.items;
      }
    },
    addReminder(state, action) {
      state.items.push(action.payload);
      state.items.sort((a, b) => a.at - b.at);
    },
    removeReminder(state, action) {
      state.items = state.items.filter((r) => r.id !== action.payload);
    },
    toggleReminderDone(state, action) {
      const item = state.items.find((r) => r.id === action.payload);
      if (item) item.done = !item.done;
    },
  },
});

export const {
  hydrateReminders,
  addReminder,
  removeReminder,
  toggleReminderDone,
} = remindersSlice.actions;

export default remindersSlice.reducer;
