import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "tsconfig.tsbuildinfo"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vite.config.ts"]
        },
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        WebSocket: "readonly",
        window: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error"
    }
  }
);
