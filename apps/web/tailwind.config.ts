import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", "class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
    "../../packages/views/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      letterSpacing: {
        tight: "var(--letter-spacing-tight)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        typing: {
          "0%, 100%": {
            transform: "translateY(0)",
            opacity: "0.5",
          },
          "50%": {
            transform: "translateY(-2px)",
            opacity: "1",
          },
        },
        "loading-dots": {
          "0%, 100%": {
            opacity: "0",
          },
          "50%": {
            opacity: "1",
          },
        },
        wave: {
          "0%, 100%": {
            transform: "scaleY(1)",
          },
          "50%": {
            transform: "scaleY(0.6)",
          },
        },
        blink: {
          "0%, 100%": {
            opacity: "1",
          },
          "50%": {
            opacity: "0",
          },
        },
        "bounce-dots": {
          "0%, 100%": {
            transform: "scale(0.8)",
            opacity: "0.5",
          },
          "50%": {
            transform: "scale(1.2)",
            opacity: "1",
          },
        },
        "thin-pulse": {
          "0%, 100%": {
            transform: "scale(0.95)",
            opacity: "0.8",
          },
          "50%": {
            transform: "scale(1.05)",
            opacity: "0.4",
          },
        },
        "pulse-dot": {
          "0%, 100%": {
            transform: "scale(1)",
            opacity: "0.8",
          },
          "50%": {
            transform: "scale(1.5)",
            opacity: "1",
          },
        },
        "shimmer-sweep": {
          "0%": {
            transform: "translateX(-125%)",
            opacity: "0.1",
          },
          "45%": {
            opacity: "0.65",
          },
          "100%": {
            transform: "translateX(275%)",
            opacity: "0.1",
          },
        },
        "wave-bars": {
          "0%, 100%": {
            transform: "scaleY(1)",
            opacity: "0.5",
          },
          "50%": {
            transform: "scaleY(0.6)",
            opacity: "1",
          },
        },
        "spinner-fade": {
          "0%": {
            opacity: "0",
          },
          "100%": {
            opacity: "1",
          },
        },
        "text-blink": {
          "0%, 100%": {
            color: "var(--primary)",
          },
          "50%": {
            color: "var(--muted-foreground)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [typography],
};

export default config;
