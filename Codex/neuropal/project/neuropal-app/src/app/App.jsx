import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import AppShell from '../features/shell/AppShell';

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
      <ToastContainer
        position="bottom-right"
        autoClose={4000}
        theme="dark"
        toastStyle={{
          background: 'var(--np-surface-container)',
          color: 'var(--np-on-surface)',
          fontFamily: "'Inter', sans-serif",
          borderRadius: 14,
          border: '1px solid var(--np-outline-soft)',
        }}
      />
    </BrowserRouter>
  );
}
