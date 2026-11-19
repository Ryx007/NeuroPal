import type { Metadata } from "next";
import { Suspense } from "react";
import { ReaderView } from "@/components/app/reader/ReaderView";

export const metadata: Metadata = { title: "Reader" };

// /app/read/?doc=<id> — a query parameter, because a static export can't
// pre-render one page per document. useSearchParams needs the Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReaderView />
    </Suspense>
  );
}
