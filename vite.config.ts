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
// 默认仅 dev 替换为空（connect-src 退化为 'self'，API 走 vite proxy 同源），
// apply: 'serve' 确保 build 产物保留占位符，不破坏 docker 部署契约。
// 例外：本地真实集成（CS-INT-03 实证——坐席附件裸 PUT 的目标 URL 是服务端
// presign 权威下发的 API 域绝对地址，不经 vite proxy，'self' 会拦截）需要把
// API 域加进 connect-src：经 IMBOY_DEV_CSP_API_HOST 显式注入（缺省空=不放宽）。
function devCspPlaceholderFix() {
  return {
    name: 'dev-csp-api-host-placeholder',
    apply: 'serve' as const,
    transformIndexHtml(html: string) {
      return html.replace('__IMBOY_API_HOST__', process.env.IMBOY_DEV_CSP_API_HOST ?? '')
    },
  }
}

// ---------------------------------------------------------------------------
// CSW-01 / CSD-IMG-01 / SC-BLD：客服 Widget + 坐席工作台独立构建
// （`bun run build:widget`，不与 Admin SPA 混排）
// - mode 'widget'        → iframe 聊天应用（widget/index.html → dist-widget/widget/index.html）
// - mode 'widget-loader' → 宿主页 loader（lib/iife → dist-widget/loader.js）
// - mode 'seat'          → Web 坐席工作台静态 runtime（seat/index.html →
//   dist-widget/seat/index.html；薄入口只挂载既有 SeatWorkspacePage，零 Admin
//   Router/auth/client 依赖；后端 /seat/:id frame 面同源引用）
// 三种模式只产出独立 artifact 目录 dist-widget/（.gitignore 已忽略，不提交产物）；
// widget 模式排在链条首位并 emptyOutDir: true，seat/loader 模式 emptyOutDir:
// false 追加写入同一目录；Admin 默认构建（mode production）与 dev server 完全不受影响。
//
// 不可变发布合同（冻结合同 v1 S6）：
// - loader.js = 稳定文件名入口（内容可变、文件名不变），宿主 snippet 永远指向它；
// - 其余 asset（iframe 应用 JS/CSS）= 内容 hash 文件名 → CDN/nginx 可按
//   `public, max-age=31536000, immutable` 缓存，升级即新文件名，无缓存命中错版；
// - 零 source map（sourcemap: false，产物不得出现 .map）；
// - vite.config 不写 manifest：manifest.json / manifest.sha256 / health.txt 由
//   scripts/widget-manifest.mts 在 build:widget 末尾统一生成。
// 注意：assets/cs-widget-[hash].js 为内容 hash 路径，tests/e2e/widget-cs.spec.ts
// 的确定性路径（page.route **/assets/cs-widget.js）需由 E2E harness（CSD-E2E-01）
// 按 manifest.json 解析实际文件名——spec 在缺产物时 test.skip，不会误报红灯。
// ---------------------------------------------------------------------------
function widgetBuildOverrides(mode: string): import('vite').BuildOptions | null {
  if (mode === 'widget') {
    return {
      outDir: 'dist-widget',
      emptyOutDir: true,
      sourcemap: false,
      cssCodeSplit: false,
      assetsDir: 'assets',
      // 独立 artifact：不拷贝 Admin 的 public/（sidebar-menu.json / vite.svg 等）
      copyPublicDir: false,
      rollupOptions: {
        input: { widget: path.resolve(__dirname, 'widget/index.html') },
        // 内容 hash 文件名（S6 immutable 缓存合同）；index.html 由 vite 生成并
        // 自动引用 hash 后的最终文件名，产物自洽。
        output: {
          entryFileNames: 'assets/cs-widget-[hash].js',
          chunkFileNames: 'assets/cs-widget-[hash].js',
          assetFileNames: 'assets/cs-widget-[hash][extname]',
        },
      },
    }
  }
  if (mode === 'widget-loader') {
    return {
      outDir: 'dist-widget',
      emptyOutDir: false,
      sourcemap: false,
      copyPublicDir: false,
      lib: {
        entry: path.resolve(__dirname, 'src/widget/customer_service/loader.ts'),
        formats: ['iife'],
        name: 'ImboyCsWidget',
        // 稳定入口：文件名固定 loader.js（S6 no-cache 合同），内容随版本变化
        fileName: () => 'loader.js',
      },
    }
  }
  if (mode === 'seat') {
    return {
      // SC-BLD：widget 模式已在链条首位 emptyOutDir，此处追加写入同一 dist-widget
      outDir: 'dist-widget',
      emptyOutDir: false,
      sourcemap: false,
      cssCodeSplit: false,
      assetsDir: 'assets',
      copyPublicDir: false,
      rollupOptions: {
        input: { seat: path.resolve(__dirname, 'seat/index.html') },
        // 命名镜像 cs-widget（内容 hash → /assets/* immutable 缓存合同）；
        // seat/index.html 由 vite 生成并自动引用 hash 后的最终文件名。
        output: {
          entryFileNames: 'assets/cs-seat-[hash].js',
          chunkFileNames: 'assets/cs-seat-[hash].js',
          assetFileNames: 'assets/cs-seat-[hash][extname]',
        },
      },
    }
  }
  return null
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const widgetBuild = widgetBuildOverrides(mode)
  // SC-BLD：seat 模式把 react-router-dom 指向纯 <a> 替身（src/seat/routerStub.tsx）——
  // 坐席页共享抽屉静态 import { Link } 会把 react-router 库拖进产物，而该页从不
  // 渲染 Link（无 sections prop）。缺失导出由 rollup 构建期报错兜底（见替身注释）。
  // Record<string,string> 注解（SC-INT DEF-SC153-03）：无注解时条件表达式被
  // 推断为 { 'react-router-dom': string } | {} 的 spread union，第二支含
  // 'react-router-dom'?: undefined，不满足 vite AliasOptions 的索引签名
  // （tsc -b TS2769，集成 L3 实测）。
  const seatOnlyAlias: Record<string, string> =
    mode === 'seat'
      ? { 'react-router-dom': path.resolve(__dirname, 'src/seat/routerStub.tsx') }
      : {}
  return {
  plugins: [devCspPlaceholderFix(), spaRouteClashFix(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      ...seatOnlyAlias,
    },
  },
  build: widgetBuild ?? {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // SEAT-03-A02：Web 坐席独立 chunk（seat/** 不含 Admin client/Cookie 域
          // 代码，产物可单独安全审计；依赖方向单向：customer_service 模块 → 坐席）。
          if (id.includes('/src/modules/customer_service/seat/')) return 'seat-workbench'
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
        // 后端 cowboy keepalive 超时会关空闲连接；dev proxy 复用 stale 连接会
        // 偶发 ECONNRESET 随机打挂 E2E 用例（prodready run 实证）。禁用出站
        // 连接复用（每请求新建），dev/E2E 场景开销可忽略。
        agent: false,
      },
      '^/api/adm(?=/|$)': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:9800',
        changeOrigin: true,
        // 后端 cowboy keepalive 超时会关空闲连接；dev proxy 复用 stale 连接会
        // 偶发 ECONNRESET 随机打挂 E2E 用例（prodready run 实证）。禁用出站
        // 连接复用（每请求新建），dev/E2E 场景开销可忽略。
        agent: false,
      },
      // ORG-14：组织治理面走 /api/v1 App 面（同后端实例），dev 下同源转发
      '^/api/v1(?=/|$)': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:9800',
        changeOrigin: true,
        // 后端 cowboy keepalive 超时会关空闲连接；dev proxy 复用 stale 连接会
        // 偶发 ECONNRESET 随机打挂 E2E 用例（prodready run 实证）。禁用出站
        // 连接复用（每请求新建），dev/E2E 场景开销可忽略。
        agent: false,
      },
      '^/metrics$': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:9800',
        changeOrigin: true,
        // 后端 cowboy keepalive 超时会关空闲连接；dev proxy 复用 stale 连接会
        // 偶发 ECONNRESET 随机打挂 E2E 用例（prodready run 实证）。禁用出站
        // 连接复用（每请求新建），dev/E2E 场景开销可忽略。
        agent: false,
      },
    },
  },
  }
})
