/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Lexend", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        primary: {
          DEFAULT: "#111827", // gray-900 — professional black, for buttons/CTAs
          light: "#374151",
          dark: "#000000",
          50: "#f9fafb",
          100: "#f3f4f6",
        },
        brand: {
          DEFAULT: "#2563eb", // blue-600 — the light theme's accent for links/badges/active states
          light: "#3b82f6",
          dark: "#1d4ed8",
          50: "#eff6ff",
          100: "#dbeafe",
        },
        accent: {
          DEFAULT: "#f59e0b",
          dark: "#d97706",
        },
        success: "#16a34a",
        danger: "#dc2626",
        surface: "#f6f7fb",
        ink: "#0f172a",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px -10px rgba(15, 23, 42, 0.18)",
        cardHover: "0 4px 12px rgba(15, 23, 42, 0.08), 0 16px 32px -12px rgba(15, 23, 42, 0.24)",
        glow: "0 0 0 1px rgba(17, 24, 39, 0.06), 0 8px 20px -6px rgba(17, 24, 39, 0.35)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
