import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { startUxEventReporter } from '@/services/api/uxTelemetryReporter'
import { initBrandRuntime } from '@/lib/brandRuntime'

// 白标品牌初始化：先同步应用默认品牌（标题/主色基线），再异步拉取
// GET /brand 覆盖；失败静默回退默认，不阻塞渲染。
initBrandRuntime()

startUxEventReporter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
