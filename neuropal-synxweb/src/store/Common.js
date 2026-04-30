// App-wide constants — same shape as Synxweb's `src/store/Common.js`.
// Add things here that are global, immutable, and not tied to any tenant
// or session: country/locale defaults, app build version, error copy, etc.

export const defaultLocale = 'en-IN';
export const defaultTimezone = 'Asia/Kolkata';
export const supportEmail = 'support@neuropal.app';

// Reader defaults — hardcoded fallbacks if the saved tweaks ever fail to
// rehydrate from AsyncStorage. Mirrors the web prototype.
export const readerDefaults = {
    fontSize: 20,
    lineSpacing: 1.7,
    wpm: 225,
};
