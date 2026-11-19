import type { Metadata } from "next";
import { Suspense } from "react";
import { PalView } from "@/components/app/pal/PalView";

export const metadata: Metadata = { title: "Pal" };

// /app/pal/?tool=talk — the open tool is a query parameter (a static export
// can't pre-render one page per tool). useSearchParams needs the Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PalView />
    </Suspense>
  );
}
