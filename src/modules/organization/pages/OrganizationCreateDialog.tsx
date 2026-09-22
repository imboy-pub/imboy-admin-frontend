import { useCallback, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Search, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import type { EntityId } from '@/types/common'
import type { User } from '@/types/user'
import { searchUsersPayload } from '@/modules/identity/api/users'
import { createOrganization } from '../api/public'
import {
  classifyCreateOutcome,
  classifyOrgError,
  createOrgErrorHint,
  isUserSelectableForOwner,
} from '../api/pureFunctions'

const WRITE_PERMISSION = 'organizations:write'

type Step = 'form' | 'confirm'

interface OrganizationCreateDialogProps {
  open: boolean
  onOpenChange: (_open: boolean) => void
  /** 创建成功（真实新建或幂等命中）后回调，由父级负责跳转详情页与上下文保持。 */
  onCreated: (_organizationId: EntityId, _workspaceId: EntityId, _created: boolean) => void
}

/**
 * 创建组织对话框（EADM-04 / C2）。
 *
 * 设计要点：
 * - Owner **必须**经用户搜索（/user/search）选择，UI 禁止手填裸 TSID；
 *   仅按可见 status 过滤 active（User 类型无 account_type，human 由后端 fail-closed 判定）。
 * - 提交前展示 Organization / Owner / 默认 Workspace 摘要并二次确认（计划 §4.3 硬要求）。
 * - created=true → 成功跳转；created=false（幂等命中）→ "已存在，已为你打开既有组织" 并跳转同一详情页（非错误态）。
 * - 400/403/404/409/500 各自可行动文案。
 */
export function OrganizationCreateDialog({ open, onOpenChange, onCreated }: OrganizationCreateDialogProps) {
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [step, setStep] = useState<Step>('form')
  const [name, setName] = useState('')
  const [owner, setOwner] = useState<User | null>(null)
  const [defaultWorkspaceName, setDefaultWorkspaceName] = useState('')
  const [wsTouched, setWsTouched] = useState(false)

  const [ownerKeyword, setOwnerKeyword] = useState('')
  const [ownerResults, setOwnerResults] = useState<User[]>([])
  const [ownerSearching, setOwnerSearching] = useState(false)
  const [ownerSearchError, setOwnerSearchError] = useState<string | null>(null)

  const [submitError, setSubmitError] = useState<string | null>(null)

  const resetState = useCallback(() => {
    setStep('form')
    setName('')
    setOwner(null)
    setDefaultWorkspaceName('')
    setWsTouched(false)
    setOwnerKeyword('')
    setOwnerResults([])
    setOwnerSearchError(null)
    setSubmitError(null)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetState()
      onOpenChange(next)
    },
    [onOpenChange, resetState]
  )

  // 默认 Workspace 名称跟随组织名（除非用户手动改过）。
  const derivedWsName = useMemo(() => {
    if (wsTouched) return defaultWorkspaceName
    return name.trim()
  }, [wsTouched, defaultWorkspaceName, name])

  const onNameChange = (value: string) => {
    setName(value)
    if (!wsTouched) setDefaultWorkspaceName(value.trim())
  }

  const onWsChange = (value: string) => {
    setWsTouched(true)
    setDefaultWorkspaceName(value)
  }

  const runOwnerSearch = useCallback(async () => {
    const keyword = ownerKeyword.trim()
    if (keyword.length === 0) {
      setOwnerResults([])
      return
    }
    setOwnerSearching(true)
    setOwnerSearchError(null)
    try {
      // searchUsersPayload 返回 PaginatedResponse<User>（信封 list 已由
      // responseAdapter.normalizeLegacyPagination 归一为 items）。
      const page = await searchUsersPayload(keyword, 1, 20)
      setOwnerResults(Array.isArray(page?.items) ? page.items : [])
    } catch (err) {
      setOwnerSearchError(classifyOrgError(err).message)
      setOwnerResults([])
    } finally {
      setOwnerSearching(false)
    }
  }, [ownerKeyword])

  const canSubmit =
    canWrite && name.trim().length > 0 && owner != null && derivedWsName.trim().length > 0

  const createMutation = useMutation({
    mutationFn: () =>
      createOrganization({
        name: name.trim(),
        ownerUserId: owner!.id,
        defaultWorkspaceName: derivedWsName.trim(),
      }),
    onSuccess: (result) => {
      const outcome = classifyCreateOutcome(result)
      if (outcome.kind === 'created') {
        toast.success(`组织「${result.organization.name}」创建成功（Owner=${owner?.account ?? owner?.id}）`)
      } else {
        toast.success(`已存在同名组织，已为你打开既有组织（幂等命中，非失败）`)
      }
      onCreated(outcome.organizationId, outcome.workspaceId, result.created)
      handleOpenChange(false)
    },
    onError: (err) => {
      const failure = classifyOrgError(err)
      const hint = createOrgErrorHint(failure)
      setSubmitError(hint)
      toast.error(hint)
    },
  })

  // -------------------------------------------------------------------------
  // 表单步骤
  // -------------------------------------------------------------------------
  const renderForm = () => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="org-create-name">组织名称</Label>
        <Input
          id="org-create-name"
          data-testid="org-create-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="例如：imboy"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-create-owner-search">Owner（搜索选择，禁止手填 TSID）</Label>
        <div className="flex items-end gap-2">
          <Input
            id="org-create-owner-search"
            data-testid="owner-search-input"
            value={ownerKeyword}
            onChange={(event) => setOwnerKeyword(event.target.value)}
            placeholder="按账号 / 昵称搜索用户"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void runOwnerSearch()
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => void runOwnerSearch()} disabled={ownerSearching}>
            <Search className="mr-1 h-4 w-4" />
            搜索
          </Button>
        </div>

        {ownerSearchError ? (
          <p className="text-xs text-destructive">{ownerSearchError}</p>
        ) : null}

        {!owner && ownerResults.length > 0 ? (
          <ul className="max-h-48 space-y-1 overflow-auto rounded-md border p-1" data-testid="owner-results">
            {ownerResults.map((u) => {
              const selectable = isUserSelectableForOwner(u)
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    data-testid="owner-option"
                    disabled={!selectable}
                    onClick={() => setOwner(u)}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="truncate">
                      <span className="font-medium">{u.nickname || '-'}</span>
                      {u.account ? <span className="ml-1 text-muted-foreground">({u.account})</span> : null}
                      <span className="ml-1 font-mono text-xs text-muted-foreground">{u.id}</span>
                    </span>
                    {selectable ? (
                      <Badge variant="default">active</Badge>
                    ) : (
                      <Badge variant="secondary">非活跃·不可选</Badge>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}

        {owner ? (
          <div className="rounded-md border bg-muted/40 p-3" data-testid="owner-selected">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="font-medium">{owner.nickname || '-'}</span>
                {owner.account ? <span className="text-muted-foreground">({owner.account})</span> : null}
                <Badge variant="default">active</Badge>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOwner(null)}>
                重选
              </Button>
            </div>
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">高级排障（只读）：Owner TSID</summary>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  data-testid="owner-tsid-readonly"
                  value={owner.id}
                  readOnly
                  disabled
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(owner.id)
                    toast.message('已复制 Owner TSID')
                  }}
                >
                  复制
                </Button>
              </div>
              <p className="mt-1">仅为只读展示/复制；正常创建流程不得手填此值。</p>
            </details>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-create-ws">默认 Workspace 名称</Label>
        <Input
          id="org-create-ws"
          data-testid="org-create-ws"
          value={derivedWsName}
          onChange={(event) => onWsChange(event.target.value)}
          placeholder="默认与组织名相同"
        />
      </div>

      {!canWrite ? (
        <p className="text-xs text-destructive">
          当前管理员无 {WRITE_PERMISSION} 权限，无法创建组织（授权由服务端 fail-closed 判定）。
        </p>
      ) : null}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
          取消
        </Button>
        <Button
          type="button"
          data-testid="org-create-next"
          disabled={!canWrite || name.trim().length === 0 || owner == null}
          onClick={() => setStep('confirm')}
        >
          下一步：预览
        </Button>
      </DialogFooter>
    </div>
  )

  // -------------------------------------------------------------------------
  // 二次确认步骤
  // -------------------------------------------------------------------------
  const renderConfirm = () => (
    <div className="space-y-4">
      <DialogDescription>
        提交后将创建组织并生成默认 Workspace（单事务）。请确认以下信息无误；Owner 仅可为 active 用户，非 human 将被服务端拒绝。
      </DialogDescription>
      <dl className="space-y-2 rounded-md border p-3 text-sm" data-testid="create-summary">
        <div className="flex gap-2">
          <dt className="min-w-32 shrink-0 text-muted-foreground">组织名称</dt>
          <dd className="break-all font-medium">{name.trim()}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-32 shrink-0 text-muted-foreground">Owner</dt>
          <dd className="break-all">
            {owner ? (
              <>
                <span className="font-medium">{owner.nickname || '-'}</span>
                {owner.account ? <span className="ml-1 text-muted-foreground">({owner.account})</span> : null}
                <span className="ml-1 font-mono text-xs text-muted-foreground">{owner.id}</span>
              </>
            ) : (
              '-'
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-32 shrink-0 text-muted-foreground">默认 Workspace</dt>
          <dd className="break-all font-medium">{derivedWsName.trim()}</dd>
        </div>
      </dl>

      {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={() => setStep('form')} disabled={createMutation.isPending}>
          返回修改
        </Button>
        <Button
          type="button"
          data-testid="org-create-confirm"
          disabled={!canSubmit || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? '提交中…' : '确认创建'}
        </Button>
      </DialogFooter>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="org-create-dialog" className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{step === 'confirm' ? '确认创建组织' : '创建组织'}</DialogTitle>
          <DialogDescription>
            复用集合路由 POST /api/adm/organizations；Owner 必须经用户搜索选择（status=active），禁止手填裸 TSID。
          </DialogDescription>
        </DialogHeader>
        {step === 'form' ? renderForm() : renderConfirm()}
      </DialogContent>
    </Dialog>
  )
}
