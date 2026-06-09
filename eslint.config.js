import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Config ciblée sur les règles des hooks React. Les deux règles sont en
// erreur : rules-of-hooks (crash runtime) et exhaustive-deps (fraîcheur des
// données). Les quelques effets volontairement non exhaustifs portent un
// commentaire eslint-disable justifié sur place.
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      "node_modules/**",
      "scripts/**",
      "**/*.config.{js,ts}",
      "src/lib/db/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  }
);
