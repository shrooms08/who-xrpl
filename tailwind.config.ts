import type { Config } from "tailwindcss";

// INK SYSTEM tokens mirrored from globals.css :root (single source = the vars).
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        card: "var(--card)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faded: "var(--faded)",
        hot: "var(--hot)",
        calm: "var(--calm)",
      },
      fontFamily: {
        display: ["var(--font-display)", "cursive"],
        body: ["var(--font-body)", "cursive"],
        utility: ["var(--font-utility)", "monospace"],
      },
      boxShadow: {
        ink: "var(--shadow-ink)",
        hero: "var(--shadow-hero)",
        hot: "var(--shadow-hot)",
      },
    },
  },
  plugins: [],
};

export default config;
