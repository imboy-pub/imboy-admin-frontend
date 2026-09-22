export { CustomerServiceOpsPage } from './pages/CustomerServiceOpsPage'
export { CustomerServiceHomePage } from './pages/CustomerServiceHomePage'
export { PlatformCsSessionsPage } from './pages/PlatformCsSessionsPage'
export { CsSessionDetailPage } from './pages/CsSessionDetailPage'
export { CsWidgetInstallationsPage } from './pages/CsWidgetInstallationsPage'
// ADM-01：客服开通向导（Organization/Workspace 选择器 → provisioning → installation → snippet）
export { CsProvisioningWizardPage } from './pages/CsProvisioningWizardPage'
// SEAT-02/03：Web 坐席工作台（独立 Seat JWT 域 + QR 登录门；路由面由 App 挂载）
export { SeatWorkspacePage, SEAT_WORKSPACE_ROUTE } from './seat'
export * from './api'
