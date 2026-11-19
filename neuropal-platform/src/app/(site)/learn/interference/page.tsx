import type { Metadata } from "next";
import { InterferenceLesson } from "@/components/lesson/InterferenceLesson";

export const metadata: Metadata = {
  title: "Two-source interference",
  description:
    "An interactive lesson: two sets of ripples, a live ripple tank you control, the same physics at three depths, and a hint-first check.",
};

export default function InterferencePage() {
  return <InterferenceLesson />;
}
