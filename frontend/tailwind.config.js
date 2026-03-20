/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        poker: {
          green: "#1a472a",
          felt: "#0d3b2e",
          "felt-light": "#1b5e45",
          gold: "#c9a227",
          "gold-light": "#dbb842",
          "gold-dark": "#a8871d",
          red: "#dc2626",
          black: "#0a0e17",
        },
        surface: {
          DEFAULT: "#111827",
          50: "#1e293b",
          100: "#1a2332",
          200: "#151d2b",
          300: "#0f1724",
          400: "#0a0e17",
        },
        accent: {
          DEFAULT: "#c9a227",
          light: "#dbb842",
          dark: "#a8871d",
          muted: "rgba(201, 162, 39, 0.15)",
        },
        brand: {
          emerald: "#10b981",
          sapphire: "#3b82f6",
          ruby: "#ef4444",
          amethyst: "#8b5cf6",
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "Consolas", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-pattern":
          "linear-gradient(135deg, #0a0e17 0%, #111827 50%, #0d1f35 100%)",
        "felt-gradient":
          "radial-gradient(ellipse at center, #1b5e45 0%, #0d3b2e 40%, #0a2e23 100%)",
        "card-shine":
          "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(201, 162, 39, 0.3)",
        "glow-sm": "0 0 10px rgba(201, 162, 39, 0.2)",
        "glow-lg": "0 0 40px rgba(201, 162, 39, 0.4)",
        "inner-glow": "inset 0 0 30px rgba(0,0,0,0.3)",
        card: "0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -2px rgba(0,0,0,0.2)",
        "card-hover":
          "0 10px 15px -3px rgba(0,0,0,0.4), 0 4px 6px -4px rgba(0,0,0,0.3)",
        table: "0 0 80px rgba(0,0,0,0.5), inset 0 0 60px rgba(0,0,0,0.2)",
      },
      animation: {
        "card-deal": "cardDeal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "chip-stack": "chipStack 0.3s ease-out",
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "pulse-gold": "pulseGold 2s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        float: "float 6s ease-in-out infinite",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        cardDeal: {
          "0%": {
            transform: "translateY(-80px) rotate(-8deg) scale(0.8)",
            opacity: "0",
          },
          "100%": {
            transform: "translateY(0) rotate(0) scale(1)",
            opacity: "1",
          },
        },
        chipStack: {
          "0%": { transform: "translateY(-20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        pulseGold: {
          "0%, 100%": { boxShadow: "0 0 10px rgba(201, 162, 39, 0.2)" },
          "50%": { boxShadow: "0 0 25px rgba(201, 162, 39, 0.5)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};
