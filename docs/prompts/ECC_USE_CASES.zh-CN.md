# IMBoy ECC 使用案例 / Admin

 > 本文是可直接复制到 Codex 会话的 ECC 使用案例库。每个案例均可独立复制，以 `$skill-name` 开头。原 72 个工程案例各提供一个提示词；新增功能场景提供 A 新增功能、B 优化现有功能、C 测试现有功能三个独立提示词。
>
> **使用约定**
> - 在已安装 ECC 的 Codex 会话中，复制单个案例的完整代码块执行。
> - 先确认当前工作目录和目标仓库；跨仓案例需明确各仓库实际 checkout 路径。
> - 仓库内 AGENTS.md、CLAUDE.md、项目架构文档、测试执行合同和安全规则优先于 ECC 通用建议。
> - 提示词中的“只读”案例不得修改文件；实施案例仅允许修改当前任务必需文件。
> - 默认不得 commit、push、合并、部署、执行生产写入或接触真实用户数据；需要时另行授权。
> - 不得通过删除/弱化测试、扩大 skip、关闭门禁或伪造证据制造 PASS。
> - 报告实际执行的命令、退出码、结果、未执行项和证据位置；未执行不得声称通过。
>
> **案例编号全局唯一**：ECC-001 至 ECC-121。四个仓库按职责分配，后端主仓提供统一索引。

## 本仓库范围

本文件包含 Admin 工程案例 9 个，以及 Admin 客户场景复刻/功能迭代案例 9 个；合计 18 个（ECC-003、035–042、102–107、119–121）。

> **时间估算说明**：时间为单个案例的一次 A/B/C 模式执行预算，包含仓库阅读、代码分析、必要实施及相关验证；不是保证完成时间。A/B/C 只能选择一种执行。30 分钟及以上建议安排 ZCODE 闲时任务。遇到缺少设备、数据库、凭据、外部服务或需求决策时，应报告 BLOCKED/NOT RUN，不能为了符合预算而跳过验证。复杂度按当前仓库结构与案例提示词范围估算，实际会随工作树状态、测试环境和缺陷数量变化。
## 案例清单

### 项目理解与架构分析

#### ECC-003 · Admin 模块边界梳理

**预计执行时间：20 分钟**（单次执行；包含代码阅读、定向实施/分析与相关验证）

**Skills：** `codebase-onboarding` · `module-governance`

```text
$codebase-onboarding $module-governance

只读分析 imboy-admin-frontend 的 React 业务模块。检查 src/modules、public.ts、API、Hooks、页面和跨模块依赖。找出违反公开接口约定的引用，输出模块依赖关系、违规文件和最小治理建议。不创建重复文档。
```

### React Admin 管理后台

#### ECC-035 · 新增 Admin 业务模块

**预计执行时间：60 分钟**（单次执行；包含代码阅读、定向实施/分析与相关验证）

**Skills：** `module-governance` · `react-patterns`

```text
$module-governance $react-patterns

在 Admin 新增指定业务模块。先检查 docs/module_map.md、现有模块和 public.ts。按照项目结构组织页面、API、Hooks、类型和测试。只建立真正需要的边界，禁止创建空壳或重复抽象。
```

#### ECC-036 · React Hooks 和组件治理

**预计执行时间：45 分钟**（单次执行；包含代码阅读、定向实施/分析与相关验证）

**Skills：** `react-patterns` · `react-testing`

```text
$react-patterns $react-testing

审查 React 组件和 Hooks。检查状态冗余、Effect 滥用、异步竞态、组件职责、重复请求和错误处理。使用现有 Bun Test 与 Testing Library 补充行为测试，不迁移到 Vitest/Jest。
```

#### ECC-037 · TSID 大整数精度保护

**预计执行时间：20 分钟**（单次执行；包含代码阅读、定向实施/分析与相关验证）

**Skills：** `contract-first` · `tdd-workflow`

```text
$contract-first $tdd-workflow

审计 EntityId、safeParseBigIntJson 和 Axios JSON 解析链路。验证 64 位 TSID、字符串内部长数字、转义字符、安全整数边界和负数。禁止恢复正则替换方案，禁止使用 Number 或 parseInt 转换 TSID。
```

#### ECC-038 · TanStack Query/Zustand 性能优化

**预计执行时间：60 分钟**（单次执行；包含代码阅读、定向实施/分析与相关验证）

**Skills：** `react-performance` · `benchmark`

```text
$react-performance $benchmark

分析 TanStack Query 和 Zustand 使用情况。找出重复请求、缓存失效、无效重渲染、列表渲染和状态订阅问题。先测量再优化，保留业务行为和模块边界。
```

#### ECC-039 · Admin 鉴权和 CSRF

**预计执行时间：60 分钟**（单次执行；包含代码阅读、定向实施/分析与相关验证）

**Skills：** `security-review` · `react-testing`

```text
$security-review $react-testing

审计登录、Cookie、CSRF、401 处理、权限控制和跨域请求。重点核查 /api/adm、X-Requested-With、SameSite、Cookie Path 和后端鉴权中间件。以实际代码和测试为依据，不改变既有登录协议。
```

#### ECC-040 · 列表分页和搜索一致性

**预计执行时间：45 分钟**（单次执行；包含代码阅读、定向实施/分析与相关验证）

**Skills：** `api-design` · `react-testing`

```text
$api-design $react-testing

检查业务列表页分页、搜索、筛选和排序行为。遵守 DataTablePagination、默认每页 10 条、筛选后 page 重置为 1 等项目规则。找出不一致页面并补充 Bun 单测，使用 bun run test。
```

#### ECC-041 · Admin Playwright E2E

**预计执行时间：60 分钟**（单次执行；包含代码阅读、定向实施/分析与相关验证）

**Skills：** `e2e-testing` · `test-collaboration`

```text
$e2e-testing $test-collaboration

分析 Playwright E2E，优先覆盖登录、用户管理、群组管理、消息管理、组织权限和客服坐席关键流程。遵守不同 E2E config 的环境隔离，使用合成账号和独立测试环境，不得对生产环境写入。
```

#### ECC-042 · Admin 首屏性能优化

**预计执行时间：60 分钟**（单次执行；包含代码阅读、定向实施/分析与相关验证）

**Skills：** `react-performance` · `benchmark-optimization-loop`

```text
$react-performance $benchmark-optimization-loop

测量首屏加载、JS Bundle、路由切换、API 请求、长列表渲染和交互延迟。建立基线，每次验证一个优化假设。禁止通过删除必要功能、降低数据完整性或绕过鉴权获得性能提升。
```


## IMBoy 客户运营后台场景复刻（Admin）

> 本组面向客户业务场景复刻。每个场景提供三条独立提示词：A 新增功能；B 优化现有功能（重点适用于新模型复审旧 AI 代码）；C 测试现有功能。将提示词中的“客户”替换为具体客户、行业、角色和目标流程。



#### ECC-102 · 客户平台运营后台复刻

**预计执行时间（单选一种模式）：A 新增功能 90 分钟 · B 优化现有功能 60 分钟 · C 测试现有功能 45 分钟**

**场景：** 平台账号与权限治理

**A · 新增功能 · `product-capability` + `orch-add-feature` + `react-patterns` + `tdd-workflow`**

```text
$product-capability $orch-add-feature $react-patterns $tdd-workflow

业务场景：客户平台运营后台复刻（平台账号与权限治理）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：为该场景新增功能。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

读取该场景对应的领域概念、路由/接口、数据模型、Flutter/Admin 消费入口和现有测试，先做能力盘点：哪些可直接复用、哪些可通过配置组合、哪些确实缺失。不得重复造轮子或把未开放能力当作已交付。

为真正缺失的能力形成 capability contract：角色与权限、用户旅程、状态机、输入输出、数据归属、API/WS、迁移兼容、失败恢复、观测和验收标准。客户输入不完整时列出阻塞问题并停在方案阶段；需求明确时按 orch-add-feature 的计划门禁执行，先写失败测试再实现最小差异。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

运行相关定向测试和契约/架构门禁。只修改批准范围，不 commit、不 push、不合并、不部署。
```

**B · 优化现有功能 / 新模型复审旧 AI 代码 · `brownfield-retrospective` + `react-patterns` + `react-testing` + `tdd-workflow` + `verification-loop`**

```text
$brownfield-retrospective $react-patterns $react-testing $tdd-workflow $verification-loop

业务场景：客户平台运营后台复刻（平台账号与权限治理）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：优化现有功能，重点用于新一代 AI 模型复审和改进旧 AI 模型生成的代码。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

按 brownfield-retrospective 的 slice-first 方法，把范围限制在约 15 个文件或 2000 行以内。不要信任旧模型自评、注释或现有测试完整性；独立重建真实行为、调用链、数据流、权限边界、失败路径、并发/竞态、资源生命周期和跨端契约，建立改动前测试/性能/错误行为基线。

重点检查：逻辑正确性、边界条件、异常处理、幂等与重试、安全、性能热点、重复/过度抽象、可维护性和跨端一致性；特别排查只改响应未改查询/持久化、只修主路径漏掉其他分支、字段/可空性漂移、异常吞掉、UI-only 权限、mock 通过但真实路径失败、测试与实现共享错误假设等 AI 常见盲点。

每项发现提供文件/行号、证据、影响、风险和最小修复方案。优先行为保持型优化；先新增/修正测试证明问题，再做最小改动。涉及公共 API/WS、数据库结构、E2EE、权限语义或用户可见行为变化时先请求确认。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

先在会话中输出基线和差距清单；不要自动创建 docs/retro 或重复报告。对范围内明确且行为保持的改进可以实施；完成后运行相关测试、静态检查和 diff review，报告改动前后证据与未验证项。不 commit、不 push、不合并、不部署。
```

**C · 测试现有功能 · `test-collaboration` + `ai-regression-testing` + `react-testing` + `verification-loop`**

```text
$test-collaboration $ai-regression-testing $react-testing $verification-loop

业务场景：客户平台运营后台复刻（平台账号与权限治理）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：测试现有功能，独立验证旧 AI 模型生成的实现。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

先不要修改业务实现。盘点该场景已有单元、集成、契约、E2E、平台/设备测试和 CI 门禁，建立“需求/不变量 → 测试资产或 TEST-ID → 命令 → 证据”矩阵。覆盖正常路径、权限拒绝、非法输入、边界值、重复请求、并发、超时、故障恢复、旧数据兼容和跨端行为。

针对 AI 生成代码特别检查 mock/sandbox 与真实路径不一致、数据库查询/写入字段遗漏、序列化遗漏、仅测 happy path、异常吞掉、重试重复副作用和测试 fixture 迎合实现。只新增有区分力的测试，不复制重复用例、不降低阈值、不扩大 skip。bun run test（必须 --isolate）、bun run check 和仓库现有 Playwright 配置；禁止改用 Vitest/Jest。

逐项报告 PASS/FAIL/BLOCKED/NOT RUN、真实命令、退出码、测试数量和证据位置。发现缺陷先提供复现和最小修复建议；未经授权不修改业务代码。不得把未执行或环境缺失标记为 PASS。
```

#### ECC-103 · 客户社区运营后台复刻

**预计执行时间（单选一种模式）：A 新增功能 90 分钟 · B 优化现有功能 60 分钟 · C 测试现有功能 45 分钟**

**场景：** 内容与社群治理后台

**A · 新增功能 · `product-capability` + `orch-add-feature` + `react-patterns` + `tdd-workflow`**

```text
$product-capability $orch-add-feature $react-patterns $tdd-workflow

业务场景：客户社区运营后台复刻（内容与社群治理后台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：为该场景新增功能。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

读取该场景对应的领域概念、路由/接口、数据模型、Flutter/Admin 消费入口和现有测试，先做能力盘点：哪些可直接复用、哪些可通过配置组合、哪些确实缺失。不得重复造轮子或把未开放能力当作已交付。

为真正缺失的能力形成 capability contract：角色与权限、用户旅程、状态机、输入输出、数据归属、API/WS、迁移兼容、失败恢复、观测和验收标准。客户输入不完整时列出阻塞问题并停在方案阶段；需求明确时按 orch-add-feature 的计划门禁执行，先写失败测试再实现最小差异。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

运行相关定向测试和契约/架构门禁。只修改批准范围，不 commit、不 push、不合并、不部署。
```

**B · 优化现有功能 / 新模型复审旧 AI 代码 · `brownfield-retrospective` + `react-patterns` + `react-testing` + `tdd-workflow` + `verification-loop`**

```text
$brownfield-retrospective $react-patterns $react-testing $tdd-workflow $verification-loop

业务场景：客户社区运营后台复刻（内容与社群治理后台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：优化现有功能，重点用于新一代 AI 模型复审和改进旧 AI 模型生成的代码。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

按 brownfield-retrospective 的 slice-first 方法，把范围限制在约 15 个文件或 2000 行以内。不要信任旧模型自评、注释或现有测试完整性；独立重建真实行为、调用链、数据流、权限边界、失败路径、并发/竞态、资源生命周期和跨端契约，建立改动前测试/性能/错误行为基线。

重点检查：逻辑正确性、边界条件、异常处理、幂等与重试、安全、性能热点、重复/过度抽象、可维护性和跨端一致性；特别排查只改响应未改查询/持久化、只修主路径漏掉其他分支、字段/可空性漂移、异常吞掉、UI-only 权限、mock 通过但真实路径失败、测试与实现共享错误假设等 AI 常见盲点。

每项发现提供文件/行号、证据、影响、风险和最小修复方案。优先行为保持型优化；先新增/修正测试证明问题，再做最小改动。涉及公共 API/WS、数据库结构、E2EE、权限语义或用户可见行为变化时先请求确认。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

先在会话中输出基线和差距清单；不要自动创建 docs/retro 或重复报告。对范围内明确且行为保持的改进可以实施；完成后运行相关测试、静态检查和 diff review，报告改动前后证据与未验证项。不 commit、不 push、不合并、不部署。
```

**C · 测试现有功能 · `test-collaboration` + `ai-regression-testing` + `react-testing` + `verification-loop`**

```text
$test-collaboration $ai-regression-testing $react-testing $verification-loop

业务场景：客户社区运营后台复刻（内容与社群治理后台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：测试现有功能，独立验证旧 AI 模型生成的实现。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

先不要修改业务实现。盘点该场景已有单元、集成、契约、E2E、平台/设备测试和 CI 门禁，建立“需求/不变量 → 测试资产或 TEST-ID → 命令 → 证据”矩阵。覆盖正常路径、权限拒绝、非法输入、边界值、重复请求、并发、超时、故障恢复、旧数据兼容和跨端行为。

针对 AI 生成代码特别检查 mock/sandbox 与真实路径不一致、数据库查询/写入字段遗漏、序列化遗漏、仅测 happy path、异常吞掉、重试重复副作用和测试 fixture 迎合实现。只新增有区分力的测试，不复制重复用例、不降低阈值、不扩大 skip。bun run test（必须 --isolate）、bun run check 和仓库现有 Playwright 配置；禁止改用 Vitest/Jest。

逐项报告 PASS/FAIL/BLOCKED/NOT RUN、真实命令、退出码、测试数量和证据位置。发现缺陷先提供复现和最小修复建议；未经授权不修改业务代码。不得把未执行或环境缺失标记为 PASS。
```

#### ECC-104 · 客户企业管理控制台复刻

**预计执行时间（单选一种模式）：A 新增功能 90 分钟 · B 优化现有功能 60 分钟 · C 测试现有功能 45 分钟**

**场景：** 组织与企业管理后台

**A · 新增功能 · `product-capability` + `orch-add-feature` + `react-patterns` + `tdd-workflow`**

```text
$product-capability $orch-add-feature $react-patterns $tdd-workflow

业务场景：客户企业管理控制台复刻（组织与企业管理后台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：为该场景新增功能。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

读取该场景对应的领域概念、路由/接口、数据模型、Flutter/Admin 消费入口和现有测试，先做能力盘点：哪些可直接复用、哪些可通过配置组合、哪些确实缺失。不得重复造轮子或把未开放能力当作已交付。

为真正缺失的能力形成 capability contract：角色与权限、用户旅程、状态机、输入输出、数据归属、API/WS、迁移兼容、失败恢复、观测和验收标准。客户输入不完整时列出阻塞问题并停在方案阶段；需求明确时按 orch-add-feature 的计划门禁执行，先写失败测试再实现最小差异。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

运行相关定向测试和契约/架构门禁。只修改批准范围，不 commit、不 push、不合并、不部署。
```

**B · 优化现有功能 / 新模型复审旧 AI 代码 · `brownfield-retrospective` + `react-patterns` + `react-testing` + `tdd-workflow` + `verification-loop`**

```text
$brownfield-retrospective $react-patterns $react-testing $tdd-workflow $verification-loop

业务场景：客户企业管理控制台复刻（组织与企业管理后台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：优化现有功能，重点用于新一代 AI 模型复审和改进旧 AI 模型生成的代码。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

按 brownfield-retrospective 的 slice-first 方法，把范围限制在约 15 个文件或 2000 行以内。不要信任旧模型自评、注释或现有测试完整性；独立重建真实行为、调用链、数据流、权限边界、失败路径、并发/竞态、资源生命周期和跨端契约，建立改动前测试/性能/错误行为基线。

重点检查：逻辑正确性、边界条件、异常处理、幂等与重试、安全、性能热点、重复/过度抽象、可维护性和跨端一致性；特别排查只改响应未改查询/持久化、只修主路径漏掉其他分支、字段/可空性漂移、异常吞掉、UI-only 权限、mock 通过但真实路径失败、测试与实现共享错误假设等 AI 常见盲点。

每项发现提供文件/行号、证据、影响、风险和最小修复方案。优先行为保持型优化；先新增/修正测试证明问题，再做最小改动。涉及公共 API/WS、数据库结构、E2EE、权限语义或用户可见行为变化时先请求确认。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

先在会话中输出基线和差距清单；不要自动创建 docs/retro 或重复报告。对范围内明确且行为保持的改进可以实施；完成后运行相关测试、静态检查和 diff review，报告改动前后证据与未验证项。不 commit、不 push、不合并、不部署。
```

**C · 测试现有功能 · `test-collaboration` + `ai-regression-testing` + `react-testing` + `verification-loop`**

```text
$test-collaboration $ai-regression-testing $react-testing $verification-loop

业务场景：客户企业管理控制台复刻（组织与企业管理后台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：测试现有功能，独立验证旧 AI 模型生成的实现。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

先不要修改业务实现。盘点该场景已有单元、集成、契约、E2E、平台/设备测试和 CI 门禁，建立“需求/不变量 → 测试资产或 TEST-ID → 命令 → 证据”矩阵。覆盖正常路径、权限拒绝、非法输入、边界值、重复请求、并发、超时、故障恢复、旧数据兼容和跨端行为。

针对 AI 生成代码特别检查 mock/sandbox 与真实路径不一致、数据库查询/写入字段遗漏、序列化遗漏、仅测 happy path、异常吞掉、重试重复副作用和测试 fixture 迎合实现。只新增有区分力的测试，不复制重复用例、不降低阈值、不扩大 skip。bun run test（必须 --isolate）、bun run check 和仓库现有 Playwright 配置；禁止改用 Vitest/Jest。

逐项报告 PASS/FAIL/BLOCKED/NOT RUN、真实命令、退出码、测试数量和证据位置。发现缺陷先提供复现和最小修复建议；未经授权不修改业务代码。不得把未执行或环境缺失标记为 PASS。
```

#### ECC-105 · 客户客服运营中心复刻

**预计执行时间（单选一种模式）：A 新增功能 120 分钟 · B 优化现有功能 90 分钟 · C 测试现有功能 60 分钟**

**场景：** 客服运营后台

**A · 新增功能 · `product-capability` + `orch-add-feature` + `react-patterns` + `tdd-workflow`**

```text
$product-capability $orch-add-feature $react-patterns $tdd-workflow

业务场景：客户客服运营中心复刻（客服运营后台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：为该场景新增功能。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

读取该场景对应的领域概念、路由/接口、数据模型、Flutter/Admin 消费入口和现有测试，先做能力盘点：哪些可直接复用、哪些可通过配置组合、哪些确实缺失。不得重复造轮子或把未开放能力当作已交付。

为真正缺失的能力形成 capability contract：角色与权限、用户旅程、状态机、输入输出、数据归属、API/WS、迁移兼容、失败恢复、观测和验收标准。客户输入不完整时列出阻塞问题并停在方案阶段；需求明确时按 orch-add-feature 的计划门禁执行，先写失败测试再实现最小差异。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

运行相关定向测试和契约/架构门禁。只修改批准范围，不 commit、不 push、不合并、不部署。
```

**B · 优化现有功能 / 新模型复审旧 AI 代码 · `brownfield-retrospective` + `react-patterns` + `react-testing` + `tdd-workflow` + `verification-loop`**

```text
$brownfield-retrospective $react-patterns $react-testing $tdd-workflow $verification-loop

业务场景：客户客服运营中心复刻（客服运营后台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：优化现有功能，重点用于新一代 AI 模型复审和改进旧 AI 模型生成的代码。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

按 brownfield-retrospective 的 slice-first 方法，把范围限制在约 15 个文件或 2000 行以内。不要信任旧模型自评、注释或现有测试完整性；独立重建真实行为、调用链、数据流、权限边界、失败路径、并发/竞态、资源生命周期和跨端契约，建立改动前测试/性能/错误行为基线。

重点检查：逻辑正确性、边界条件、异常处理、幂等与重试、安全、性能热点、重复/过度抽象、可维护性和跨端一致性；特别排查只改响应未改查询/持久化、只修主路径漏掉其他分支、字段/可空性漂移、异常吞掉、UI-only 权限、mock 通过但真实路径失败、测试与实现共享错误假设等 AI 常见盲点。

每项发现提供文件/行号、证据、影响、风险和最小修复方案。优先行为保持型优化；先新增/修正测试证明问题，再做最小改动。涉及公共 API/WS、数据库结构、E2EE、权限语义或用户可见行为变化时先请求确认。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

先在会话中输出基线和差距清单；不要自动创建 docs/retro 或重复报告。对范围内明确且行为保持的改进可以实施；完成后运行相关测试、静态检查和 diff review，报告改动前后证据与未验证项。不 commit、不 push、不合并、不部署。
```

**C · 测试现有功能 · `test-collaboration` + `ai-regression-testing` + `react-testing` + `verification-loop`**

```text
$test-collaboration $ai-regression-testing $react-testing $verification-loop

业务场景：客户客服运营中心复刻（客服运营后台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：测试现有功能，独立验证旧 AI 模型生成的实现。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

先不要修改业务实现。盘点该场景已有单元、集成、契约、E2E、平台/设备测试和 CI 门禁，建立“需求/不变量 → 测试资产或 TEST-ID → 命令 → 证据”矩阵。覆盖正常路径、权限拒绝、非法输入、边界值、重复请求、并发、超时、故障恢复、旧数据兼容和跨端行为。

针对 AI 生成代码特别检查 mock/sandbox 与真实路径不一致、数据库查询/写入字段遗漏、序列化遗漏、仅测 happy path、异常吞掉、重试重复副作用和测试 fixture 迎合实现。只新增有区分力的测试，不复制重复用例、不降低阈值、不扩大 skip。bun run test（必须 --isolate）、bun run check 和仓库现有 Playwright 配置；禁止改用 Vitest/Jest。

逐项报告 PASS/FAIL/BLOCKED/NOT RUN、真实命令、退出码、测试数量和证据位置。发现缺陷先提供复现和最小修复建议；未经授权不修改业务代码。不得把未执行或环境缺失标记为 PASS。
```

#### ECC-106 · 客户 AI 助手和集成治理后台复刻

**预计执行时间（单选一种模式）：A 新增功能 120 分钟 · B 优化现有功能 90 分钟 · C 测试现有功能 60 分钟**

**场景：** AI Agent、Bot 与 MCP 管理

**A · 新增功能 · `product-capability` + `orch-add-feature` + `react-patterns` + `tdd-workflow`**

```text
$product-capability $orch-add-feature $react-patterns $tdd-workflow

业务场景：客户 AI 助手和集成治理后台复刻（AI Agent、Bot 与 MCP 管理）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：为该场景新增功能。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

读取该场景对应的领域概念、路由/接口、数据模型、Flutter/Admin 消费入口和现有测试，先做能力盘点：哪些可直接复用、哪些可通过配置组合、哪些确实缺失。不得重复造轮子或把未开放能力当作已交付。

为真正缺失的能力形成 capability contract：角色与权限、用户旅程、状态机、输入输出、数据归属、API/WS、迁移兼容、失败恢复、观测和验收标准。客户输入不完整时列出阻塞问题并停在方案阶段；需求明确时按 orch-add-feature 的计划门禁执行，先写失败测试再实现最小差异。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

运行相关定向测试和契约/架构门禁。只修改批准范围，不 commit、不 push、不合并、不部署。
```

**B · 优化现有功能 / 新模型复审旧 AI 代码 · `brownfield-retrospective` + `react-patterns` + `react-testing` + `tdd-workflow` + `verification-loop`**

```text
$brownfield-retrospective $react-patterns $react-testing $tdd-workflow $verification-loop

业务场景：客户 AI 助手和集成治理后台复刻（AI Agent、Bot 与 MCP 管理）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：优化现有功能，重点用于新一代 AI 模型复审和改进旧 AI 模型生成的代码。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

按 brownfield-retrospective 的 slice-first 方法，把范围限制在约 15 个文件或 2000 行以内。不要信任旧模型自评、注释或现有测试完整性；独立重建真实行为、调用链、数据流、权限边界、失败路径、并发/竞态、资源生命周期和跨端契约，建立改动前测试/性能/错误行为基线。

重点检查：逻辑正确性、边界条件、异常处理、幂等与重试、安全、性能热点、重复/过度抽象、可维护性和跨端一致性；特别排查只改响应未改查询/持久化、只修主路径漏掉其他分支、字段/可空性漂移、异常吞掉、UI-only 权限、mock 通过但真实路径失败、测试与实现共享错误假设等 AI 常见盲点。

每项发现提供文件/行号、证据、影响、风险和最小修复方案。优先行为保持型优化；先新增/修正测试证明问题，再做最小改动。涉及公共 API/WS、数据库结构、E2EE、权限语义或用户可见行为变化时先请求确认。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

先在会话中输出基线和差距清单；不要自动创建 docs/retro 或重复报告。对范围内明确且行为保持的改进可以实施；完成后运行相关测试、静态检查和 diff review，报告改动前后证据与未验证项。不 commit、不 push、不合并、不部署。
```

**C · 测试现有功能 · `test-collaboration` + `ai-regression-testing` + `react-testing` + `verification-loop`**

```text
$test-collaboration $ai-regression-testing $react-testing $verification-loop

业务场景：客户 AI 助手和集成治理后台复刻（AI Agent、Bot 与 MCP 管理）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：测试现有功能，独立验证旧 AI 模型生成的实现。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

先不要修改业务实现。盘点该场景已有单元、集成、契约、E2E、平台/设备测试和 CI 门禁，建立“需求/不变量 → 测试资产或 TEST-ID → 命令 → 证据”矩阵。覆盖正常路径、权限拒绝、非法输入、边界值、重复请求、并发、超时、故障恢复、旧数据兼容和跨端行为。

针对 AI 生成代码特别检查 mock/sandbox 与真实路径不一致、数据库查询/写入字段遗漏、序列化遗漏、仅测 happy path、异常吞掉、重试重复副作用和测试 fixture 迎合实现。只新增有区分力的测试，不复制重复用例、不降低阈值、不扩大 skip。bun run test（必须 --isolate）、bun run check 和仓库现有 Playwright 配置；禁止改用 Vitest/Jest。

逐项报告 PASS/FAIL/BLOCKED/NOT RUN、真实命令、退出码、测试数量和证据位置。发现缺陷先提供复现和最小修复建议；未经授权不修改业务代码。不得把未执行或环境缺失标记为 PASS。
```

#### ECC-107 · 客户 SaaS 运营与财务后台复刻

**预计执行时间（单选一种模式）：A 新增功能 90 分钟 · B 优化现有功能 60 分钟 · C 测试现有功能 45 分钟**

**场景：** 财务、计费与审计报表

**A · 新增功能 · `product-capability` + `orch-add-feature` + `react-patterns` + `tdd-workflow`**

```text
$product-capability $orch-add-feature $react-patterns $tdd-workflow

业务场景：客户 SaaS 运营与财务后台复刻（财务、计费与审计报表）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：为该场景新增功能。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

读取该场景对应的领域概念、路由/接口、数据模型、Flutter/Admin 消费入口和现有测试，先做能力盘点：哪些可直接复用、哪些可通过配置组合、哪些确实缺失。不得重复造轮子或把未开放能力当作已交付。

为真正缺失的能力形成 capability contract：角色与权限、用户旅程、状态机、输入输出、数据归属、API/WS、迁移兼容、失败恢复、观测和验收标准。客户输入不完整时列出阻塞问题并停在方案阶段；需求明确时按 orch-add-feature 的计划门禁执行，先写失败测试再实现最小差异。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

运行相关定向测试和契约/架构门禁。只修改批准范围，不 commit、不 push、不合并、不部署。
```

**B · 优化现有功能 / 新模型复审旧 AI 代码 · `brownfield-retrospective` + `react-patterns` + `react-testing` + `tdd-workflow` + `verification-loop`**

```text
$brownfield-retrospective $react-patterns $react-testing $tdd-workflow $verification-loop

业务场景：客户 SaaS 运营与财务后台复刻（财务、计费与审计报表）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：优化现有功能，重点用于新一代 AI 模型复审和改进旧 AI 模型生成的代码。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

按 brownfield-retrospective 的 slice-first 方法，把范围限制在约 15 个文件或 2000 行以内。不要信任旧模型自评、注释或现有测试完整性；独立重建真实行为、调用链、数据流、权限边界、失败路径、并发/竞态、资源生命周期和跨端契约，建立改动前测试/性能/错误行为基线。

重点检查：逻辑正确性、边界条件、异常处理、幂等与重试、安全、性能热点、重复/过度抽象、可维护性和跨端一致性；特别排查只改响应未改查询/持久化、只修主路径漏掉其他分支、字段/可空性漂移、异常吞掉、UI-only 权限、mock 通过但真实路径失败、测试与实现共享错误假设等 AI 常见盲点。

每项发现提供文件/行号、证据、影响、风险和最小修复方案。优先行为保持型优化；先新增/修正测试证明问题，再做最小改动。涉及公共 API/WS、数据库结构、E2EE、权限语义或用户可见行为变化时先请求确认。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

先在会话中输出基线和差距清单；不要自动创建 docs/retro 或重复报告。对范围内明确且行为保持的改进可以实施；完成后运行相关测试、静态检查和 diff review，报告改动前后证据与未验证项。不 commit、不 push、不合并、不部署。
```

**C · 测试现有功能 · `test-collaboration` + `ai-regression-testing` + `react-testing` + `verification-loop`**

```text
$test-collaboration $ai-regression-testing $react-testing $verification-loop

业务场景：客户 SaaS 运营与财务后台复刻（财务、计费与审计报表）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：测试现有功能，独立验证旧 AI 模型生成的实现。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

先不要修改业务实现。盘点该场景已有单元、集成、契约、E2E、平台/设备测试和 CI 门禁，建立“需求/不变量 → 测试资产或 TEST-ID → 命令 → 证据”矩阵。覆盖正常路径、权限拒绝、非法输入、边界值、重复请求、并发、超时、故障恢复、旧数据兼容和跨端行为。

针对 AI 生成代码特别检查 mock/sandbox 与真实路径不一致、数据库查询/写入字段遗漏、序列化遗漏、仅测 happy path、异常吞掉、重试重复副作用和测试 fixture 迎合实现。只新增有区分力的测试，不复制重复用例、不降低阈值、不扩大 skip。bun run test（必须 --isolate）、bun run check 和仓库现有 Playwright 配置；禁止改用 Vitest/Jest。

逐项报告 PASS/FAIL/BLOCKED/NOT RUN、真实命令、退出码、测试数量和证据位置。发现缺陷先提供复现和最小修复建议；未经授权不修改业务代码。不得把未执行或环境缺失标记为 PASS。
```

#### ECC-119 · 举报、审核与申诉后台

**预计执行时间（单选一种模式）：A 新增功能 90 分钟 · B 优化现有功能 60 分钟 · C 测试现有功能 45 分钟**

**场景：** 平台内容安全和申诉运营台

**A · 新增功能 · `product-capability` + `orch-add-feature` + `react-patterns` + `tdd-workflow`**

```text
$product-capability $orch-add-feature $react-patterns $tdd-workflow

业务场景：举报、审核与申诉后台（平台内容安全和申诉运营台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：为该场景新增功能。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

读取该场景对应的领域概念、路由/接口、数据模型、Flutter/Admin 消费入口和现有测试，先做能力盘点：哪些可直接复用、哪些可通过配置组合、哪些确实缺失。不得重复造轮子或把未开放能力当作已交付。

为真正缺失的能力形成 capability contract：角色与权限、用户旅程、状态机、输入输出、数据归属、API/WS、迁移兼容、失败恢复、观测和验收标准。客户输入不完整时列出阻塞问题并停在方案阶段；需求明确时按 orch-add-feature 的计划门禁执行，先写失败测试再实现最小差异。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

运行相关定向测试和契约/架构门禁。只修改批准范围，不 commit、不 push、不合并、不部署。
```

**B · 优化现有功能 / 新模型复审旧 AI 代码 · `brownfield-retrospective` + `react-patterns` + `react-testing` + `tdd-workflow` + `verification-loop`**

```text
$brownfield-retrospective $react-patterns $react-testing $tdd-workflow $verification-loop

业务场景：举报、审核与申诉后台（平台内容安全和申诉运营台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：优化现有功能，重点用于新一代 AI 模型复审和改进旧 AI 模型生成的代码。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

按 brownfield-retrospective 的 slice-first 方法，把范围限制在约 15 个文件或 2000 行以内。不要信任旧模型自评、注释或现有测试完整性；独立重建真实行为、调用链、数据流、权限边界、失败路径、并发/竞态、资源生命周期和跨端契约，建立改动前测试/性能/错误行为基线。

重点检查：逻辑正确性、边界条件、异常处理、幂等与重试、安全、性能热点、重复/过度抽象、可维护性和跨端一致性；特别排查只改响应未改查询/持久化、只修主路径漏掉其他分支、字段/可空性漂移、异常吞掉、UI-only 权限、mock 通过但真实路径失败、测试与实现共享错误假设等 AI 常见盲点。

每项发现提供文件/行号、证据、影响、风险和最小修复方案。优先行为保持型优化；先新增/修正测试证明问题，再做最小改动。涉及公共 API/WS、数据库结构、E2EE、权限语义或用户可见行为变化时先请求确认。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

先在会话中输出基线和差距清单；不要自动创建 docs/retro 或重复报告。对范围内明确且行为保持的改进可以实施；完成后运行相关测试、静态检查和 diff review，报告改动前后证据与未验证项。不 commit、不 push、不合并、不部署。
```

**C · 测试现有功能 · `test-collaboration` + `ai-regression-testing` + `react-testing` + `verification-loop`**

```text
$test-collaboration $ai-regression-testing $react-testing $verification-loop

业务场景：举报、审核与申诉后台（平台内容安全和申诉运营台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：测试现有功能，独立验证旧 AI 模型生成的实现。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

先不要修改业务实现。盘点该场景已有单元、集成、契约、E2E、平台/设备测试和 CI 门禁，建立“需求/不变量 → 测试资产或 TEST-ID → 命令 → 证据”矩阵。覆盖正常路径、权限拒绝、非法输入、边界值、重复请求、并发、超时、故障恢复、旧数据兼容和跨端行为。

针对 AI 生成代码特别检查 mock/sandbox 与真实路径不一致、数据库查询/写入字段遗漏、序列化遗漏、仅测 happy path、异常吞掉、重试重复副作用和测试 fixture 迎合实现。只新增有区分力的测试，不复制重复用例、不降低阈值、不扩大 skip。bun run test（必须 --isolate）、bun run check 和仓库现有 Playwright 配置；禁止改用 Vitest/Jest。

逐项报告 PASS/FAIL/BLOCKED/NOT RUN、真实命令、退出码、测试数量和证据位置。发现缺陷先提供复现和最小修复建议；未经授权不修改业务代码。不得把未执行或环境缺失标记为 PASS。
```

#### ECC-120 · 公告、反馈与平台运营

**预计执行时间（单选一种模式）：A 新增功能 90 分钟 · B 优化现有功能 60 分钟 · C 测试现有功能 45 分钟**

**场景：** 客户公告管理、反馈处理和运营指标

**A · 新增功能 · `product-capability` + `orch-add-feature` + `react-patterns` + `tdd-workflow`**

```text
$product-capability $orch-add-feature $react-patterns $tdd-workflow

业务场景：公告、反馈与平台运营（客户公告管理、反馈处理和运营指标）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：为该场景新增功能。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

读取该场景对应的领域概念、路由/接口、数据模型、Flutter/Admin 消费入口和现有测试，先做能力盘点：哪些可直接复用、哪些可通过配置组合、哪些确实缺失。不得重复造轮子或把未开放能力当作已交付。

为真正缺失的能力形成 capability contract：角色与权限、用户旅程、状态机、输入输出、数据归属、API/WS、迁移兼容、失败恢复、观测和验收标准。客户输入不完整时列出阻塞问题并停在方案阶段；需求明确时按 orch-add-feature 的计划门禁执行，先写失败测试再实现最小差异。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

运行相关定向测试和契约/架构门禁。只修改批准范围，不 commit、不 push、不合并、不部署。
```

**B · 优化现有功能 / 新模型复审旧 AI 代码 · `brownfield-retrospective` + `react-patterns` + `react-testing` + `tdd-workflow` + `verification-loop`**

```text
$brownfield-retrospective $react-patterns $react-testing $tdd-workflow $verification-loop

业务场景：公告、反馈与平台运营（客户公告管理、反馈处理和运营指标）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：优化现有功能，重点用于新一代 AI 模型复审和改进旧 AI 模型生成的代码。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

按 brownfield-retrospective 的 slice-first 方法，把范围限制在约 15 个文件或 2000 行以内。不要信任旧模型自评、注释或现有测试完整性；独立重建真实行为、调用链、数据流、权限边界、失败路径、并发/竞态、资源生命周期和跨端契约，建立改动前测试/性能/错误行为基线。

重点检查：逻辑正确性、边界条件、异常处理、幂等与重试、安全、性能热点、重复/过度抽象、可维护性和跨端一致性；特别排查只改响应未改查询/持久化、只修主路径漏掉其他分支、字段/可空性漂移、异常吞掉、UI-only 权限、mock 通过但真实路径失败、测试与实现共享错误假设等 AI 常见盲点。

每项发现提供文件/行号、证据、影响、风险和最小修复方案。优先行为保持型优化；先新增/修正测试证明问题，再做最小改动。涉及公共 API/WS、数据库结构、E2EE、权限语义或用户可见行为变化时先请求确认。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

先在会话中输出基线和差距清单；不要自动创建 docs/retro 或重复报告。对范围内明确且行为保持的改进可以实施；完成后运行相关测试、静态检查和 diff review，报告改动前后证据与未验证项。不 commit、不 push、不合并、不部署。
```

**C · 测试现有功能 · `test-collaboration` + `ai-regression-testing` + `react-testing` + `verification-loop`**

```text
$test-collaboration $ai-regression-testing $react-testing $verification-loop

业务场景：公告、反馈与平台运营（客户公告管理、反馈处理和运营指标）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：测试现有功能，独立验证旧 AI 模型生成的实现。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

先不要修改业务实现。盘点该场景已有单元、集成、契约、E2E、平台/设备测试和 CI 门禁，建立“需求/不变量 → 测试资产或 TEST-ID → 命令 → 证据”矩阵。覆盖正常路径、权限拒绝、非法输入、边界值、重复请求、并发、超时、故障恢复、旧数据兼容和跨端行为。

针对 AI 生成代码特别检查 mock/sandbox 与真实路径不一致、数据库查询/写入字段遗漏、序列化遗漏、仅测 happy path、异常吞掉、重试重复副作用和测试 fixture 迎合实现。只新增有区分力的测试，不复制重复用例、不降低阈值、不扩大 skip。bun run test（必须 --isolate）、bun run check 和仓库现有 Playwright 配置；禁止改用 Vitest/Jest。

逐项报告 PASS/FAIL/BLOCKED/NOT RUN、真实命令、退出码、测试数量和证据位置。发现缺陷先提供复现和最小修复建议；未经授权不修改业务代码。不得把未执行或环境缺失标记为 PASS。
```

#### ECC-121 · 插件、企业应用与集成治理后台

**预计执行时间（单选一种模式）：A 新增功能 120 分钟 · B 优化现有功能 90 分钟 · C 测试现有功能 60 分钟**

**场景：** 客户插件市场、OA 应用和外部集成控制台

**A · 新增功能 · `product-capability` + `orch-add-feature` + `react-patterns` + `tdd-workflow`**

```text
$product-capability $orch-add-feature $react-patterns $tdd-workflow

业务场景：插件、企业应用与集成治理后台（客户插件市场、OA 应用和外部集成控制台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：为该场景新增功能。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

读取该场景对应的领域概念、路由/接口、数据模型、Flutter/Admin 消费入口和现有测试，先做能力盘点：哪些可直接复用、哪些可通过配置组合、哪些确实缺失。不得重复造轮子或把未开放能力当作已交付。

为真正缺失的能力形成 capability contract：角色与权限、用户旅程、状态机、输入输出、数据归属、API/WS、迁移兼容、失败恢复、观测和验收标准。客户输入不完整时列出阻塞问题并停在方案阶段；需求明确时按 orch-add-feature 的计划门禁执行，先写失败测试再实现最小差异。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

运行相关定向测试和契约/架构门禁。只修改批准范围，不 commit、不 push、不合并、不部署。
```

**B · 优化现有功能 / 新模型复审旧 AI 代码 · `brownfield-retrospective` + `react-patterns` + `react-testing` + `tdd-workflow` + `verification-loop`**

```text
$brownfield-retrospective $react-patterns $react-testing $tdd-workflow $verification-loop

业务场景：插件、企业应用与集成治理后台（客户插件市场、OA 应用和外部集成控制台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：优化现有功能，重点用于新一代 AI 模型复审和改进旧 AI 模型生成的代码。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

按 brownfield-retrospective 的 slice-first 方法，把范围限制在约 15 个文件或 2000 行以内。不要信任旧模型自评、注释或现有测试完整性；独立重建真实行为、调用链、数据流、权限边界、失败路径、并发/竞态、资源生命周期和跨端契约，建立改动前测试/性能/错误行为基线。

重点检查：逻辑正确性、边界条件、异常处理、幂等与重试、安全、性能热点、重复/过度抽象、可维护性和跨端一致性；特别排查只改响应未改查询/持久化、只修主路径漏掉其他分支、字段/可空性漂移、异常吞掉、UI-only 权限、mock 通过但真实路径失败、测试与实现共享错误假设等 AI 常见盲点。

每项发现提供文件/行号、证据、影响、风险和最小修复方案。优先行为保持型优化；先新增/修正测试证明问题，再做最小改动。涉及公共 API/WS、数据库结构、E2EE、权限语义或用户可见行为变化时先请求确认。React 模块 public.ts、TypeScript、EntityId/TSID 精度、API client、TanStack Query/Zustand 和权限边界。

先在会话中输出基线和差距清单；不要自动创建 docs/retro 或重复报告。对范围内明确且行为保持的改进可以实施；完成后运行相关测试、静态检查和 diff review，报告改动前后证据与未验证项。不 commit、不 push、不合并、不部署。
```

**C · 测试现有功能 · `test-collaboration` + `ai-regression-testing` + `react-testing` + `verification-loop`**

```text
$test-collaboration $ai-regression-testing $react-testing $verification-loop

业务场景：插件、企业应用与集成治理后台（客户插件市场、OA 应用和外部集成控制台）。客户信息：[填写客户行业、用户角色、业务目标、关键流程、特殊业务规则、数据规模和验收指标]。本次范围：[填写具体端、模块、功能切片]。

任务：测试现有功能，独立验证旧 AI 模型生成的实现。

先核对当前仓库 HEAD、工作区状态、AGENTS.md/CLAUDE.md、架构/产品文档、API/WS/数据契约、真实代码和测试。以代码与可执行证据为准，标记 CURRENT、TARGET、LOCKED、UNKNOWN、NOT_VERIFIED；不能把文档/API 存在等同于功能已经端到端交付。

先不要修改业务实现。盘点该场景已有单元、集成、契约、E2E、平台/设备测试和 CI 门禁，建立“需求/不变量 → 测试资产或 TEST-ID → 命令 → 证据”矩阵。覆盖正常路径、权限拒绝、非法输入、边界值、重复请求、并发、超时、故障恢复、旧数据兼容和跨端行为。

针对 AI 生成代码特别检查 mock/sandbox 与真实路径不一致、数据库查询/写入字段遗漏、序列化遗漏、仅测 happy path、异常吞掉、重试重复副作用和测试 fixture 迎合实现。只新增有区分力的测试，不复制重复用例、不降低阈值、不扩大 skip。bun run test（必须 --isolate）、bun run check 和仓库现有 Playwright 配置；禁止改用 Vitest/Jest。

逐项报告 PASS/FAIL/BLOCKED/NOT RUN、真实命令、退出码、测试数量和证据位置。发现缺陷先提供复现和最小修复建议；未经授权不修改业务代码。不得把未执行或环境缺失标记为 PASS。
```

## 维护说明

- 本文只维护本仓库职责范围内的提示词；跨仓案例的统一索引位于 [imboy 后端主仓 docs/prompts/README.md](https://github.com/imboy-pub/imboy/blob/main/docs/prompts/README.md)。
- 修改案例时保持 ECC 编号不变；新增案例先在后端主仓索引登记编号和归属，避免重复。
- Skill 名称必须与 ECC `skills/<name>/SKILL.md` 中的目录名一致；ECC 升级后应重新核对可用性。
- 提示词是任务入口，不是执行结果或质量证明；验收以真实代码、测试和 CI 证据为准。
