/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        poker: {
          green: "#1a472a",
          felt: "#35654d",
          gold: "#d4af37",
          red: "#dc2626",
          black: "#1e1e1e",
        },
      },
      animation: {
        "card-deal": "cardDeal 0.3s ease-out",
        "chip-stack": "chipStack 0.2s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        cardDeal: {
          "0%": { transform: "translateY(-100px) rotate(-10deg)", opacity: "0" },
          "100%": { transform: "translateY(0) rotate(0)", opacity: "1" },
        },
        chipStack: {
          "0%": { transform: "translateY(-20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
