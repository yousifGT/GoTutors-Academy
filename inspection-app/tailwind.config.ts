import type { Config } from "tailwindcss";

/** GoTutors brand: navy #1C1960, sky #57B9EA, Poppins — as in the prototype. */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#1C1960", 50: "#EDECF5", 700: "#171450", 900: "#0F0D33" },
        sky: { DEFAULT: "#57B9EA", 50: "#EAF6FD", 600: "#3AA3D9" },
        pass: "#2f855a",
        warn: "#c07d10",
        fail: "#c0392b",
      },
      fontFamily: { sans: ["var(--font-poppins)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
