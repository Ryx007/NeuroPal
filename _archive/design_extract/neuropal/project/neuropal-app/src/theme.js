// ─── MUI theme: Clinical Visionary ───────────────────────────────────
// Maps the NeuroPal design tokens to MUI's theme structure so every
// MUI component inherits the right colors, typography, and shapes.

import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#131313',
      paper: '#1f2020',
    },
    primary: {
      main: '#b1c5ff',
      dark: '#0051c3',
      contrastText: '#002c71',
    },
    secondary: {
      main: '#a6e6ff',
      dark: '#0faebe',
      contrastText: '#003543',
    },
    error: {
      main: '#ffb4ab',
      dark: '#b95463',
    },
    warning: {
      main: '#ffd27a',
    },
    info: {
      main: '#d6baff',
      dark: '#722ccf',
    },
    text: {
      primary: '#e4e2e1',
      secondary: '#c3c6d6',
      disabled: '#8d909f',
    },
    divider: 'rgba(67, 70, 83, 0.20)',
  },
  typography: {
    fontFamily: "'Inter', system-ui, sans-serif",
    h1: { fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 600, letterSpacing: '-0.03em' },
    h2: { fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 600, letterSpacing: '-0.02em' },
    h3: { fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 600, letterSpacing: '-0.02em' },
    h4: { fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 600, letterSpacing: '-0.02em' },
    h5: { fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 600 },
    h6: { fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 600 },
    subtitle1: { fontFamily: "'Inter', system-ui, sans-serif" },
    subtitle2: { fontFamily: "'Inter', system-ui, sans-serif" },
    body1: { fontFamily: "'Inter', system-ui, sans-serif", fontSize: '0.9375rem' },
    body2: { fontFamily: "'Inter', system-ui, sans-serif", fontSize: '0.8125rem' },
    button: { fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' },
    caption: { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '0.6875rem', letterSpacing: '0.14em' },
    overline: { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '0.625rem', letterSpacing: '0.18em' },
  },
  shape: {
    borderRadius: 14,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#131313' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          padding: '10px 20px',
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #b1c5ff 0%, #0051c3 100%)',
          color: '#002c71',
          boxShadow: '0 0 0 1px rgba(177,197,255,0.3), 0 8px 32px -8px rgba(177,197,255,0.25)',
          '&:hover': {
            background: 'linear-gradient(135deg, #c3d4ff 0%, #0060e0 100%)',
            boxShadow: '0 0 0 1px rgba(177,197,255,0.5), 0 12px 40px -8px rgba(177,197,255,0.25)',
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderColor: 'rgba(67,70,83,0.25)',
          color: '#b1c5ff',
          '&:hover': {
            background: 'rgba(177,197,255,0.08)',
            borderColor: 'rgba(177,197,255,0.3)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(67,70,83,0.12)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          backgroundImage: 'none',
          border: '1px solid rgba(67,70,83,0.12)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontWeight: 500,
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: '#b1c5ff',
          height: 4,
        },
        thumb: {
          width: 18,
          height: 18,
          boxShadow: '0 0 0 4px rgba(31,32,32,0.8), 0 0 12px rgba(177,197,255,0.25)',
        },
        track: {
          background: 'linear-gradient(90deg, #b1c5ff, #0051c3)',
          border: 'none',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#2a2a2a',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          borderRadius: 8,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          color: '#c3c6d6',
          '&:hover': { backgroundColor: 'rgba(177,197,255,0.08)' },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontWeight: 500,
          textTransform: 'none',
          minWidth: 'auto',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 999, height: 3, backgroundColor: 'rgba(67,70,83,0.3)' },
        bar: { borderRadius: 999 },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1f2020',
          backgroundImage: 'none',
          borderRadius: 24,
          border: '1px solid rgba(67,70,83,0.15)',
        },
      },
    },
  },
});

export default theme;
