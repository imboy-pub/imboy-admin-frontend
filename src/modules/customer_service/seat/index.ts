/**
 * SEAT-01：Web 坐席域公共出口（认证/上下文/API client/SSE/QR 登录）。
 *
 * 域隔离约定（SEAT-01-A01）：
 * - 本模块是独立 JWT fetch 域，绝不 import Admin axios client / authStore；
 * - 只调 `/api/v1/cs/*` 与 QR 登录合同路径；`credentials: 'omit'`；
 * - access JWT 只存模块内存 vault（seatTokenVault），不落任何持久层。
 *
 * 路由挂载（SEAT-03 的 A0 租约）：本模块只导出
 * SEAT_WORKSPACE_ROUTE 常量与认证面组件所需的状态/动作，
 * 不改 App.tsx / sidebar / 共享 Router wiring。
 *
 * Q10/AC24（2026-10-07）：认证/上下文/SSE/QR/工作台细粒度转出口经全仓
 * 引用核查零消费（消费方一律深路径 import；Q10-candidates barrel 转出口组），
 * 已裁剪；仅保留 public.ts 活链路所需的 SeatWorkspacePage 与
 * SEAT_WORKSPACE_ROUTE 两个出口。
 */

// ---------------------------------------------------------------------------
// SEAT-02：坐席工作台（合同层 / API / hooks / UI）
// ---------------------------------------------------------------------------
export { SeatWorkspacePage } from './workbench/SeatWorkspacePage'

/** SEAT-03 wiring 参考常量（本卡不改 Router）。 */
export const SEAT_WORKSPACE_ROUTE = '/customer-service/workspace'
