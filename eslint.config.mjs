import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier/flat";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  eslintConfigPrettier,
];

export default config;
