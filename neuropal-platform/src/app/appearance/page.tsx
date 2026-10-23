import type { Metadata } from "next";
import { AppearanceStudio } from "@/components/studio/AppearanceStudio";

export const metadata: Metadata = {
  title: "Make it yours",
  description:
    "Choose Classic or Signal, start from a vibe, fine-tune eight settings, or ask Pal: every change shows in a preview first and can be undone.",
};

export default function AppearancePage() {
  return <AppearanceStudio />;
}
