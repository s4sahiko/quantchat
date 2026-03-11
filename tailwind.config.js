import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#050a0e',
        bg2: '#0a1520',
        bg3: '#0f1f30',
        border: '#1a3a5c',
        cyan: '#00d4ff',
        green: '#00ff9d',
        red: '#ff3366',
        yellow: '#ffd700',
        text: '#c8e6f5',
        muted: '#6a9bbf',
      },
      fontFamily: {
        display: ['Orbitron', 'monospace'],
        mono: ['Share Tech Mono', 'monospace'],
        body: ['Rajdhani', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 10px rgba(0, 212, 255, 0.5)',
        'glow-cyan-lg': '0 0 20px rgba(0, 212, 255, 0.8)',
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(to right, rgba(0, 212, 255, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0, 212, 255, 0.05) 1px, transparent 1px)',
      },
    },
  },
  plugins: [
    plugin(function({ addUtilities }) {
      addUtilities({
        '.scanlines': {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          background: 'repeating-linear-gradient(rgba(0, 0, 0, 0) 0, rgba(0, 0, 0, 0) 50%, rgba(0, 212, 255, 0.02) 50%, rgba(0, 212, 255, 0.02) 100%)',
          backgroundSize: '100% 4px',
          pointerEvents: 'none',
          zIndex: '9999',
        },
      })
    })
  ],
}
