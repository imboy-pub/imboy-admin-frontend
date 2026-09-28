/**
 * SC-BLD：Web 坐席工作台静态 runtime 薄入口（seat/index.html → dist-widget/seat/）。
 *
 * 只做三件事：React root 接线 + react-query Provider + 挂载既有
 * SeatWorkspacePage（/customer-service/workspace 同款组件，零改动）。
 *
 * 安全边界（与 Admin SPA 完全解耦）：
 * - 零 Admin 依赖：不 import Admin Router / App / authStore / axios admin
 *   client，产物不得出现 `/api/adm`（verify:widget 门禁）；
 * - 页面自含 SeatWorkbenchProvider（默认 gateway = SeatApiClient + 内存
 *   token vault，QR 登录门在页面内部），无路由需求；
 * - CSS 镜像 Admin 对该页的供样（src/index.css：Tailwind v4 + 语义 token，
 *   与 src/main.tsx 的引入方式一致）。
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SeatWorkspacePage } from "@/modules/customer_service/seat/workbench/SeatWorkspacePage";
import "@/index.css";

/** 与 Admin App（src/App.tsx）同参的 react-query 客户端：权威读取依赖。 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

const rootElement = document.getElementById("cs-seat-root");
if (rootElement !== null) {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <SeatWorkspacePage />
      </QueryClientProvider>
    </StrictMode>,
  );
}
