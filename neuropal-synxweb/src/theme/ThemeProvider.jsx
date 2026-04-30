import React, { createContext, useContext, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { DEFAULT_PALETTE, resolvePalette } from './palette';

// Reads the live tweaks out of the single configSlice and exposes the
// resolved palette + reader-typography tokens through React Context. Pages
// pull from this with `useTheme()` / `usePalette()`.
//
// The web Synxweb app uses MUI's <ThemeProvider> for the same role —
// `createTheme({ palette: { primary: { main: themeColor }}})`. On RN we
// build our own so we don't fight the absence of MUI Material.

const ThemeContext = createContext({
    palette: DEFAULT_PALETTE,
    readerFontFamily: 'Inter_400Regular',
    readerFontSize: 20,
    readerLineHeight: 1.7,
    readerExtraLetterSpacing: false,
    isLight: false,
});

function fontFor(f) {
    switch (f) {
        case 'inter':
            return 'Inter_400Regular';
        case 'atkinson':
        case 'dyslexic':
            return 'AtkinsonHyperlegible_400Regular';
        case 'lora':
            return 'Lora_400Regular';
        case 'fraunces':
            return 'Fraunces_400Regular';
        default:
            return 'Inter_400Regular';
    }
}

export const ThemeProvider = ({ children }) => {
    const tweaks = useSelector((s) => ({
        theme: s.configs.theme,
        accent: s.configs.accent,
        readerFont: s.configs.readerFont,
        fontSize: s.configs.fontSize,
        lineSpacing: s.configs.lineSpacing,
    }));

    const value = useMemo(() => {
        const palette = resolvePalette(tweaks.theme, tweaks.accent);
        return {
            palette,
            readerFontFamily: fontFor(tweaks.readerFont),
            readerFontSize: tweaks.fontSize,
            readerLineHeight: tweaks.lineSpacing,
            readerExtraLetterSpacing: tweaks.readerFont === 'dyslexic',
            isLight:
                tweaks.theme === 'light' || tweaks.theme === 'sepia',
        };
    }, [
        tweaks.theme,
        tweaks.accent,
        tweaks.readerFont,
        tweaks.fontSize,
        tweaks.lineSpacing,
    ]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
export const usePalette = () => useContext(ThemeContext).palette;
