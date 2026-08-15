import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// macOS 大小写不敏感 FS 下，SPA 路由 /license 会被 dev server 解析到根目录
// LICENSE 静态文件（curl 实测 500 + import-analysis 报错），页面被劫持成许可证
// 文本。rewrite 回 index.html 让 SPA 路由接管（生产 nginx try_files 不受影响）。
function spaRouteClashFix() {
  return {
    name: 'spa-route-clash-fix',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && /^\/license\/?$/.test(req.url.split('?')[0])) {
          req.url = '/index.html'
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [spaRouteClashFix(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/react-dom/') || id.includes('/scheduler/') || id.includes('/react/')) return 'vendor-react'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('@tanstack')) return 'vendor-tanstack'
          if (id.includes('recharts')) return 'vendor-charts'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('jsencrypt') || id.includes('js-md5')) return 'vendor-crypto'
          if (id.includes('date-fns')) return 'vendor-date'
          if (id.includes('/zod/') || id.includes('react-hook-form') || id.includes('@hookform')) return 'vendor-form'
          if (id.includes('axios')) return 'vendor-http'
          if (id.includes('@radix-ui')) return 'vendor-radix'
          if (id.includes('sonner')) return 'vendor-ui'
          if (id.includes('zustand')) return 'vendor-ui'
          if (id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge')) return 'vendor-ui'
          return 'vendor-misc'
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 8082,
    proxy: {
      '^/api/adm(?=/|$)': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:9800',
        changeOrigin: true,
      },
      '^/metrics$': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:9800',
        changeOrigin: true,
      },
    },
  },
})
