import type { ReactNode } from "react";
import { SiteChrome } from "@/components/SiteChrome";

// The public site (landing, learning space, Make it yours, sign-in, privacy):
// the site header and footer around every page. The app at /app/ has its own.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
