# Changelog

本文件记录 imboyadmin（IMBoy 管理后台）对外发布的版本变更。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

> 版本号以本仓 `package.json` 为权威。1.0.0 起的 workspace 层版本以 imboy 仓根目录 `VERSION` 文件为权威（见 imboy `CHANGELOG.md` 头部声明）。
> 历史版本线曾于 2026-04 定格 `1.0.0-rc.1`，2026-07 起回退重排为 `1.0.0-alpha.N` 序列（alpha.13 → alpha.15 → alpha.16，无 alpha.14）。
> 本文件于 2026-09-29 首次建立（W3-A06 缺口修复），`1.0.0-alpha.16` 及之前版本节由 git 历史归纳补录。

---

## [Unreleased]

### Added

**企业组织治理 / Organization**
- 待激活 Owner 治理面：V2 双模式建企对话框 + 治理面板挂载（GZAPP-06 / GZAPP-08），Admin 侧项目功能按特性键同键保护（GZAPP-C2）
- 企业域管理体验三连：ENT-ADM-01 成员/部门复合筛选·搜索定位·左树右详情；ENT-ADM-02 抽象 `EntityManageListPageLayout` 治理列表骨架并迁移群标签/相册/投票/频道四族页面；ENT-FND-01 列持久化 hook + EntityDrawer 分区/关系 Drawer
- 组织页客服事实投影（CS-ADM-01）与客服运营统计视图（CS-ADM-02，平台治理面五指标现算投影）
- 组织默认工作台以服务端投影 `is_default` 为真源；Owner 转移与创建邀请改为用户搜索选择

**客服坐席工作台 / Customer Service (Web Seat)**
- `/customer-service` 改造为坐席分页列表（跨企业/单企业两视图），新增任务驱动的客服工作台首页
- 客户上下文面板（CS-BE-03 白名单投影消费）、Seat 队列 triage（preview 摘要与等待时长）、Web Seat 单文件发送（presign→PUT→confirm）、Seat presence 诚实在线与未读 ACK（CS-WEB-05）
- 坐席登录二维码可扫描渲染修正

**客服挂件 / CS Widget**
- Web 挂件独立构建（widget / widget-loader 双 mode）+ 管理端安装页（CSW-01）
- 挂件聊天 UI 现代化翻新 + 附件选择白名单过滤；无坐席留言状态（queued 且无 online 坐席时显示可留言提示，CP-CON-04）；历史附件投影与图片体验（刷新/SSE 后附件不再消失）
- 不可变发布产物 + manifest/checksum/health 校验 + 静态 runtime 镜像（CSD-IMG-01）

**治理与合规**
- Application governance 接线 + push-token 明文展示修复（FULL-04）；策略页支持 `storage_mode=disabled`（E2EE 整档关闭）；能力配置页合并为单一「加密档位」选择并入真源；网站接入记录行内编辑（PUT 更新弹窗）

### Changed
- 许可证由 ESL（Elastic）切换为 **BSL 1.1**（761bf39）
- A3 侧边栏 IA：9 叶企业域菜单 + 查询条 active 匹配；企业菜单入口 preset/组织筛选传递（服务端强制重验）
- i18n 最小键机制落基建，企业域文案全面入键（ENT-UX-01）；44px 触达基线达标；纯术语文案位直接消费术语键

### Fixed
- App Shell 固定外壳：侧边栏与内容区独立滚动，修长列表页整页滚动
- 挂件 loader 首开时序缺陷：frame 未就绪不投递 panel 消息；`INEFFECTIVE_DYNAMIC_IMPORT` 警告清零（静态消费改深路径导入）

### CI / 测试
- 客服域真实链 E2E 套件两批（P1-E2E-01 四域跨域真实链 + P2-E2E-01 A02-A05 与幂等夹具）；hosted Widget 真实四域浏览器 E2E 入仓（CP-ASSET-02）
- 跨仓 Widget 资产配对门：后端常量与 Admin manifest 输出名互验（CP-ASSET-04），并接入 CI（W2-C03）
- 独立后端编排器 + 默认套件范围修正 + SMS fake/冷启动修复，E2E 免后端手工准备（W2-A05）

---

## [1.0.0-alpha.16] - 2026-08-29

### Added
- 产品体验页（ProductExperiencePage）+ workspace/project 管理（T11/T11b）；项目治理只读面板接入 ProjectDetailPage（ZC-07）
- Bot 运营管理页（列表/详情抽屉/停用/启用）+ AI 助手支付授权补全
- 白标品牌配置接入运行时消费链（标题/logo/主色/合法链接）

### Fixed
- 安全：密码预哈希 md5hex 回退（对齐旧后端）+ 解密断言契约测试；Nginx 安全头；频道消息图片改为点击后加载，收口追踪像素暴露面
- 迁移 Node.js crypto → Web Crypto API；package.json 补声明 js-md5（回退重新启用后漏声明）
- admin 镜像 API 地址运行时注入（Dockerfile 占位符 + entrypoint sed 替换）；Nginx 静态资源 location 重复声明安全头
- a11y：tabs 方向键导航 + roving tabindex + aria 关联
- 测试稳定性：跨测试文件污染致全量 `bun test` 无限拖死；ChannelDetailPage 并行权限误拒
- 支付语义对齐：`payment_tx_status=5` 退款中补齐、钱包/充值订单枚举对齐后端权威值域（ManagedMessage.server_ts 类型同步修正）

### Docs
- auto_test 批次 41/42 全量重跑闭环（72 页 0 异常）；钱包流水 type 注释对齐后端完整值域

---

## [1.0.0-alpha.15] - 2026-07-19

### Added
- SSO 配置页适配脱敏契约与 OIDC 字段（P0-C C3a）

### Fixed
- 动态详情 6 位微秒 RFC3339 时间戳解析（Invalid Date）；SSO 保存后缓存刷新；EntityDrawer 无障碍模态

### Changed
- 依赖治理：vite 7→8.x、@tanstack/react-table 8→9 等一批 dependabot 升级；CI 测试隔离与生产 E2E 门

---

## [1.0.0-alpha.13] - 2026-07-11

### Added
- 治理能力补全（GAP-01~04 与后续）：内容审核、用户设备管理（列表/单踢/全部下线）、审计日志操作 Tab 与日期过滤、SSO 外部认证配置页
- License 管理、提现审批、财务报表后台；财务运营页接入退款与钱包冻结/解冻；用户数达授权配额 80% 升级预警 banner
- MCP 治理页（骨架 → 真实 `/api/adm/mcp/*` 接口）；插件管理（安装/健康/详情/强制卸载 UI）；角色停用/删除、反馈标记完结入口
- Select 组件 + DataTable focus ring + DESIGN.md；全量迁移 34 个页面原生 `<select>` → Select 组件

### Changed
- API 调用全量迁移 `/api/adm` 前缀（双路径兼容过渡）；侧边栏 schema 化；30+ 页面 UI/UX 治理补全；频道治理 5 子页分页迁移 `useListQueryState`

---

## [1.0.0-rc.1] - 2026-04-10

首个功能完整的候选版本。

### Added
- 核心框架与 API 层、UI 组件库与业务页面（用户/群组/消息治理等基础域）
- 设置管理、公告、分析、E2E 测试基建；系统健康监控页
- TSID 编码 ID 全仓适配：BigInt 处理与类型更新，64 位 ID 统一以 string 传输避免精度丢失

---

## 历史版本对照

| package.json 版本 | 版本节点提交 | 日期 |
|---|---|---|
| 0.0.0（项目初始化） | `de7fa17` | 2026-03-13 |
| 1.0.0-rc.1 | `a4cc248` | 2026-04-10 |
| 1.0.0-alpha.13 | `e41e1fb` | 2026-07-11 |
| 1.0.0-alpha.15 | `703de57` | 2026-07-19 |
| 1.0.0-alpha.16 | `332d4b6` | 2026-08-29 |
