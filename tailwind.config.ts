import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-poppins)", "ui-sans-serif", "system-ui"],
      },
      colors: {
        // Primary
        navy: "#1C1960",
        royal: "#322e9e",
        picton: "#56B9E9",
        ice: "#E9F6FF",
        // Secondary
        orange: "#E16036",
        gold: "#F3C969",
        cyan: "#4DFFF3",
        // Tertiary
        magenta: "#A11266",
        lavender: "#E3D9FF",
        charcoal: "#373637",
        mint: "#4DE7A6",
        // Semantic
        brand: {
          DEFAULT: "#1C1960",
          accent: "#56B9E9",
          soft: "#E9F6FF",
        },
      },
      boxShadow: {
        soft: "0 4px 24px -8px rgba(28,25,96,0.18)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
