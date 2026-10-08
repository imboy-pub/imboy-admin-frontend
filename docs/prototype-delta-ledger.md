# 企业界面术语 / Enterprise interface terminology

本文件规定 Admin 企业界面的中文术语。架构边界见 [模块边界 ADR](adr/2026-03-15-admin-feature-module-boundaries.md)，界面实现以源码为准。
This document defines Chinese terms for Admin enterprise interfaces. See the [module boundary ADR](adr/2026-03-15-admin-feature-module-boundaries.md) for architecture decisions; source code defines the implemented interface.

## 术语表 / Terminology

| 键 / Key | 中文 / Chinese | 避免混用 / Avoid ambiguous alternatives |
|---|---|---|
| organization | 组织 | 机构、团队 |
| workspace | 工作区 | 空间 |
| enterprise | 企业 | 公司（平台语境 / in platform context） |
| seat | 客服坐席 | 客服人员、agent |
| session | 会话 | 对话（客服域 / in customer service） |
| transfer | 转接 | 转移 |
| rating | 评分 | 评价（指标语境 / in metric context） |
| provisioning | 开通 | 配置坐席 |

## 维护规则 / Maintenance

新增或修改企业界面文案时，使用上表术语；有意改变术语时同步更新本表及对应文案键。管理后台文案键定义在 `src/i18n/zh-CN.ts`。涉及接口的术语同时对照后端主仓 `docs/glossary.md` 与 `docs/api-contracts/three-platform-alignment.md`。
Use these terms when adding or changing enterprise interface copy. Intentional terminology changes must update this table and the corresponding copy keys together. Admin copy keys are defined in `src/i18n/zh-CN.ts`. For API terminology, also consult `docs/glossary.md` and `docs/api-contracts/three-platform-alignment.md` in the backend repository.
