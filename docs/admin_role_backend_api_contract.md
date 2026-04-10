# 管理员与角色联调清单（curl）

本文档用于联调以下后台能力：

1. 新增管理员
2. 新增角色
3. 管理员角色授权

## 前置变量

```bash
export IMBOY_ADMIN_BASE_URL='http://localhost:8082/adm'
export IMBOY_ADMIN_COOKIE='adm_user_id=xxx; adm_user_sig=xxx'
```

说明：

1. `IMBOY_ADMIN_BASE_URL` 不带末尾 `/`
2. `IMBOY_ADMIN_COOKIE` 使用浏览器当前登录态完整 Cookie

## 1) 会话探测

```bash
curl -sS "${IMBOY_ADMIN_BASE_URL}/current" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}"
```

期望：

1. HTTP 200（或未登录时 HTTP 401）
2. API `code=0`（或未登录时 `code=706`）

## 2) 管理员列表

主路由：

```bash
curl -sS "${IMBOY_ADMIN_BASE_URL}/admin/list?page=1&size=10&status=-1" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}"
```

回退路由：

```bash
curl -sS "${IMBOY_ADMIN_BASE_URL}/admins/list?page=1&size=10&status=-1" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}"
```

## 3) 新增管理员

主路由：

```bash
curl -sS -X POST "${IMBOY_ADMIN_BASE_URL}/admin/create" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"account":"ops_demo_01","pwd":"Demo_123456","nickname":"运营演示","role_id":2,"status":1}'
```

回退路由：

```bash
curl -sS -X POST "${IMBOY_ADMIN_BASE_URL}/admins/create" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"account":"ops_demo_01","pwd":"Demo_123456","nickname":"运营演示","role_id":2,"status":1}'
```

## 4) 管理员角色授权

建议先从主路由开始，失败再试回退路由。

主路由（PUT/POST 均可探测）：

```bash
curl -sS -X PUT "${IMBOY_ADMIN_BASE_URL}/admin/assign_role" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"admin_id":"10001","role_id":3}'
```

```bash
curl -sS -X POST "${IMBOY_ADMIN_BASE_URL}/admin/assign_role" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"admin_id":"10001","role_id":3}'
```

回退路由一：

```bash
curl -sS -X PUT "${IMBOY_ADMIN_BASE_URL}/admin/role/update" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"admin_id":"10001","role_id":3}'
```

回退路由二：

```bash
curl -sS -X PUT "${IMBOY_ADMIN_BASE_URL}/admins/assign-role" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"admin_id":"10001","role_id":3}'
```

## 5) 角色列表

主路由：

```bash
curl -sS "${IMBOY_ADMIN_BASE_URL}/role/list" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}"
```

回退路由：

```bash
curl -sS "${IMBOY_ADMIN_BASE_URL}/roles/list" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}"
```

## 6) 新增角色

主路由：

```bash
curl -sS -X POST "${IMBOY_ADMIN_BASE_URL}/role/create" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"name":"内容巡检管理员","description":"负责内容治理巡检","permissions":["reports:read","reports:handle"],"status":1}'
```

回退路由：

```bash
curl -sS -X POST "${IMBOY_ADMIN_BASE_URL}/roles/create" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"name":"内容巡检管理员","description":"负责内容治理巡检","permissions":["reports:read","reports:handle"],"status":1}'
```

## 7) 角色权限保存

主路由（PUT/POST 均可探测）：

```bash
curl -sS -X PUT "${IMBOY_ADMIN_BASE_URL}/role/permissions/save" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"role_id":2,"permissions":["dashboard:view","users:read","reports:read"]}'
```

```bash
curl -sS -X POST "${IMBOY_ADMIN_BASE_URL}/role/permissions/save" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"role_id":2,"permissions":["dashboard:view","users:read","reports:read"]}'
```

回退路由一：

```bash
curl -sS -X PUT "${IMBOY_ADMIN_BASE_URL}/role/permission/update" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"role_id":2,"permissions":["dashboard:view","users:read","reports:read"]}'
```

回退路由二：

```bash
curl -sS -X PUT "${IMBOY_ADMIN_BASE_URL}/roles/permissions/save" \
  -H "Cookie: ${IMBOY_ADMIN_COOKIE}" \
  -H 'Content-Type: application/json' \
  -d '{"role_id":2,"permissions":["dashboard:view","users:read","reports:read"]}'
```

## 一键探测脚本

```bash
bash scripts/check_admin_role_backend_readiness.sh --strict
```

如需显式指定地址和 Cookie：

```bash
IMBOY_ADMIN_BASE_URL='http://localhost:8082/adm' \
IMBOY_ADMIN_COOKIE='adm_user_id=xxx; adm_user_sig=xxx' \
bash scripts/check_admin_role_backend_readiness.sh --strict
```
