import React, { useMemo } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

import { usePalette, useTheme as useNpTheme } from "@/theme/ThemeProvider";

export function MuiProvider({ children }: { children: React.ReactNode }) {
  const palette = usePalette();
  const npTheme = useNpTheme();

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: npTheme.isLight ? "light" : "dark",
          primary: {
            main: palette.primary,
            dark: palette.primaryContainer,
            contrastText: palette.onPrimary,
          },
          secondary: {
            main: palette.secondary,
          },
          warning: {
            main: palette.warn,
          },
          error: {
            main: palette.error,
          },
          info: {
            main: palette.tertiary,
          },
          background: {
            default: palette.surface,
            paper: palette.surfaceContainer,
          },
          text: {
            primary: palette.onSurface,
            secondary: palette.onSurfaceVariant,
          },
          divider: palette.outlineVariant,
        },
        shape: {
          borderRadius: 18,
        },
        typography: {
          fontFamily: "Inter, system-ui, sans-serif",
          h1: {
            fontFamily: "Space Grotesk, Inter, sans-serif",
            fontWeight: 700,
            letterSpacing: "-0.04em",
          },
          h2: {
            fontFamily: "Space Grotesk, Inter, sans-serif",
            fontWeight: 700,
            letterSpacing: "-0.03em",
          },
          h3: {
            fontFamily: "Space Grotesk, Inter, sans-serif",
            fontWeight: 700,
          },
          button: {
            fontFamily: "Space Grotesk, Inter, sans-serif",
            textTransform: "none",
            fontWeight: 600,
          },
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                backgroundColor: palette.surface,
                color: palette.onSurface,
              },
            },
          },
          MuiDrawer: {
            styleOverrides: {
              paper: {
                backgroundImage: "none",
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 14,
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                borderRadius: 12,
              },
            },
          },
        },
      }),
    [npTheme.isLight, palette]
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
