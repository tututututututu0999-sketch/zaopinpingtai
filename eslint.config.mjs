import nextPlugin from "@next/eslint-plugin-next";

export default [
  { ignores: [".next/**", "node_modules/**", ".data/**"] },
  { plugins: { "@next/next": nextPlugin }, rules: { ...nextPlugin.configs.recommended.rules } },
];
