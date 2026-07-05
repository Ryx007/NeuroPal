// ─── App: routing + MUI theme + Redux + toast + dialog ───────────────
import React from 'react';
import { connect } from 'react-redux';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Box } from '@mui/material';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import theme from './theme';
import { DialogProvider } from './context/DialogContext';
import NavRail from './components/Shell/NavRail';
import TopBar from './components/Shell/TopBar';
import TweaksPanel from './components/Tweaks/TweaksPanel';
import Home from './routes/Home';
import Library from './routes/Library';
import Reader from './routes/Reader';
import StubRoute from './routes/StubRoute';

function AppBase({ tweaksOpen }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DialogProvider>
        <BrowserRouter>
          <Box sx={{ display: 'flex', height: '100vh', width: '100vw', bgcolor: 'background.default' }}>
            <NavRail />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <TopBar />
              <Box sx={{ flex: 1, overflow: 'hidden' }}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/library" element={<Library />} />
                  <Route path="/reader" element={<Reader />} />
                  <Route path="/anchors" element={<StubRoute />} />
                  <Route path="/state" element={<StubRoute />} />
                  <Route path="/chat" element={<StubRoute />} />
                </Routes>
              </Box>
            </Box>
            {tweaksOpen && <TweaksPanel />}
          </Box>
        </BrowserRouter>
        <ToastContainer
          position="bottom-right"
          autoClose={4000}
          theme="dark"
          toastStyle={{
            background: '#1f2020',
            color: '#e4e2e1',
            fontFamily: "'Inter', sans-serif",
            borderRadius: 14,
            border: '1px solid rgba(67,70,83,0.15)',
          }}
        />
      </DialogProvider>
    </ThemeProvider>
  );
}

const mapStateToProps = (state) => ({
  tweaksOpen: state.ui.tweaksOpen,
});

const App = connect(mapStateToProps)(AppBase);
export default App;
