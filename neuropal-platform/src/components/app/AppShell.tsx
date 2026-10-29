"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SignInPanel } from "@/components/signin/SignInPanel";
import { useAppSession } from "@/lib/neuropal/session";
import styles from "./shell.module.css";

// The web app's frame: a sidebar on wide screens, a bottom bar on narrow
// ones, the calming steps always one click away (and usable signed out).
// SKELETON — owned by the shell agent.

const NAV = [
  { href: "/app/", label: "Home" },
  { href: "/app/library/", label: "Library" },
  { href: "/app/pal/", label: "Pal" },
  { href: "/app/settings/", label: "Settings" },
];

const norm = (p: string) => p.replace(/\/+$/, "") || "/";

export function AppShell({ children }: { children: ReactNode }) {
  const path = norm(usePathname() || "/app");
  const { ready, signedIn } = useAppSession();
  const calm = path === "/app/calm";

  return (
    <div className={styles.shell}>
      <a className="np-skip" href="#app-main">
        Skip to content
      </a>
      <nav aria-label="App" className={styles.nav}>
        <Link href="/app/" className={styles.wordmark}>
          <span className="np-led" aria-hidden="true" />
          NeuroPal
        </Link>
        <ul className={styles.navList}>
          {NAV.map((item) => {
            const target = norm(item.href);
            const active = path === target || (target === "/app/library" && path === "/app/read");
            return (
              <li key={item.href}>
                <Link href={item.href} className={styles.navLink} aria-current={active ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href="/app/calm/" className={`np-btn ${styles.calm}`}>
          Calming steps
        </Link>
      </nav>
      <main id="app-main" tabIndex={-1} className={styles.main}>
        {!ready ? null : signedIn || calm ? (
          children
        ) : (
          <div className={styles.signIn}>
            <h1 className="np-display np-h1">Sign in to NeuroPal</h1>
            <SignInPanel />
          </div>
        )}
      </main>
    </div>
  );
}
