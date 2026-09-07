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

// index.html CSP 的 connect-src 含部署占位符 __IMBOY_API_HOST__（docker 镜像
// entrypoint 运行时 sed 注入真实 API 域，见 imboy/deploy/docker-compose.community.yml）。
// dev server 没有这个替换环节，浏览器把非法源报 console error（每次加载一条）；
// 仅 dev 替换为空（connect-src 退化为 'self'，API 走 vite proxy 同源），
// apply: 'serve' 确保 build 产物保留占位符，不破坏 docker 部署契约。
function devCspPlaceholderFix() {
  return {
    name: 'dev-csp-api-host-placeholder',
    apply: 'serve' as const,
    transformIndexHtml(html: string) {
      return html.replace('__IMBOY_API_HOST__', '')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [devCspPlaceholderFix(), spaRouteClashFix(), react(), tailwindcss()],
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
          if (id.includes('jsencrypt')) return 'vendor-crypto'
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
      // 白标品牌端点挂后端根路径（非 /api/adm），dev 下转发以便联调；
      // 拉取失败时前端静默回退默认品牌（src/lib/brandRuntime.ts）
      '^/brand$': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:9800',
        changeOrigin: true,
      },
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
