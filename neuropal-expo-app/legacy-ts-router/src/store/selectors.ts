import { createSelector } from "@reduxjs/toolkit";

import type { RootState } from "@/store";

export const selectUiState = (state: RootState) => state.ui;
export const selectOnboardingState = (state: RootState) => state.onboarding;
export const selectHomeState = (state: RootState) => state.home;
export const selectLibraryState = (state: RootState) => state.library;
export const selectReaderState = (state: RootState) => state.reader;

export const selectOnboardingCompleted = (state: RootState) =>
  state.onboarding.completed;
export const selectTweaksOpen = (state: RootState) => state.ui.tweaksOpen;
export const selectDocuments = (state: RootState) => state.library.docs;
export const selectTasks = (state: RootState) => state.home.tasks;
export const selectAnchors = (state: RootState) => state.home.anchors;
export const selectNervousState = (state: RootState) =>
  state.home.nervousState;

export const selectRemainingTasks = createSelector([selectTasks], (tasks) =>
  tasks.filter((task) => !task.done).length
);

export const selectNextAnchor = createSelector([selectAnchors], (anchors) => {
  return (
    anchors.find((anchor) => anchor.status === "current") ??
    anchors.find((anchor) => anchor.status === "pending") ??
    anchors[anchors.length - 1]
  );
});

export const selectResumeDocument = createSelector(
  [selectDocuments],
  (docs) => docs.find((doc) => doc.progress > 0 && doc.progress < 1) ?? docs[0]
);

export const selectReaderMessages = (state: RootState) => state.reader.messages;
export const selectReaderPlayback = createSelector(
  [selectReaderState],
  (reader) => ({
    playing: reader.playing,
    wordIndex: reader.wordIndex,
    totalWords: reader.totalWords,
  })
);

export const selectDocumentById = (state: RootState, id?: string) =>
  state.library.docs.find((doc) => doc.id === id) ?? state.library.docs[0];
