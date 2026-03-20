import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginPrettier from "eslint-plugin-prettier";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "frontend/", "bots/", "coverage/"],
  },
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["src/**/*.ts"],
    plugins: {
      prettier: eslintPluginPrettier,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_|^error$",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
