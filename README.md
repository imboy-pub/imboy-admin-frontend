# IMBoy 管理后台

IMBoy 的 Web 管理后台，基于 React、TypeScript、Vite 和 Bun，提供用户、群组、消息、频道、举报及系统配置等管理功能。

## 本地启动

### 1. 准备环境

- Bun
- 已启动的 IMBoy 后端（默认 `http://127.0.0.1:9800`）

### 2. 安装并运行

```bash
bun install
bun run dev
```

浏览器打开 `http://127.0.0.1:8082`。开发服务器会把 `/api/adm` 和 `/metrics` 请求代理到本地后端。

需要修改开发环境时，编辑 `.env.development`，不要把真实账号或密钥提交到仓库。

## 常用命令

```bash
bun run dev          # 启动开发服务器
bun run lint         # ESLint 与模块边界检查
bun run typecheck    # TypeScript 类型检查
bun test             # 单元测试
bun run build        # 生产构建
bun run check        # lint + typecheck + deadcode
```

运行浏览器端到端测试：

```bash
cp .env.e2e.example .env.e2e
# 编辑 .env.e2e，填入本地测试环境
bun run test:e2e:install
bun run test:e2e
```

## 代码入口

```text
src/pages/        页面
src/components/   通用组件
src/modules/      业务模块及其 API
src/services/     HTTP 客户端和历史共享服务
src/stores/       Zustand 状态
src/types/        TypeScript 类型
src/test/         测试工具
tests/e2e/        Playwright 端到端测试
```

## 开发前记住

- 新业务 API 放在 `src/modules/*/api`，模块外通过公开入口导入。
- 64 位 TSID 使用 `EntityId`，不要转成 `number`。
- 列表页统一使用 `DataTablePagination`，筛选变化后重置到第 1 页。
- 提交前至少运行 `bun run lint`、`bun test` 和 `bun run build`。

## 继续阅读

- [项目约定](./CLAUDE.md)
- [设计规范](./DESIGN.md)
- [模块地图](./docs/module_map.md)
- [管理员与角色接口](./docs/api-contracts/admin_role_backend_api_contract.md)
- [举报中心三端契约](./docs/api-contracts/report_center_3end_api_contract.md)

## 许可证

[木兰宽松许可证，第 2 版](./LICENSE)
