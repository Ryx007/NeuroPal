// Shared helpers for the QA scripts (screenshots, axe).
// Uses playwright-core with an already-installed Chromium. On a fresh
// machine run `npx playwright install chromium` once (or set
// PLAYWRIGHT_BROWSERS_PATH to an existing browser folder).
import { chromium } from "playwright-core";

export const SITE_URL = (process.env.SITE_URL || "http://127.0.0.1:4321").replace(/\/+$/, "");

export const PAGES = [
  { name: "home", path: "/" },
  { name: "interference", path: "/learn/interference/" },
  { name: "appearance", path: "/appearance/" },
];

export const EXTRA_PAGES = [
  { name: "learn", path: "/learn/" },
  { name: "sign-in", path: "/sign-in/" },
  { name: "privacy", path: "/privacy/" },
];

export const VIEWPORTS = [
  { name: "1440", viewport: { width: 1440, height: 900 } },
  { name: "390", viewport: { width: 390, height: 844 } },
];

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export const flag = (name) => process.argv.includes(`--${name}`);

export function launch() {
  return chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
}

/** Open a page and wait until fonts and the first frames have settled. */
export async function open(context, path) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${SITE_URL}${path}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  return { page, errors };
}
