import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="np-container np-page">
      <div className="np-section-head">
        <p className="np-label">404</p>
        <h1 className="np-display np-h1">Nothing here</h1>
        <p className="np-lead">This page doesn’t exist, or it has moved. Nothing is broken on your side.</p>
        <p>
          <Link href="/" className="np-btn">
            Go to the home page
          </Link>
        </p>
      </div>
    </div>
  );
}
