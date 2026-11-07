import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    // Listen on the LAN so a phone on the same Wi-Fi can open http://<laptop-ip>:5173.
    host: true,
    // Same-origin /api calls keep the auth cookie simple (no cross-site cookie config).
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
