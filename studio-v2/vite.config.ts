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
      '/assets': {
        target: 'http://127.0.0.1:3888',
        changeOrigin: true,
        // 精确 /assets（含尾斜杠/查询串）是 SPA 路由（资产库页面）；仅 /assets/xxx（媒体/输出文件）代理到后端。
        // 否则 dev 下 /assets 页面会被旧前端 307 重定向劫持。
        bypass: (req) => (/^\/assets\/?(\?|$)/.test(req.url ?? '') ? '/index.html' : undefined),
      },
    },
  },
})
