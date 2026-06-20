import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        charcoal: {
          50: "#f5f5f4",
          100: "#e7e5e4",
          700: "#34312d",
          800: "#27231f",
          900: "#181512",
          950: "#0f0d0b"
        },
        civic: {
          yellow: "#f3c533",
          amber: "#d99a17",
          red: "#b94545",
          green: "#2f8f62",
          orange: "#d2672a"
        }
      },
      fontFamily: {
        sans: ["var(--font-arabic)", "Tahoma", "Arial", "sans-serif"]
      },
      boxShadow: {
        panel: "0 16px 40px rgba(15, 13, 11, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
