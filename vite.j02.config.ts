import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config'

// Reuse the actual app config; disable implicit dotenv loading for this test target.
// 复用应用配置；禁止环境文件将接口覆盖为另一实例。
export default defineConfig((env) => {
  if (!process.env.VITE_PROXY_TARGET || process.env.VITE_API_BASE_URL !== '/api/adm') {
    throw new Error('J02 Vite must be started by the approved acceptance runner')
  }
  return mergeConfig(baseConfig(env), {
    envDir: false,
    server: { host: '127.0.0.1', strictPort: true },
  })
})
