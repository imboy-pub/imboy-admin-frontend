/**
 * 内置管理角色（1..6）展示名，与后端真源
 * imboy/src/adm/adm_index_handler.erl role_acl/1 一一对应：
 * 1=super_admin 2=ops_admin 3=audit_admin 4=moderator 5=security_admin 6=support。
 * 自定义角色（id > 6 或运行时创建）不在此表，由调用方决定回退展示。
 */
export const ADMIN_ROLE_LABELS: Record<string, string> = {
  1: '超级管理员',
  2: '运营管理员',
  3: '审计管理员',
  4: '审核管理员',
  5: '安全管理员',
  6: '客服管理员',
}
