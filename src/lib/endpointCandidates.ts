/**
 * 端点解析：环境变量覆盖 + 编译期默认值。**不做运行时探测。**
 *
 * ## 为什么删掉了原来的探测机制
 *
 * 此前这里有 `buildEndpointCandidates` / `isEndpointUnavailable` /
 * `tryWithFallback` / `tryPutWithPostFallback`：请求失败时判断"是不是这个端点
 * 不存在"，是就换下一个候选重发。三个问题让它不可修复：
 *
 * 1. **判据在结构上不可能正确。** services/api/client.ts 把业务错误
 *    （HTTP 200 + data.code≠0）与 HTTP 错误统一压成 `{code, msg}`，HTTP 状态
 *    被丢弃。到达判据时 `{code:404}` 既可能是"路由不存在"也可能是"角色不存在"
 *    ——后端 error_code.hrl 里 404 有 5 个不同业务语义。原实现因此退化成匹配
 *    错误文案子串（'not found' / '404' / 'method not allowed'），任何业务错误
 *    文案撞上就误判。
 *
 * 2. **误判的代价是重放写请求。** 被它包住的是角色权限保存、管理员角色分配、
 *    管理员禁用 —— 全是写操作。第一次请求可能已部分生效。
 *
 * 3. **更糟的是候选链本身跨越了语义。** ADMIN_DISABLE 的候选链曾是
 *    ['/admin/disable', '/admins/disable', '/admin/delete', '/admins/delete']
 *    ——禁用失败会回退去调**删除**。
 *
 * ## 为什么删除是安全的
 *
 * 后端 imboy_router.erl 把前端探测过的每一个别名都注册成了同一个 action：
 *   /api/adm/role/list             + /api/adm/roles/list
 *   /api/adm/role/permissions/save + /api/adm/role/permission/update
 *                                  + /api/adm/roles/permissions/save
 *   /api/adm/role/{create,disable,delete} + /api/adm/roles/{...}
 * 即第一个候选永远命中，回退分支从未被真正走到过。
 *
 * 同理 adm_role_handler:permissions_save_action/3 对 PUT 与 POST 都路由到同一个
 * save_permissions_handle/2，所谓"PUT 失败回退 POST"也从来不需要。
 *
 * 契约漂移应该靠 CI 的 OpenAPI↔router 双向 diff 发现，而不是让前端在运行时
 * 拿写请求去试探。
 */

export function normalizeEndpoint(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * 解析端点：优先用环境变量覆盖，否则用默认值。
 *
 * 环境变量取**第一个**非空项 —— 历史上 VITE_*_ENDPOINT 支持逗号分隔的候选
 * 列表，保留兼容解析以免旧 .env 直接失效，但只取首项，不再逐个尝试。
 */
export function resolveEndpoint(rawEnv: unknown, defaultEndpoint: string): string {
  if (typeof rawEnv === 'string') {
    const first = rawEnv
      .split(',')
      .map(normalizeEndpoint)
      .find((s) => s.length > 0)
    if (first) return first
  }
  return normalizeEndpoint(defaultEndpoint)
}
