# ADR: Admin Feature Module Boundaries And Lightweight Extension Points

- Status: Accepted
- Date: 2026-03-15
- Context:
  `imboy-admin-frontend` 目前已经覆盖频道、消息、朋友圈、反馈、角色、报表等后台能力，但页面、API、hooks 和共享组件的边界仍然主要依赖目录习惯，缺少稳定的领域模块公开入口。随着后台功能继续增长，如果继续把新实现散落在全局 `pages`、`services`、`components` 下，会增加跨域耦合、功能门禁治理和后续模块收口的成本。
- Decision:
  后端继续保持 modular monolith，不拆微服务；管理后台与 Flutter 客户端按领域模块化演进，不再继续膨胀全局 `service/pages/components` 入口。后台会以领域模块壳、public barrel 和模块内聚的 API/hooks/routes 为主线收敛结构。插件化仅用于高变化扩展点，例如 dashboard panel、report panel 等后台扩展位，不用于权限校验、核心路由、关键一致性链路。
- Consequences:
  后续后台改造优先新增模块公开入口和兼容层，再逐步把页面、API、hooks、schema 与 feature routes 收敛到同一模块目录。已有全局入口不会一次性删除，而是保留为薄封装，直到调用点和验证收敛完成。边界门禁会在后续任务中加入，防止新增代码继续绕过模块边界。
- Non-Goals:
  本次决策不引入微前端、不改造成远程动态加载插件平台、不要求一次性物理迁移所有页面文件，也不修改现有后端 API 契约。
