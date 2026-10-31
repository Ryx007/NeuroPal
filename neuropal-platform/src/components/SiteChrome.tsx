import type { ReactNode } from "react";
import { Backdrop } from "@/components/Backdrop";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/** Skip link, backdrop, header and footer of the public site. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="np-skip" href="#main">
        Skip to content
      </a>
      <Backdrop />
      <div className="np-shell">
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
