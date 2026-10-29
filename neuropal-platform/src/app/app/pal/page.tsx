import type { Metadata } from "next";
import { PalView } from "@/components/app/pal/PalView";

export const metadata: Metadata = { title: "Pal" };

export default function Page() {
  return <PalView />;
}
