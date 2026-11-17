import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from GitHub Pages at https://arcticazz.github.io/azztech-demo/
export default defineConfig({
  base: process.env.BASE_PATH || '/azztech-demo/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { assetsDir: 'assets', sourcemap: false },
})
