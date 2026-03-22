import type { Config } from "tailwindcss";

export default {
  content: ["./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0d0f1a",
          panel: "#131625",
          elevated: "#1a1d35",
          border: "#1e2240",
          border2: "#252848",
        },
        text: {
          base: "#ecf0f4",
          muted: "#8a96b0",
          dim: "#4a5270",
        },
        purple: { DEFAULT: "#b3a1e6", bright: "#c678dd" },
        pink:   { DEFAULT: "#ce6f8f" },
        green:  { DEFAULT: "#5ccc96", bright: "#98c379" },
        orange: { DEFAULT: "#e39400", bright: "#d19965" },
        blue:   { DEFAULT: "#00a3cc", bright: "#61afef" },
        cyan:   { DEFAULT: "#42b3c2", bright: "#56b6c2" },
        yellow: { DEFAULT: "#f2ce00", bright: "#e5c07b" },
        red:    { DEFAULT: "#e06c75" },
      },
      fontFamily: {
        mono: ["Hack NF", "Fira Code", "Cascadia Code", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
