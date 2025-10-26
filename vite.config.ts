import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173, // tu peux changer le port si besoin
  },
  build: {
    // Active les source maps uniquement en développement
    sourcemap: command === 'serve',
  },
}))
