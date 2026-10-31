import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import {
  Archivo,
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  Inter,
  JetBrains_Mono,
  Space_Grotesk,
} from "next/font/google";
import "@/styles/tokens.css";
import "./globals.css";
import { AppearanceProvider } from "@/components/AppearanceProvider";
import { NO_FLASH_SCRIPT } from "@/lib/noFlash";

// Signal type: Archivo (variable width axis), Atkinson Hyperlegible Next and Mono.
const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
// next/font has no fallback metrics for the Atkinson families yet.
const atkinsonNext = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson-next",
  display: "swap",
  adjustFontFallback: false,
});
const atkinsonMono = Atkinson_Hyperlegible_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson-mono",
  display: "swap",
  adjustFontFallback: false,
});
// Classic type (and Signal's "Grotesk" option): loaded only when used.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap", preload: false });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", preload: false });

const fontVars = [archivo, atkinsonNext, atkinsonMono, spaceGrotesk, inter, jetbrains].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: {
    default: "NeuroPal · Read it. Hear it. Ask it.",
    template: "%s · NeuroPal",
  },
  description:
    "NeuroPal reads your papers and books aloud with each word highlighted, answers questions from the document itself, and hosts a science learning space built for every kind of mind.",
  applicationName: "NeuroPal",
};

export const viewport: Viewport = {
  themeColor: "#141416",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body>
        {/* The site's pages ((site)/layout.tsx) and the app (app/layout.tsx)
            each bring their own chrome; both share the look. */}
        <AppearanceProvider>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
