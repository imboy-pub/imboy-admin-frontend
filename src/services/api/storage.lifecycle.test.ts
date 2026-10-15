import { expect, it } from 'bun:test'
import { attachmentDeletionLabel } from './storage'

it('logical purged is distinct from pending/retry/blocked/done and unknown remains unknown', () => {
  const base = { status: -1, lifecycle_state: 'delete_intent' }
  expect(attachmentDeletionLabel({ ...base, physical_state: 'ready' })).toBe('逻辑已删除 · 物理待删除')
  expect(attachmentDeletionLabel({ ...base, physical_state: 'retry_wait' })).toContain('待重试')
  expect(attachmentDeletionLabel({ ...base, physical_state: 'blocked', deletion_block_reason: 'legal_hold' })).toContain('已阻断（legal_hold）')
  expect(attachmentDeletionLabel({ ...base, physical_state: 'done' })).toContain('已完成')
  expect(attachmentDeletionLabel({ ...base, physical_state: 'future_value' })).toContain('未知')
  expect(attachmentDeletionLabel(base)).toContain('未知')
})
