export const scopeLabels: Record<string, string> = {
  c2c: '单聊',
  c2g: '群聊',
  c2s: '机器人',
  s2c: '系统',
}

export const scopeVariants: Record<string, 'success' | 'warning' | 'error' | 'info' | 'secondary'> = {
  c2c: 'info',
  c2g: 'success',
  c2s: 'warning',
  s2c: 'secondary',
}

export const columnLabels: Record<string, string> = {
  scope: '范围',
  msg_id: '消息 ID',
  from_id: '发送方',
  to_id: '接收方',
  msg_type: '类型',
  action: '动作',
  payload: '内容',
  created_at: '创建时间',
  actions: '操作',
}

export type PayloadViewMode = 'pretty' | 'raw' | 'tree'
