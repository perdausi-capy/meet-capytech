import nextPlugin from "@next/eslint-plugin-next";

export default [
  // Global ignores must be a block of their own; inside another block they only scope that block.
  {
    ignores: [
      "next-env.d.ts",
      "*.tsbuildinfo",
      ".next/**",
      "drizzle/**",
      "coverage/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
