import React, { useMemo } from 'react';
import { Provider, useSelector } from 'react-redux';
import { CssBaseline, ThemeProvider } from '@mui/material';
import store from './store';
import { DialogProvider } from '../providers/DialogProvider';
import { selectAccent, selectThemeMode } from '../features/ui/selectors';
import { buildAppTheme } from '../theme';

function ThemeRegistry({ children }) {
  const themeMode = useSelector(selectThemeMode);
  const accent = useSelector(selectAccent);
  const theme = useMemo(
    () => buildAppTheme({ theme: themeMode, accent }),
    [accent, themeMode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export default function AppProviders({ children }) {
  return (
    <Provider store={store}>
      <ThemeRegistry>
        <DialogProvider>{children}</DialogProvider>
      </ThemeRegistry>
    </Provider>
  );
}
