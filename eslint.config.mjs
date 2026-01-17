import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  // Global ignores
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/*.d.ts"],
  },

  // Base configuration
  js.configs.recommended,

  // TypeScript configuration
  ...tseslint.configs.recommended,

  // React configuration for frontend
  {
    files: ["packages/frontend/**/*.{ts,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
    },
  },

  // Backend configuration
  {
    files: ["packages/backend/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Shared configuration
  {
    files: ["packages/shared/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Common TypeScript rules
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },

  // Prettier config (disables conflicting rules)
  eslintConfigPrettier
);
