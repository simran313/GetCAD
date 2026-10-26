import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        // Geist (redesign, option A): headings and large numbers.
        display: ["var(--font-display)"],
      },
      // The redesign scale (app/globals.css): 12/14/16/18/20/24/32/40/56/72.
      fontSize: {
        "t-12": ["var(--text-12)", { lineHeight: "16px" }],
        "t-14": ["var(--text-14)", { lineHeight: "20px" }],
        "t-16": ["var(--text-16)", { lineHeight: "24px" }],
        "t-18": ["var(--text-18)", { lineHeight: "28px" }],
        "t-20": ["var(--text-20)", { lineHeight: "28px" }],
        "t-24": ["var(--text-24)", { lineHeight: "30px" }],
        "t-32": ["var(--text-32)", { lineHeight: "36px" }],
        "t-40": ["var(--text-40)", { lineHeight: "44px" }],
        "t-56": ["var(--text-56)", { lineHeight: "60px" }],
        "t-72": ["var(--text-72)", { lineHeight: "76px" }],
      },
      maxWidth: {
        page: "var(--page-max)",
      },
      boxShadow: {
        "e-1": "var(--e-1)",
        "e-2": "var(--e-2)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        subtle: "hsl(var(--subtle))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        tone: {
          "neutral-fg": "var(--tone-neutral-fg)",
          "neutral-bg": "var(--tone-neutral-bg)",
          "info-fg": "var(--tone-info-fg)",
          "info-bg": "var(--tone-info-bg)",
          "attention-fg": "var(--tone-attention-fg)",
          "attention-bg": "var(--tone-attention-bg)",
          "success-fg": "var(--tone-success-fg)",
          "success-bg": "var(--tone-success-bg)",
          "warning-fg": "var(--tone-warning-fg)",
          "warning-bg": "var(--tone-warning-bg)",
          "danger-fg": "var(--tone-danger-fg)",
          "danger-bg": "var(--tone-danger-bg)",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      /*
       * Pointed at the density tokens, which is what makes P1 finally reach the
       * screens that were written before it.
       *
       * These used to derive from a fixed `--radius: 0.5rem`, so `rounded-lg`
       * meant 8px everywhere and always. Twenty-one of the app's thirty-two
       * card surfaces are spelled `rounded-lg` — they were the majority, and
       * they were the ones ignoring density entirely: not softening for a
       * client on a phone, not tightening for staff working forty orders a day.
       * Only the handful already written as `rounded-[var(--r-lg)]` responded.
       *
       * Re-pointing the scale fixes all of them at once and leaves the
       * arbitrary-value spellings meaning exactly what they already meant.
       */
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
