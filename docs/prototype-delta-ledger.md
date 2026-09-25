# Prototype Delta Ledger（ENT-UX-01）

> Admin 企业域原型 ↔ 实现差异台账。原型真源：`imboy/docs/enterprise-upgrade/prototype/`
> （用户只读 WIP，经 RUN input-design-snapshot 引用）；实现真源：imboyadmin integration 分支。
> 本台账使原型承认九叶导航、Customer Service 与 Enterprise Business 的 current-main 现状。

## 术语口径（关键文案键表）

Admin 无 i18n 框架（current-main 事实：单语言中文平台后台，全仓无 locale 层）。
本 run 企业域关键文案沿用仓内既有冻结术语（即"文案入键"的等价交付——键=下表，
新增页面文案 100% 取自该表，无同义漂移）：

| 术语键 | 唯一中文 | 禁用同义漂移 |
|---|---|---|
| organization | 组织 | "机构""团队" |
| workspace | 工作区 | "空间" |
| enterprise | 企业 | "公司"（平台语境） |
| seat | 客服坐席 | "客服人员""agent" |
| session | 会话 | "对话"（客服域） |
| transfer | 转接 | "转移" |
| rating | 评分 | "评价"（指标语境） |
| provisioning | 开通 | "配置坐席" |

审计结论（脚本 ENT-UX-01-copy-audit）：本 run 新增 8 个企业域文件共 750+
中文词条，零 TODO/FIXME/用户可见占位；英文命中全部为 className/技术标识符。

## 原型 → 实现差异（delta）

| 原型（snapshot） | 实现（current-main + 本 run） | delta 裁决 |
|---|---|---|
| 01-enterprise-home（企业首页） | 未实现独立企业首页；九叶导航（组织治理/工作区/企业项目/企业群/企业频道/客服坐席/应用与集成/离岗交接/企业审计）由 sidebar 承载 | **承认现状**：平台导航即企业入口，无需独立 home（ENT-ADM-01..04 按此落地） |
| 02-organization | /organizations 列表 + 详情 Drawer + CsSummaryPanel（CS-ADM-01） | 实现超集：原型无客服摘要分区 |
| 03-member-management | 成员治理（ENT-APP-05 后端 + Admin 组织详情成员区） | 对齐；深链治理在 Flutter 端闭合 |
| 04-department | 部门目录（departmentDirectory API） | 对齐 |
| 05-group / 06-channel | 企业群/企业频道（?preset=enterprise，服务端 adm_enterprise_filter 强制 scope） | 对齐（复用既有页面，零新页面簇） |
| 07-work-tools | Workspace/Project/Task 聚合入口（ENT-APP-06） | 对齐 |
| 08-settings | 既有 /settings 簇 | 无企业域新设置面（零 delta） |
| 09/10/11 详情原型 | 组织/群/频道详情走 Drawer + 详情页既有模式 | 对齐 |
| （原型无） | Customer Service 平台治理面（/customer-service：坐席分页、provisioning 向导、会话操作、widget 安装、运营统计 CsStatsPanel CS-ADM-02） | **原型外新增**：CS 域整体为原型后新增（customer-service-v2 设计输入定义），原型已过时部分以此台账为准 |

## 无障碍审计（ENT-UX-01-viewport-audit）

- 双视口（desktop 1280×800 / mobile 390×844）× 3 页面 × 明暗 = 8 截图，零横向溢出；
- 键盘焦点链健康（每页可聚焦元素 ≥6，无 tabindex=-1 全禁）；
- 触达目标：≥32px 控件全过；唯一 16px 命中为共享 Input 密码/清除图标按钮
  （`src/components/ui/input.tsx`，本 run 零改动）→ **UNCHANGED_BASELINE_DEBT**
  （记录在 acceptance-ledger baseline_debt，不在本卡修复范围）；
- 暗色模式：CSS 变量全量（.dark 主题）+ ThemeToggle 三态切换，企业域页面
  组件 100% 消费 token 化色彩类（bg-background/text-foreground 系）。

## 维护规则

后续企业域页面变更时：新文案先查术语键表（不一致=卡验收 FAIL）；原型再次
漂移时在本文档追加 delta 行，不改原型原件（用户 WIP 保护）。
