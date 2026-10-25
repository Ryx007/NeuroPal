import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "shots/**",
    "next-env.d.ts",
    // Generated from packages/tokens by scripts/sync.js — never edited here.
    "src/lib/tokens/**",
  ]),
]);

export default eslintConfig;
