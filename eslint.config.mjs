import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Statement text and amounts must never reach a log. Everything that
    // touches household data lives under src/, so the ban lives there.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
    },
  },
  {
    // Local diagnostic tooling — printing is the entire point.
    files: ["scripts/**/*.{ts,mjs}"],
    rules: {
      "no-console": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "test-fixtures/**"]),
]);

export default eslintConfig;
