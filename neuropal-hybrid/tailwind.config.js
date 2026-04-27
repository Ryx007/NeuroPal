/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Clinical Visionary palette — mirror of the Flutter NpPalette and
      // the source DESIGN.md tokens. Surface tiers are expressed via
      // HSL-like hex so NativeWind's alpha-compose works cleanly:
      //   className="bg-surface/70"
      colors: {
        surface: "#131313",
        "surface-low": "#1B1C1C",
        "surface-container": "#1F2020",
        "surface-high": "#2A2A2A",
        "surface-highest": "#353535",
        "surface-lowest": "#0E0E0E",
        "on-surface": "#E4E2E1",
        "on-surface-variant": "#C3C6D6",
        outline: "#8D909F",
        "outline-variant": "#434653",
        primary: "#B1C5FF",
        "primary-container": "#0051C3",
        "on-primary": "#002C71",
        secondary: "#A6E6FF",
        tertiary: "#D6BAFF",
        error: "#FFB4AB",
        warn: "#FFD27A",
      },
      fontFamily: {
        display: ["SpaceGrotesk_600SemiBold", "system-ui"],
        "display-bold": ["SpaceGrotesk_700Bold", "system-ui"],
        body: ["Inter_400Regular", "system-ui"],
        "body-medium": ["Inter_500Medium", "system-ui"],
        "body-semibold": ["Inter_600SemiBold", "system-ui"],
        mono: ["JetBrainsMono_400Regular", "ui-monospace"],
        atkinson: ["AtkinsonHyperlegible_400Regular"],
        "atkinson-bold": ["AtkinsonHyperlegible_700Bold"],
        lora: ["Lora_400Regular"],
        fraunces: ["Fraunces_400Regular"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "18px",
        "2xl": "22px",
        "3xl": "28px",
      },
    },
  },
  plugins: [],
};
