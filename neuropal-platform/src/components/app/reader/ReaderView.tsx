"use client";

import { useSearchParams } from "next/navigation";

// SKELETON — replaced by the Library + Reader + Ask agent.
export function ReaderView() {
  const doc = useSearchParams().get("doc");
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title" className="np-display np-h1">
        Reader
      </h1>
      <p className="np-muted">{doc ? `Document ${doc}` : "No document chosen."}</p>
    </section>
  );
}
