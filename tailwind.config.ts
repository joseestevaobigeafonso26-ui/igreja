import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { terracotta: "#C84B23", "terracotta-dark": "#A33716", gold: "#FACC15", dark: "#18181B", charcoal: "#27272A" },
      },
    },
  },
} satisfies Config;
