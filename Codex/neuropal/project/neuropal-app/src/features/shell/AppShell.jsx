import React from 'react';
import { Box } from '@mui/material';
import { useSelector } from 'react-redux';
import { AppRouter } from '../../app/router';
import { selectTweaksOpen } from '../ui/selectors';
import NavRail from './components/NavRail';
import TopBar from './components/TopBar';
import TweaksPanel from '../ui/components/TweaksPanel';

export default function AppShell() {
  const tweaksOpen = useSelector(selectTweaksOpen);

  return (
    <Box className="flex h-screen w-screen overflow-hidden bg-[var(--np-surface)] text-[var(--np-on-surface)]">
      <NavRail />
      <Box className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[76px] md:pb-0">
        <TopBar />
        <Box className="flex-1 overflow-hidden">
          <AppRouter />
        </Box>
      </Box>
      {tweaksOpen && <TweaksPanel />}
    </Box>
  );
}
