// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["out/**", "node_modules/**", "coverage/**", ".vscode-test/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // esbuild.js 是 CJS 构建脚本，允许 require/process 等 Node 全局
    files: ["esbuild.js"],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      // spec 约定：严格模式，禁 any
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  prettierConfig,
);
