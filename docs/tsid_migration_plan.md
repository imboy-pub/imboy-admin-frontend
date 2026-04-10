# TSID 迁移计划 — Admin Frontend

> 创建日期: 2026-04-06
> 状态: **已完成** (2026-04-07 后端迁移完成，elib_hashids 已删除)

## 背景

后端已从 BIGSERIAL (自增) + `elib_hashids` 编码完成迁移到 `elib_tsid` (分布式时间排序 ID，原始 BIGINT)。`elib_hashids` 已于 2026-04-07 删除。

- **旧流程**: DB 生成 BIGSERIAL → 后端 hashids 编码 → 前端收到 hashid 字符串 (如 `"522dzx"`)
- **新流程**: 后端生成 TSID (64 位 BIGINT) → 前端收到数字或字符串

**精度风险**: JavaScript `Number.MAX_SAFE_INTEGER` = `2^53 - 1` (约 16 位)，TSID 最大 `2^63 - 1` (19 位)。直接用 `number` 接收**会丢失精度**。

## 策略选择

采用 CLAUDE.md 中推荐的方案: **后端以字符串传输 TSID，前端统一用 `string` 类型**。

理由:
1. 前端类型定义中大部分实体 ID 已经是 `string`（User, Admin, Group, GroupMember）
2. 路由参数 `useParams()` 返回的就是 `string`
3. 不需要引入 `json-bigint` 等额外依赖
4. 过渡期兼容: hashid 字符串与 TSID 字符串在前端处理完全一致

**备选防护**: 在 axios 添加 `transformResponse` 预处理，将可能的大数字转为字符串。但如果后端保证以字符串传输，则无需此步骤。

## 需要修改的文件

### 1. 新增类型定义 — `src/types/common.ts`

创建 `EntityId` 统一类型别名，替代各模块分散定义的 `IdLike`:

```typescript
/** TSID 编码的 ID，统一用 string 传输避免精度丢失 */
export type EntityId = string;
```

### 2. 类型定义文件 — 已经是 `string`，无需修改

| 文件 | ID 字段 | 当前类型 | 状态 |
|------|---------|---------|------|
| `src/types/user.ts` | `id` | `string` | OK |
| `src/types/admin.ts` | `id` | `string` | OK |
| `src/types/group.ts` | `id`, `group_id`, `user_id`, `owner_uid`, `creator_uid` | `string` | OK |
| `src/types/api.ts` | 无 ID 字段 | - | OK |
| `src/types/systemHealth.ts` | 无 ID 字段 | - | OK |

### 3. 需要迁移 `IdLike` → `EntityId` 的模块 API 文件

这些文件定义了本地 `type IdLike = string | number`，需要逐步收敛为 `EntityId = string`:

| 文件 | IdLike 使用处 |
|------|-------------|
| `src/modules/channels/api/public.ts` | Channel, ChannelMessage, ChannelSubscriber 等所有接口的 ID 字段 |
| `src/modules/moments/api/public.ts` | MomentItem, MomentReport 等 |
| `src/modules/groups/api/public.ts` | GroupDetail |
| `src/modules/groups/api/enhancements.ts` | GroupVote, GroupSchedule, GroupNotice 等 |
| `src/modules/identity/api/users.ts` | 函数参数 uid |
| `src/modules/social_graph/api/collects.ts` | UserCollectListParams.uid |
| `src/modules/social_graph/api/tags.ts` | UserTagListParams.uid |
| `src/modules/ops_governance/api/reports.ts` | ReportTicket 所有 ID 字段 |
| `src/services/api/admins.ts` | AssignAdminRoleInput.admin_id |
| `src/types/message.ts` | ManagedMessage.from_id, to_id |
| `src/types/logoutApplication.ts` | LogoutApplication.uid |

### 4. 路由参数 — 已安全

所有使用 `useParams()` 的页面获取的 `:id` 都是 `string` 类型，直接传给 API 函数，无需修改。

### 5. Table getRowId — 已安全

所有使用 `getRowId` 的表格都已经用 `String(row.id)` 包装，兼容 `string | number`。

### 6. axios 客户端 — 建议添加安全防护

`src/services/api/client.ts` 当前没有自定义 `transformResponse`。如果后端保证 TSID 以 JSON 字符串传输，则无需修改。

**建议添加防护性 `transformResponse`** 作为安全网: 将 JSON 中超过 `MAX_SAFE_INTEGER` 的纯数字转为字符串，防止后端偶尔以数字形式返回时丢失精度。

## 迁移步骤

### Phase 1: 基础设施 (本次完成)

1. [x] 创建 `src/types/common.ts`，导出 `EntityId` 类型
2. [x] 在 `src/types/message.ts` 和 `src/types/logoutApplication.ts` 中将 `IdLike` 替换为导入的 `EntityId`
3. [x] 在 axios client 中添加安全防护性 `transformResponse`

### Phase 2: 模块 API 类型收敛 (后续)

逐模块将本地 `IdLike` 替换为从 `@/types/common` 导入的 `EntityId`。每个模块独立 PR:
- channels → EntityId
- moments → EntityId
- groups → EntityId
- identity → EntityId
- social_graph → EntityId
- ops_governance → EntityId
- services/api/admins → EntityId

### Phase 3: 接口数据验证 (后端配合)

- 确认后端所有接口的 TSID 字段以 JSON string 格式返回
- 如已确认，可移除 `transformResponse` 中的大数字安全防护
