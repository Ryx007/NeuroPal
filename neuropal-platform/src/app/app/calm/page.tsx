import type { Metadata } from "next";
import { CalmView } from "@/components/app/calm/CalmView";

export const metadata: Metadata = { title: "Calming steps" };

export default function Page() {
  return <CalmView />;
}
