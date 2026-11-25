import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // En dev, /api part vers le déploiement Vercel (les secrets n'existent que là-bas).
    // Pour viser une autre URL : API_TARGET=https://... npm run dev
    proxy: {
      '/api': { target: process.env.API_TARGET ?? 'https://forever-gear-advisor.vercel.app', changeOrigin: true },
    },
  },
})
