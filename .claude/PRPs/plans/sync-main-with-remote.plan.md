# Plan: imboyadmin main 分叉收敛与推送远端

## Summary

本地 `main` 领先远端 156 个提交、落后 125 个（分叉点 `ca2a11f`，2026-07-04）。方案：先提交本地脏工作，再 `git merge origin/main` 单次解决冲突，验证全绿后推送全部 3 个远端。**选 merge 不选 rebase**：rebase 需重放 156 个提交（156 次潜在冲突），merge 只解决一轮；且并发会话曾引用本地提交，保哈希稳定。

## User Story

作为仓库维护者，我希望本地 main 与远端收敛后推送，使三端远端（gitcode / gitee / github）代码一致、CI 可跑。

## Problem → Solution

- **现状**：main 与 origin/main 双向分叉（+156/-125）；工作区 8 个脏文件；push 必被拒（non-FF）。
- **目标**：merge 收敛 → 验证全绿 → FF 推送三远端。

## Metadata

- **Complexity**: Medium（git 操作 + 冲突解决，规模不可预知但有一次上限）
- **Source PRD**: N/A（自由文本指令）
- **Estimated Files**: 冲突面 271 个双方改过的文件（hunk 级冲突数待合并后盘点）；0 个新源文件

---

## 探察结论（已核实的事实）

| 事实 | 值 | 来源 |
|---|---|---|
| 分叉点 | `ca2a11f` 2026-07-04 | `git merge-base` |
| 本地独有 | 156 提交（2026-07-06 → 09-05） | `git rev-list --count origin/main..main` |
| 远端独有 | 125 提交（fix 30 / docs 28 / build 23 / test 20 / feat 9，含 dependabot 5 + merge 4） | `git log main..origin/main` |
| 远端 tip | `1088e7b`（origin/gitee 与 gitcode 相同；github 未单查，待推前核） | fetch 后 |
| 本地 156 提交 | 仅存本地，未推任何远端 → merge 不改历史，绝对安全 | 三远端 rev-parse |
| 脏文件 × 对端改动重叠 | `src/modules/plugin_management/api/plugins.ts`、`PluginManagementPage.tsx`（必须先提交脏工作） | comm 对比 |
| 双方都改的敏感文件 | `package.json`、`bun.lock`、`.github/workflows/*`、`.gitignore`、`lefthook.yml` | overlap 清单 |
| 已提交 .env | 均为 `__IMBOY_*__` 占位符，无真实密钥 | `git show HEAD:.env.production` |
| 校验命令 | `bun run check`（eslint+tsc+knip）、`bun test --isolate`、`bun run build` | package.json scripts |

## 强制先读

| 优先级 | 文件 | 为什么 |
|---|---|---|
| P0 | `lefthook.yml` | pre-commit/pre-push 钩子行为决定提交与推送方式（`d89dc6f` 给 pre-push 挂了 Playwright e2e，可能需后端在线） |
| P1 | `package.json`（双方版本） | 依赖 union 后 `bun install` 重锁 |
| P2 | `git log --oneline main..origin/main` 全量 | 冲突裁决时知道对端每个提交的意图 |

---

## NOT Building

- 不 rebase、不 force-push。
- 不动 imboy / imboyapp（另两仓本次只读）。
- 不做全历史密钥扫描（已抽查无泄漏；如需 gitleaks 全扫另立任务）。
- 不解决依赖升级兼容问题（dependabot 仅 types 包，风险低）。

---

## Step-by-Step Tasks

### Task 1: 清空工作区（先提交脏工作，再清垃圾）
- **ACTION**: 把 7 个有效脏文件提交为一个 WIP 提交；删除 `erl_crash.dump` 并加入 `.gitignore`。
- **IMPLEMENT**:
  ```bash
  rm erl_crash.dump
  # .gitignore 追加一行: erl_crash.dump
  git add .gitignore \
    src/generated/generatedFeatureComposition.tsx src/generated/productFeatures.ts \
    src/modules/plugin_management/api/plugins.ts \
    src/modules/plugin_management/pages/PluginManagementPage.tsx \
    src/modules/reports/contracts/reportPanelExtension.ts \
    tests/auto_test/scripts/plugin_gate_probe.escript \
    tests/e2e/auto_test/round_w2r2_plugin_fix_verify.spec.ts
  git commit -m "chore(wip): 插件门禁探针与举报面板接线——merge 前落盘本地脏工作" --no-verify? # 否：正常走钩子
  ```
- **MIRROR**: 精确 pathspec 提交，**禁 `git add -A`**（并发会话教训）；`.gitignore` 本就是双方改动文件，此行并入 WIP 提交可接受（冲突时人工保双方行）。
- **GOTCHA**: lefthook hide-unstaged 曾吃 MM 文件改动 → 上述 7 文件一次性全量暂存后再提交，不留 MM 态。
- **VALIDATE**: `git status --porcelain` 输出为空。

### Task 2: 合并并盘点冲突
- **ACTION**: `git merge origin/main --no-edit`，预期冲突非零。
- **IMPLEMENT**: 冲突清单入 `/tmp/conflicts.txt`：`git status --porcelain | grep -E '^(UU|AA|DU|UD|AU|UA)'`。
- **VALIDATE**: 拿到冲突总数；若为 0（不太可能）直接跳 Task 4。

### Task 3: 分类解决冲突（一轮解决完）
- **ACTION**: 按类裁决，规则如下：
  | 类别 | 规则 |
  |---|---|
  | `bun.lock` | **禁止手合**。先手合 `package.json`（依赖取双方 union，版本冲突取高者），然后 `bun install` 重生成锁文件，`git add bun.lock` |
  | `src/**/*.tsx/ts`（业务代码） | 语义合并：对端多为 fix/test 加固，本地多为新功能；逐个看双方 diff 意图后融合。冲突裁决完成跑 `bun run typecheck` 兜底 |
  | `src/generated/*` | 若仓内有 codegen 脚本则解决后重跑生成；无则手工融合（两生成文件本轮就在脏清单里，模式已知） |
  | `.github/workflows/*` | 取双方并集（本地改动 + 对端 `fix(ci)` 三连 + e2e 进 CI） |
  | `docs/**` | 双方保留（内容互补） |
  | `.gitignore` / `lefthook.yml` | 逐行 union |
- **GOTCHA**: `git checkout --theirs/--ours` 只对整文件有效，业务代码禁用整文件择边（会静默丢 156 或 125 提交之一的成果）。
- **VALIDATE**: `git status --porcelain | grep -E '^(UU|AA)'` 为空；`git diff --stat HEAD` 无异常巨量删行。

### Task 4: 全量验证
- **ACTION**: 依次跑，任何一步红即停修：
  ```bash
  bun install                     # 锁文件一致性
  bun run check                   # eslint + tsc --noEmit + knip
  bun test --isolate              # 单元测试（--isolate 必须，内存教训）
  bun run build                   # tsc -b && vite build
  ```
- **可选**: `bun run test:e2e`（需后端就绪，若环境不备则记录跳过原因）。
- **VALIDATE**: 四条命令全部 0 退出。

### Task 5: 提交 merge 并推送三远端（推送前向用户最终确认目标清单）
- **ACTION**:
  ```bash
  git commit --no-edit            # 完成 merge commit（走 lefthook 钩子）
  git log -1 --stat | head -20    # 幻影提交教训：commit 后必须 git log 核实
  git push gitcode main
  git push origin main            # gitee imboy-pub
  git push github main            # 会首次触发 GH CI——外向动作，执行前确认
  ```
- **GOTCHA**: pre-push 钩子若挂 e2e 且无后端 → 卡住时查 `lefthook.yml`，必要时该次 push 与用户商定（不静默 `--no-verify`）。
- **VALIDATE**: 三远端 `git ls-remote <remote> refs/heads/main` 哈希一致且等于本地 HEAD。

---

## Testing Strategy

| 验证 | 输入 | 预期 |
|---|---|---|
| `bun run check` | 合并后全仓 | eslint 0 错、tsc 0 错、knip 不新增死代码 |
| `bun test --isolate` | 全部单元测试 | 全绿 |
| `bun run build` | 生产构建 | 成功产出 dist |
| 冲突回归抽查 | 双方各抽 3 个代表性提交（本地 feat + 对端 fix）涉及的文件 | 改动仍在合并结果中（`git log --follow` 可见双亲） |

---

## Risks

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| 冲突量超预期（271 文件重叠面） | 中 | 工时拉长 | 一轮 merge 上限明确；`package.json`/`bun.lock` 有确定性流程；真解不动时回滚 `git merge --abort` 重来，不硬凑 |
| 业务代码择边误丢一方成果 | 低 | 功能静默回退 | 禁整文件 --ours/--theirs；typecheck+全量测试兜底 |
| pre-push e2e 钩子阻塞推送 | 中 | 推送失败 | 提前读 lefthook.yml；无后端时与用户商定，不静默跳过 |
| 并发会话正在本仓操作 | 低 | 暂存/锁竞争 | 执行前 `git status` 确认无它人暂存；锁残留则清 `.git/index.lock` 前先核实无活动进程 |
| GH CI 首跑暴露存量问题 | 高 | CI 红 | 属预期收益非回归；红了另开修复任务 |

## Acceptance Criteria

- [ ] `git status --porcelain` 干净
- [ ] main 包含双方全部提交（`git log --oneline | grep -c` 对端 125 个消息主题可溯）
- [ ] check / test / build 全绿
- [ ] 三远端 main 哈希 == 本地 HEAD

## Notes

- 不设 upstream tracking（历史原因三仓均未设；merge 后可顺手 `git branch --set-upstream-to=origin/main main`，可选）。
- 本方案获批后执行；推送目标清单（尤其 github 首次触发 CI）在 Task 5 前向用户口头确认一次。
