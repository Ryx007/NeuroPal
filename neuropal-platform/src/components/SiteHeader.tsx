"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./chrome.module.css";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/learn/", label: "Learn" },
  { href: "/appearance/", label: "Make it yours" },
  { href: "/sign-in/", label: "Sign in" },
];

const norm = (p: string) => p.replace(/\/+$/, "") || "/";

export function SiteHeader() {
  const path = norm(usePathname() || "/");
  return (
    <header className={styles.header}>
      <div className={`np-container ${styles.headerRow}`}>
        <Link href="/" className={styles.wordmark}>
          <span className="np-led" aria-hidden="true" />
          <span className={styles.wordmarkText}>NeuroPal</span>
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          <ul className={styles.navList}>
            {NAV.map((item) => {
              const target = norm(item.href);
              const exact = path === target;
              const inSection = !exact && target !== "/" && path.startsWith(`${target}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.navLink} ${exact || inSection ? styles.navActive : ""}`}
                    aria-current={exact ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
