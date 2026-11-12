import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat ESLint config for the monorepo. It intentionally stays close to the
 * recommended sets: the goal is to catch real defects (unused code, unsafe
 * constructs, hook mistakes) without imposing stylistic rules that Prettier/TS
 * already cover.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/*.d.ts",
      // Root `src/` is the legacy Vite prototype kept for reference; the live
      // app lives in `web` and is the only frontend built by CI.
      "src/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Only the two stable hook rules. The React Compiler rules bundled in
      // v7 flag patterns that would require a broader frontend refactor, out
      // of scope for the backend hardening block.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // TypeScript already resolves identifiers; `no-undef` reports false
      // positives for Node/DOM globals and JSX runtime symbols.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // `any` is a useful escape hatch at integration boundaries (Mongo lean
      // documents, vendor payloads); keep it visible instead of blocking.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["api/scripts/**/*.mjs"],
    rules: { "no-undef": "off" },
  },
);
