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

// The next timed anchor still ahead of the clock (and not marked done).
// Falls back to the last of the day so the card never shows stale mocks.
export const selectNextAnchor = createSelector([selectAnchors], (anchors) => {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const pending = anchors.filter((a) => a.status !== "done");
  return (
    pending.find((a) => a.time.hour * 60 + a.time.minute >= nowMin) ||
    pending[pending.length - 1] ||
    null
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

export const selectReaderDoc = createSelector(
  [selectReaderState],
  (reader) => ({
    docId: reader.docId,
    sections: reader.docSections,
    loading: reader.docLoading,
    error: reader.docError,
  })
);

export const selectDocumentById = (state, id) =>
  state.library.docs.find((doc) => doc.id === id) || state.library.docs[0];
