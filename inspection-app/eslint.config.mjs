import coreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * ESLint 9 takes its configuration as a flat array. `next lint` no longer
 * exists in Next 16, so `npm run lint` calls eslint directly.
 */
const config = [
  { ignores: ["node_modules/**", ".next/**", "prototype/**", "core/**"] },
  ...coreWebVitals,
];

export default config;
