/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#F9C784",
        "primary-hover": "#f7bc6d",
        "primary-dark": "#c07a00",
        "background-light": "#E7E7E7",
        "surface-light": "#F5F5F5",
        "card-white": "#ffffff",
        "text-main": "#18181b",
        "text-muted": "#52525b",
        "text-auth-muted": "#8a7860",
        "border-color": "#e6e1db",
        "border-light": "#d4d4d8",
        "status-success": "#1c7c3a",
        "status-success-bg": "rgba(28,124,58,0.08)",
        "status-error": "#b32424",
        "status-error-bg": "rgba(179,36,36,0.08)",
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        body: ['"Space Grotesk"', '"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "1rem",
        lg: "2rem",
        xl: "3rem",
        full: "9999px",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "300ms",
        slow: "500ms",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-scale": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out both",
        "slide-up": "slide-up 0.4s ease-out both",
        "fade-in-scale": "fade-in-scale 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};
