import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#141433",
        slate: "#2b2b52",
        sky: "#3aa7e0",
        teal: "#19b8a6",
        lime: "#5fc44a",
        amber: "#e8a33d",
        coral: "#e2603f",
        plum: "#8b5cf6",
      },
    },
  },
  plugins: [],
};

export default config;
