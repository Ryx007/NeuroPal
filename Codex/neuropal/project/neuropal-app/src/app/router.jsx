import React from 'react';
import { Route, Routes } from 'react-router-dom';
import HomePage from '../features/home/HomePage';
import LibraryPage from '../features/library/LibraryPage';
import ReaderPage from '../features/reader/ReaderPage';
import StubRoutePage from '../features/stub/StubRoutePage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/reader" element={<ReaderPage />} />
      <Route path="/anchors" element={<StubRoutePage />} />
      <Route path="/state" element={<StubRoutePage />} />
      <Route path="/chat" element={<StubRoutePage />} />
    </Routes>
  );
}
