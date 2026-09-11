import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#20242B",
        paper: "#EEF3FA",
        navy: {
          50: "#EEF1F6",
          100: "#D6DCE8",
          400: "#41547E",
          600: "#28365A",
          700: "#1E2A47",
          900: "#141C31",
        },
        gold: {
          100: "#F3E4C2",
          400: "#C08829",
          600: "#9C6B18",
        },
        moss: {
          100: "#DCEADF",
          500: "#3F7D58",
          700: "#2C5940",
        },
        rust: {
          100: "#F1DAD3",
          500: "#A6432D",
          700: "#7C3120",
        },
        line: "#DEDBD3",
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
