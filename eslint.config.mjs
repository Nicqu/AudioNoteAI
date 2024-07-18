import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import { fixupConfigRules } from "@eslint/compat";

export default [
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
  },
  {
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  ...fixupConfigRules(pluginReactConfig),
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    ignores: ["node_modules/", ".amplify/"],
  },
];
