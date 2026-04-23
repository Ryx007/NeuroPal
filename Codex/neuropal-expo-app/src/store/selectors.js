import { createSelector } from "@reduxjs/toolkit";

export const selectUiState = (state) => state.ui;
export const selectOnboardingState = (state) => state.onboarding;
export const selectHomeState = (state) => state.home;
export const selectLibraryState = (state) => state.library;
export const selectReaderState = (state) => state.reader;

export const selectOnboardingCompleted = (state) =>
  state.onboarding.completed;
export const selectTweaksOpen = (state) => state.ui.tweaksOpen;
export const selectDocuments = (state) => state.library.docs;
export const selectTasks = (state) => state.home.tasks;
export const selectAnchors = (state) => state.home.anchors;
export const selectNervousState = (state) => state.home.nervousState;
export const selectReaderMessages = (state) => state.reader.messages;
export const selectReaderAsking = (state) => state.reader.asking;

export const selectRemainingTasks = createSelector([selectTasks], (tasks) =>
  tasks.filter((task) => !task.done).length
);

export const selectNextAnchor = createSelector([selectAnchors], (anchors) => {
  return (
    anchors.find((anchor) => anchor.status === "current") ||
    anchors.find((anchor) => anchor.status === "pending") ||
    anchors[anchors.length - 1]
  );
});

export const selectResumeDocument = createSelector([selectDocuments], (docs) => {
  return docs.find((doc) => doc.progress > 0 && doc.progress < 1) || docs[0];
});

export const selectReaderPlayback = createSelector(
  [selectReaderState],
  (reader) => ({
    playing: reader.playing,
    wordIndex: reader.wordIndex,
    totalWords: reader.totalWords,
  })
);

export const selectDocumentById = (state, id) =>
  state.library.docs.find((doc) => doc.id === id) || state.library.docs[0];
