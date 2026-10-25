#!/usr/bin/env node
// Full-page screenshots of the key pages at desktop and phone widths.
//   npm run serve &   then   npm run qa:shots -- [--out shots] [--all] [--skin classic|classic:light|signal:Concrete]
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { arg, EXTRA_PAGES, flag, launch, open, PAGES, VIEWPORTS } from "./qa-common.mjs";

const outDir = resolve(arg("out", "shots"));
mkdirSync(outDir, { recursive: true });
const pages = flag("all") ? [...PAGES, ...EXTRA_PAGES] : PAGES;

// Optional saved look, e.g. "classic", "classic:sepia", "signal:Concrete".
const skin = arg("skin", null);
function savedLook(spec) {
  const [s, variant] = spec.split(":");
  if (s === "classic") return { skin: "classic", classic: { theme: variant || "dark", accent: "ruby" } };
  return { skin: "signal", signal: variant ? { base: variant } : {} };
}
const suffix = skin ? `-${skin.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : "";

const browser = await launch();
let failed = false;
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: 1 });
    if (skin) {
      await context.addInitScript((value) => {
        try {
          localStorage.setItem("np.appearance.v1", value);
        } catch {
          /* storage blocked: default look */
        }
      }, JSON.stringify(savedLook(skin)));
    }
    for (const p of pages) {
      const { page, errors } = await open(context, p.path);
      // The page background is position: fixed (one viewport tall). For a
      // full-page capture, stretch it over the whole document, as a visitor
      // scrolling the page would see it.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.addStyleTag({ content: `.np-backdrop{position:absolute!important;bottom:auto!important;height:${height}px!important}` });
      const file = join(outDir, `${p.name}-${vp.name}${suffix}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      const overflow = width > vp.viewport.width;
      if (overflow || errors.length) failed = true;
      console.log(
        `${file}${overflow ? `  ✗ horizontal overflow: ${width}px` : ""}${errors.length ? `  ✗ errors: ${errors.join(" | ")}` : ""}`,
      );
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
