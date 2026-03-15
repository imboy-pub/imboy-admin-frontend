# ADR: Admin Feature Module Boundaries And Extension Points

- Status: Accepted
- Date: 2026-03-15
- Context:
  当前 `imboy` 工作区正在执行跨三仓的渐进式架构迁移。后端会继续保持 Erlang `modular monolith`，不会拆成微服务；Flutter 客户端和管理后台需要按领域模块化演进，避免继续把页面、API、hooks、schemas 和共享组件无限堆进全局 `src/pages`、`src/services/api`、`src/components`。管理后台同时存在少量高变化扩展场景，例如报表面板、运营面板和特定目标类型的展示卡片，但这些扩展点不能侵入登录、权限、功能门禁和核心一致性链路。
- Decision:
  1. 工作区级别继续采用“后端 modular monolith + 前端领域模块化”的统一方向，管理后台不以拆微前端或远程动态加载为目标。
  2. 管理后台后续按领域模块组织代码，把同一领域的页面、API、hooks、schemas、feature routes 和 module barrel 收敛到同一模块下，而不是继续扩张全局 `src/pages`、`src/services/api`、`src/components`。
  3. 插件化只用于高变化扩展点，例如 dashboard panel、report target panel、消息类型展示等可替换能力；认证、权限、路由守卫、核心业务一致性和跨域合同仍保持在稳定的模块边界内。
- Consequences:
  1. `src/modules/<domain>` 将成为管理后台的长期收敛方向，`src/app` 和 `src/core` 只保留应用装配与跨域基础能力。
  2. 新增管理后台能力时，优先先补模块壳、公开入口和薄封装，再逐步把内部实现迁入模块，而不是一次性大搬家。
  3. 可扩展面板和报表注册点需要显式 contract 和 registry，避免继续通过页面内硬编码分支扩展。
  4. 现有全局路径在迁移期允许以兼容层形式继续存在，但后续会通过 lint 和边界门禁逐步收敛。
- Non-Goals:
  1. 本 ADR 不引入微前端、远程插件下载或运行时沙箱。
  2. 本 ADR 不改变现有后端 API 路由、响应契约或登录鉴权模型。
  3. 本 ADR 不要求在同一任务内完成所有页面和 API 文件的物理迁移。
