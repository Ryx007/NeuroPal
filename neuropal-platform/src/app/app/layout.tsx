import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = {
  title: { default: "NeuroPal", template: "%s · NeuroPal" },
  // The app is personal: never indexed.
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
