/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a1020",
        panel: "#0f192e",
        edge: "#1a2540",
        accent: {
          DEFAULT: "#7dd3fc",
          soft: "#7dd3fc26",
        },
        violet: "#a78bfa",
      },
      backgroundImage: {
        hero: "var(--gradient-hero)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(125,211,252,0.18), 0 12px 36px -16px rgba(125,211,252,0.18)",
      },
    },
  },
  plugins: [],
};
