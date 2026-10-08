import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog, DataTablePagination } from '@/components/shared'
import { getDiscussionBinding, getDiscussionCandidates, getMicroCommunityEnabled, setDiscussionBinding } from '@/modules/channels/api'
import type { EntityId } from '@/types/common'
import { getErrorMessage } from '@/lib/errorUtils'

export function useMicroCommunityEnabled() {
  const query = useQuery({ queryKey: ['micro-community-policy'], queryFn: getMicroCommunityEnabled, retry: false, staleTime: 0 })
  return !query.isError && !query.isFetching && query.data === true
}

export function ChannelDiscussionPanel({ channelId, canManage }: { channelId: EntityId; canManage: boolean }) {
  const enabled = useMicroCommunityEnabled()
  return enabled && canManage ? <DiscussionEditor key={String(channelId)} channelId={channelId} /> : null
}

function DiscussionEditor({ channelId }: { channelId: EntityId }) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const binding = useQuery({ queryKey: ['channel-discussion', channelId], queryFn: () => getDiscussionBinding(channelId) })
  const candidates = useQuery({ queryKey: ['channel-discussion-candidates', channelId, page, size], queryFn: () => getDiscussionCandidates(channelId, page, size) })
  const currentGroup = binding.data === undefined ? undefined : String(binding.data.discussion_group_id ?? '')
  const selected = draft ?? currentGroup ?? ''
  const options = candidates.data?.items ?? []
  const extraOptions = [...new Set([currentGroup, selected])].filter((id): id is string =>
    !!id && !options.some(group => String(group.id) === id))
  const mutation = useMutation({
    mutationFn: () => setDiscussionBinding(channelId, selected || null),
    onSuccess: async () => {
      setConfirming(false)
      await queryClient.invalidateQueries({ queryKey: ['channel-discussion', channelId] })
      await queryClient.invalidateQueries({ queryKey: ['channel-discussion-candidates', channelId] })
      await queryClient.invalidateQueries({ queryKey: ['channel', String(channelId)] })
      setDraft(undefined)
    },
  })
  const error = binding.error ?? candidates.error ?? mutation.error
  return <Card>
    <CardHeader><CardTitle>讨论群</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p>当前讨论群：{binding.data?.discussion_group_id == null ? '未绑定' : String(binding.data.discussion_group_id)}</p>
      <p className="text-sm text-muted-foreground">仅可选择相同拥有者、无内容且仅拥有者入群的私有邀请群。已有成员或内容的讨论群不能解绑或更换。</p>
      {error && <p role="alert">{getErrorMessage(error, '讨论群操作失败，请刷新后重试')}</p>}
      <label htmlFor="discussion-group">选择讨论群</label>
      <Select id="discussion-group" value={selected} disabled={binding.isLoading || candidates.isLoading || !!binding.error || !!candidates.error || mutation.isPending}
        onChange={event => { setDraft(event.target.value); mutation.reset() }}>
        <option value="">解除绑定</option>
        {extraOptions.map(id => <option key={id} value={id}>{id === currentGroup ? '当前讨论群' : '已选择讨论群'}（{id}）</option>)}
        {options.map(group => <option key={String(group.id)} value={String(group.id)}>{group.title}（{String(group.id)}）</option>)}
      </Select>
      <DataTablePagination page={page} pageSize={size} total={candidates.data?.total ?? 0}
        onPageChange={setPage} onPageSizeChange={value => { setSize(Math.min(value, 50)); setPage(1) }} />
      <Button disabled={binding.isLoading || candidates.isLoading || !!binding.error || !!candidates.error || mutation.isPending || currentGroup === undefined || selected === currentGroup}
        onClick={() => setConfirming(true)}>保存讨论群</Button>
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title="确认修改讨论群"
        description={selected ? `将频道绑定到讨论群 ${selected}？` : '确定解除讨论群绑定？非空讨论群会被拒绝。'}
        confirmText="确认保存" loading={mutation.isPending} onConfirm={() => mutation.mutate()} />
    </CardContent>
  </Card>
}
