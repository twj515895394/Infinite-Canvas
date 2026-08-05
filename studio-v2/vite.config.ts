import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // 开发期代理到现有 FastAPI 后端（main.py，端口 3888）
    proxy: {
      '/api': { target: 'http://127.0.0.1:3888', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:3888', ws: true },
      '/assets': { target: 'http://127.0.0.1:3888', changeOrigin: true },
    },
  },
})
