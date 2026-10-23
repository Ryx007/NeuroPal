#!/usr/bin/env node
// axe-core accessibility checks (WCAG 2.0/2.1 A + AA rules and best practices).
// Fails on any serious or critical violation.
//   npm run serve &   then   npm run qa:axe -- [--all]
import AxeBuilderModule from "@axe-core/playwright";
import { EXTRA_PAGES, flag, launch, open, PAGES, VIEWPORTS } from "./qa-common.mjs";

const AxeBuilder = AxeBuilderModule.default ?? AxeBuilderModule;
const pages = flag("all") ? [...PAGES, ...EXTRA_PAGES] : PAGES;

// Interactive states worth checking too: they render UI that isn't there on load.
const STATES = [
  {
    name: "appearance · fine-tune open + Pal proposal",
    path: "/appearance/",
    run: async (page) => {
      await page.getByRole("button", { name: /Fine-tune/ }).click();
      await page.getByLabel("Describe a change in your own words").fill("evening, round corners");
      await page.getByRole("button", { name: "Ask Pal" }).click();
      await page.getByRole("heading", { name: "Pal suggests" }).waitFor();
    },
  },
  {
    name: "appearance · Classic skin",
    path: "/appearance/",
    run: async (page) => {
      await page.getByRole("button", { name: /^Classic/ }).click();
      await page.waitForTimeout(300);
    },
  },
  {
    name: "interference · technical level + hint + answer",
    path: "/learn/interference/",
    run: async (page) => {
      await page.getByLabel(/Technical/).check();
      await page.getByLabel("They disappear.").check();
      await page.getByRole("button", { name: "Check my answer" }).click();
      await page.getByRole("button", { name: "Show a hint" }).click();
      await page.getByRole("button", { name: "Show the answer" }).click();
    },
  },
];

const browser = await launch();
let blocking = 0;
const report = async (label, page) => {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const minor = results.violations.filter((v) => !serious.includes(v));
  blocking += serious.length;
  console.log(
    `${serious.length ? "✗" : "✓"} ${label}: ${serious.length} serious/critical, ${minor.length} minor/moderate, ${results.passes.length} rules passed, ${results.incomplete.length} need review`,
  );
  for (const v of results.violations) {
    console.log(`   - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
    for (const n of v.nodes.slice(0, 4)) console.log(`       ${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(1, 3).join(" ")}`);
  }
  if (flag("verbose")) {
    for (const v of results.incomplete) {
      console.log(`   ? review ${v.id}: ${v.help} (${v.nodes.length})`);
      for (const n of v.nodes.slice(0, 3)) console.log(`       ${n.target.join(" ")} :: ${(n.any[0]?.message || "").slice(0, 140)}`);
    }
  }
};

try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: vp.viewport });
    for (const p of pages) {
      const { page } = await open(context, p.path);
      await report(`${p.name} @${vp.name}`, page);
      await page.close();
    }
    for (const s of STATES) {
      const { page } = await open(context, s.path);
      await s.run(page);
      await page.waitForTimeout(400);
      await report(`${s.name} @${vp.name}`, page);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(blocking ? `\n${blocking} serious/critical violation(s).` : "\nNo serious or critical violations.");
process.exit(blocking ? 1 : 0);
