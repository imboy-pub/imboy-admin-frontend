import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    host: true,
    port: 8082,
    proxy: {
      '^/adm(?=/|$)': {
        target: 'http://127.0.0.1:9800',
        changeOrigin: true,
      },
    },
  },
})
