import { createTheme } from '@mui/material/styles';
import { ACCENTS, FONT_STACKS, THEME_MODES } from './tokens';

export function buildAppTheme({ theme = 'dark', accent = 'blue' } = {}) {
  const modeTokens = THEME_MODES[theme] || THEME_MODES.dark;
  const accentTokens = ACCENTS[accent] || ACCENTS.blue;

  return createTheme({
    palette: {
      mode: modeTokens.paletteMode,
      background: {
        default: modeTokens.surface,
        paper: modeTokens.surfaceContainer,
      },
      primary: {
        main: accentTokens.main,
        dark: accentTokens.dark,
        contrastText: accentTokens.contrastText,
      },
      secondary: {
        main: modeTokens.secondary,
        dark: modeTokens.secondaryDark,
        contrastText: modeTokens.surfaceLowest,
      },
      error: {
        main: modeTokens.error,
        dark: modeTokens.errorDark,
      },
      warning: {
        main: modeTokens.warning,
      },
      info: {
        main: modeTokens.tertiary,
        dark: modeTokens.tertiaryDark,
      },
      text: {
        primary: modeTokens.textPrimary,
        secondary: modeTokens.textSecondary,
        disabled: modeTokens.textDisabled,
      },
      divider: modeTokens.outlineSoft,
    },
    typography: {
      fontFamily: FONT_STACKS.body,
      h1: { fontFamily: FONT_STACKS.display, fontWeight: 600, letterSpacing: '-0.03em' },
      h2: { fontFamily: FONT_STACKS.display, fontWeight: 600, letterSpacing: '-0.02em' },
      h3: { fontFamily: FONT_STACKS.display, fontWeight: 600, letterSpacing: '-0.02em' },
      h4: { fontFamily: FONT_STACKS.display, fontWeight: 600, letterSpacing: '-0.02em' },
      h5: { fontFamily: FONT_STACKS.display, fontWeight: 600 },
      h6: { fontFamily: FONT_STACKS.display, fontWeight: 600 },
      body1: { fontFamily: FONT_STACKS.body, fontSize: '0.9375rem' },
      body2: { fontFamily: FONT_STACKS.body, fontSize: '0.8125rem' },
      button: { fontFamily: FONT_STACKS.display, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' },
      caption: { fontFamily: FONT_STACKS.mono, fontSize: '0.6875rem', letterSpacing: '0.14em' },
      overline: { fontFamily: FONT_STACKS.mono, fontSize: '0.625rem', letterSpacing: '0.18em' },
    },
    shape: {
      borderRadius: 14,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            '--np-surface': modeTokens.surface,
            '--np-surface-low': modeTokens.surfaceLow,
            '--np-surface-container': modeTokens.surfaceContainer,
            '--np-surface-high': modeTokens.surfaceHigh,
            '--np-surface-highest': modeTokens.surfaceHighest,
            '--np-surface-lowest': modeTokens.surfaceLowest,
            '--np-on-surface': modeTokens.textPrimary,
            '--np-on-surface-variant': modeTokens.textSecondary,
            '--np-outline': modeTokens.outline,
            '--np-outline-soft': modeTokens.outlineSoft,
            '--np-primary': accentTokens.main,
            '--np-primary-strong': accentTokens.dark,
            '--np-on-primary': accentTokens.contrastText,
            '--np-secondary': modeTokens.secondary,
            '--np-tertiary': modeTokens.tertiary,
            '--np-warn': modeTokens.warning,
            '--np-error': modeTokens.error,
            '--np-font-display': FONT_STACKS.display,
            '--np-font-body': FONT_STACKS.body,
            '--np-font-mono': FONT_STACKS.mono,
          },
          body: {
            backgroundColor: modeTokens.surface,
            backgroundImage: `radial-gradient(circle at top right, ${accentTokens.soft} 0%, transparent 32%)`,
            color: modeTokens.textPrimary,
            fontFamily: FONT_STACKS.body,
          },
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
            background: `linear-gradient(135deg, ${accentTokens.main} 0%, ${accentTokens.dark} 100%)`,
            color: accentTokens.contrastText,
            boxShadow: `0 0 0 1px ${accentTokens.soft}, 0 8px 32px -8px ${accentTokens.soft}`,
            '&:hover': {
              background: `linear-gradient(135deg, ${accentTokens.main} 0%, ${accentTokens.dark} 100%)`,
              transform: 'translateY(-1px)',
            },
          },
          outlined: {
            borderColor: modeTokens.outlineSoft,
            color: accentTokens.main,
            '&:hover': {
              background: accentTokens.soft,
              borderColor: accentTokens.main,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: modeTokens.surfaceContainer,
            border: `1px solid ${modeTokens.outlineSoft}`,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            backgroundImage: 'none',
            backgroundColor: modeTokens.surfaceLow,
            border: `1px solid ${modeTokens.outlineSoft}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            fontFamily: FONT_STACKS.display,
            fontWeight: 500,
          },
        },
      },
      MuiSlider: {
        styleOverrides: {
          root: {
            color: accentTokens.main,
            height: 4,
          },
          thumb: {
            width: 18,
            height: 18,
            boxShadow: `0 0 0 4px ${modeTokens.surfaceContainer}, 0 0 12px ${accentTokens.soft}`,
          },
          track: {
            background: `linear-gradient(90deg, ${accentTokens.main}, ${accentTokens.dark})`,
            border: 'none',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: modeTokens.surfaceHigh,
            fontFamily: FONT_STACKS.mono,
            fontSize: 11,
            borderRadius: 8,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            color: modeTokens.textSecondary,
            '&:hover': { backgroundColor: accentTokens.soft },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            fontFamily: FONT_STACKS.display,
            fontWeight: 500,
            textTransform: 'none',
            minWidth: 'auto',
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            height: 3,
            backgroundColor: modeTokens.outlineSoft,
          },
          bar: { borderRadius: 999 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: modeTokens.surfaceContainer,
            backgroundImage: 'none',
            borderRadius: 24,
            border: `1px solid ${modeTokens.outlineSoft}`,
          },
        },
      },
    },
  });
}
