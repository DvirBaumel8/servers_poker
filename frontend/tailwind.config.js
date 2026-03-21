/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    screens: {
      xs: "360px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
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
          50: "#192334",
          100: "#141d2c",
          200: "#0f1723",
          300: "#0b1019",
          400: "#070b12",
        },
        panel: {
          DEFAULT: "#101826",
          muted: "#162133",
          strong: "#1a2740",
        },
        line: {
          DEFAULT: "rgba(255,255,255,0.10)",
          muted: "rgba(255,255,255,0.06)",
          strong: "rgba(255,255,255,0.18)",
        },
        accent: {
          DEFAULT: "#d2b15f",
          light: "#ebcb77",
          dark: "#a68538",
          muted: "rgba(210, 177, 95, 0.16)",
        },
        brand: {
          emerald: "#10b981",
          sapphire: "#3b82f6",
          ruby: "#ef4444",
          amethyst: "#8b5cf6",
        },
        success: {
          DEFAULT: "#36d399",
          muted: "rgba(54,211,153,0.16)",
        },
        warning: {
          DEFAULT: "#f7c948",
          muted: "rgba(247,201,72,0.16)",
        },
        danger: {
          DEFAULT: "#f87171",
          muted: "rgba(248,113,113,0.16)",
        },
        info: {
          DEFAULT: "#60a5fa",
          muted: "rgba(96,165,250,0.16)",
        },
        muted: {
          DEFAULT: "#94a3b8", // slate-400
          light: "#cbd5e1", // slate-300
          dark: "#64748b", // slate-500
          darker: "#475569", // slate-600
        },
        subtle: {
          DEFAULT: "#1e293b", // slate-800
          light: "#334155", // slate-700
          dark: "#0f172a", // slate-900
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
          "radial-gradient(circle at top, rgba(210,177,95,0.10), transparent 28%), linear-gradient(180deg, #070b12 0%, #0a1220 48%, #0d1828 100%)",
        "felt-gradient":
          "radial-gradient(ellipse at center, #1b5e45 0%, #0d3b2e 40%, #0a2e23 100%)",
        "shell-gradient":
          "linear-gradient(180deg, rgba(7,11,18,0.98) 0%, rgba(10,18,32,0.96) 40%, rgba(9,15,27,1) 100%)",
        "panel-gradient":
          "linear-gradient(180deg, rgba(24,35,52,0.92) 0%, rgba(13,20,32,0.92) 100%)",
        "card-shine":
          "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(210, 177, 95, 0.3)",
        "glow-sm": "0 0 10px rgba(210, 177, 95, 0.2)",
        "glow-lg": "0 0 40px rgba(210, 177, 95, 0.35)",
        "inner-glow": "inset 0 0 30px rgba(0,0,0,0.3)",
        card: "0 14px 32px rgba(0,0,0,0.34), 0 2px 6px rgba(0,0,0,0.22)",
        "card-hover":
          "0 22px 44px rgba(0,0,0,0.42), 0 10px 20px rgba(0,0,0,0.24)",
        panel:
          "0 18px 44px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)",
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
