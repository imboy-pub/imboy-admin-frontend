import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ClipboardCopy, Headphones, ListChecks } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  OrganizationWorkspacePicker,
  type OrgWorkspaceOption,
} from '@/components/shared/OrganizationWorkspacePicker'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'
import { getErrorMessage } from '@/lib/errorUtils'
import type { EntityId } from '@/types/common'
import { getOrganizationMembers } from '@/modules/organization/api'
import type { OrganizationMemberRow } from '@/modules/organization/api/pureFunctions'
import type { WidgetInstallation } from '../api/widgetInstallationsPure'
import { parseAllowedOriginsInput } from '../api/widgetInstallationsPure'
import { buildProvisionSnippet } from '../api/provisioningPure'
import type { CsProvisioningResult } from '../api/provisioningPure'
import { provisionCustomerServiceSeat } from '../api/provisioning'
import { createWidgetInstallation } from '../api/widgetInstallations'
import { useOrgWorkspaceScope } from './useOrgWorkspaceScope'

const READ_PERMISSION = 'customer_service:read'
const WRITE_PERMISSION = 'customer_service:write'

type WizardStep = 'organization' | 'workspace' | 'identity' | 'installation' | 'snippet'

const STEP_ORDER: WizardStep[] = [
  'organization',
  'workspace',
  'identity',
  'installation',
  'snippet',
]

const STEP_LABELS: Record<WizardStep, string> = {
  organization: '选择组织',
  workspace: '选择工作区',
  identity: '开通客服坐席',
  installation: '创建 Widget 接入',
  snippet: '复制接入代码',
}

/**
 * 客服开通向导（ADM-01）：选择组织 → default 工作区 → customer_service
 * identity/assignment/enabled seat（Admin provisioning API 事务化）→ Widget
 * installation（含 allowed host origins）→ 复制 snippet。
 *
 * 组织/工作区上下文（EADM-05 W2 接线）：统一由 EADM-06 共享件
 * `OrganizationWorkspacePicker` + `useOrgWorkspaceScope` 提供，真源是 URL 的
 * `org`/`ws` 查询参数（codec 读写，禁止手写拼接），刷新/分享不丢上下文。
 * C3 硬约束：提交的 `workspace_id` 即 `ws` 参数值，绝不把 `org` 当工作区。
 *
 * 权限面（ADM-01-A02）：
 * - 无 customer_service:read → 整页 fail-closed，不渲染任何步骤；
 * - 有 read 无 write → 只读姿态：全部写按钮禁用并提示所需权限；
 * - 写动作执行前容器内二次校验 canWrite（双保险）。
 *
 * TSID 纪律（ADM-01-A03）：组织/工作区/成员一律选择器取自既有 admin 数据面，
 * 主流程无任何裸 TSID 手工输入框。
 */
export function CsProvisioningWizardPage() {
  const { allowed: canRead, loading: readPermLoading } = useAdminPermission({ permission: READ_PERMISSION })
  const { allowed: canWrite } = useAdminPermission({ permission: WRITE_PERMISSION })

  const [step, setStep] = useState<WizardStep>('organization')
  const [orgKeyword, setOrgKeyword] = useState('')
  const [orgQuery, setOrgQuery] = useState('')
  const [memberId, setMemberId] = useState('')
  const [maxConcurrent, setMaxConcurrent] = useState<number>(3)
  const [provisioningResult, setProvisioningResult] = useState<CsProvisioningResult | null>(null)
  const [installation, setInstallation] = useState<WidgetInstallation | null>(null)

  /**
   * 组织/工作区上下文的唯一真源 = URL 的 `org`/`ws` 查询参数（EADM-06 codec，
   * 由 useOrgWorkspaceScope 读写；禁止手写 `?org=` 拼接）。刷新/分享不丢上下文。
   * C3：`workspace_id` 即 `ws` 参数值——绝不把 `org`（Organization TSID）当 workspace 用。
   */
  const scope = useOrgWorkspaceScope({ orgKeyword: orgQuery })
  const orgId = scope.organizationId ?? ''
  // default workspace：未显式选中时渲染期取该组织第一个工作区（不进 effect，避免级联渲染）
  const effectiveWorkspaceId = scope.workspaceId ?? scope.workspaces[0]?.id ?? ''

  const selectedOrg = scope.organizations.find((item) => item.id === orgId) ?? null
  const selectedWorkspace =
    scope.workspaces.find((item) => item.id === effectiveWorkspaceId) ?? null

  const membersQuery = useQuery({
    queryKey: ['customer_service', 'provisioning', 'members', orgId],
    queryFn: () => getOrganizationMembers(orgId, 1, 50),
    enabled: canRead && !readPermLoading && orgId.length > 0,
  })

  const members = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data])

  const clearDownstream = () => {
    setMemberId('')
    setProvisioningResult(null)
    setInstallation(null)
  }

  const provisionMutation = useMutation({
    mutationFn: () => {
      const member = members.find((item) => item.userId === memberId) ?? null
      const displayName = member?.nickname?.trim() || member?.account?.trim() || ''
      return provisionCustomerServiceSeat({
        organizationId: orgId,
        workspaceId: effectiveWorkspaceId,
        userId: memberId,
        displayName,
        maxConcurrent,
      })
    },
    onSuccess: (result) => {
      setProvisioningResult(result)
      toast.success(
        result.identity_created
          ? '客服坐席开通成功'
          : '客服坐席已存在，本次为幂等修复'
      )
      setStep('installation')
    },
    onError: (error) => toast.error(`开通失败：${getErrorMessage(error)}`),
  })

  const installationMutation = useMutation({
    mutationFn: (input: { displayName: string; allowedOrigins: string[]; consentVersion: string }) =>
      createWidgetInstallation({
        organizationId: orgId,
        workspaceId: effectiveWorkspaceId,
        displayName: input.displayName,
        allowedOrigins: input.allowedOrigins,
        branding: { displayName: null, primaryColor: null },
        consentVersion: input.consentVersion,
      }),
    onSuccess: (created) => {
      setInstallation(created)
      toast.success('Widget 接入已创建')
      setStep('snippet')
    },
    onError: (error) => toast.error(`创建 Widget 接入失败：${getErrorMessage(error)}`),
  })

  const selectOrganization = (nextOrgId: string) => {
    // 组织变化 → 重置 ws（旧 workspace 不属于新组织），由 hook 写回 URL
    scope.onChange({ organizationId: nextOrgId, workspaceId: null })
    clearDownstream()
    setStep('workspace')
  }

  const selectWorkspace = (nextWorkspaceId: string) => {
    scope.onChange({ organizationId: orgId, workspaceId: nextWorkspaceId })
    setProvisioningResult(null)
    setInstallation(null)
  }

  const goToIdentityStep = () => {
    // 进入下一步前把当前生效的 default workspace 落到 `ws` 参数：提交时的
    // workspace_id 与 URL 上下文严格一致（刷新/分享可复现同一次开通）。
    if (effectiveWorkspaceId.length > 0 && scope.workspaceId !== effectiveWorkspaceId) {
      scope.onChange({ organizationId: orgId, workspaceId: effectiveWorkspaceId })
    }
    setStep('identity')
  }

  const handleScopeChange = (next: {
    organizationId: EntityId | null
    workspaceId: EntityId | null
  }) => {
    scope.onChange(next)
    clearDownstream()
    if (next.workspaceId !== null) setStep('identity')
    else if (next.organizationId !== null) setStep('workspace')
  }

  if (readPermLoading) {
    return <WizardFrame title="客服开通向导"><LoadingState message="加载权限门…" /></WizardFrame>
  }
  if (!canRead) {
    return (
      <WizardFrame title="客服开通向导">
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<Headphones className="h-10 w-10" />}
              title="无权访问"
              description="开通向导需要 customer_service:read 权限；执行开通写操作需要 customer_service:write。"
            />
          </CardContent>
        </Card>
      </WizardFrame>
    )
  }

  return (
    <div className="space-y-4" data-page="cs-provisioning-wizard">
      <PageHeader
        title="客服开通向导"
        description="无需手填 TSID 的开通流程：组织/工作区/成员全部来自选择器；坐席开通走 Admin provisioning API（customer_service:write，事务化 + 审计）。"
      />
      {!canWrite && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-800">
            只读模式：当前账号缺少 customer_service:write 权限，可浏览流程但无法执行开通/创建等治理写操作。
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">当前上下文（组织 / 工作区）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <OrganizationWorkspacePicker
            organizationId={scope.organizationId}
            workspaceId={scope.workspaceId}
            organizations={scope.organizations}
            workspaces={scope.workspaces}
            loading={scope.loading}
            disabled={!canWrite}
            onChange={handleScopeChange}
            onOrganizationChange={clearDownstream}
          />
          <p className="text-xs text-muted-foreground">
            共享选择器（EADM-06）：上下文写入 URL 的 org/ws 参数，刷新与分享后不丢失；
            开通请求的 workspace_id 即 ws 参数值（组织 TSID 绝不充当工作区）。
          </p>
        </CardContent>
      </Card>
      <WizardFrame title="客服开通向导">
        <StepIndicator current={step} reachedIndex={stepIndexFor(step)} />
        <OrgStep
          visible={step === 'organization'}
          canWrite={canWrite}
          keyword={orgKeyword}
          onKeywordChange={setOrgKeyword}
          onSearch={() => setOrgQuery(orgKeyword.trim())}
          loading={scope.loading}
          error={scope.orgsError}
          organizations={scope.organizations}
          selectedOrgId={orgId}
          onSelect={selectOrganization}
          onNext={() => setStep('workspace')}
          onRetry={scope.refetchOrganizations}
        />
        <WorkspaceStep
          visible={step === 'workspace'}
          canWrite={canWrite}
          loading={scope.workspacesLoading}
          error={scope.workspacesError}
          workspaces={scope.workspaces}
          selectedOrg={selectedOrg}
          workspaceId={effectiveWorkspaceId}
          onWorkspaceChange={selectWorkspace}
          onNext={goToIdentityStep}
          onBack={() => setStep('organization')}
          onRetry={scope.refetchWorkspaces}
        />
        <IdentityStep
          visible={step === 'identity'}
          canWrite={canWrite}
          loading={membersQuery.isLoading}
          error={membersQuery.error}
          members={members}
          selectedWorkspace={selectedWorkspace}
          memberId={memberId}
          onMemberChange={(next) => {
            setMemberId(next)
            setProvisioningResult(null)
          }}
          maxConcurrent={maxConcurrent}
          onMaxConcurrentChange={(next) => {
            setMaxConcurrent(next)
            setProvisioningResult(null)
          }}
          pending={provisionMutation.isPending}
          onProvision={() => {
            if (!canWrite) return
            provisionMutation.mutate()
          }}
          onBack={() => setStep('workspace')}
          onRetry={() => void membersQuery.refetch()}
        />
        <InstallationStep
          visible={step === 'installation'}
          canWrite={canWrite}
          provisioningResult={provisioningResult}
          pending={installationMutation.isPending}
          onCreate={(input) => {
            if (!canWrite) return
            installationMutation.mutate(input)
          }}
          onBack={() => setStep('identity')}
        />
        <SnippetStep
          visible={step === 'snippet'}
          installation={installation}
          onBack={() => setStep('installation')}
        />
      </WizardFrame>
      <GovernanceLinksCard />
    </div>
  )
}

function stepIndexFor(step: WizardStep): number {
  const index = STEP_ORDER.indexOf(step)
  return index < 0 ? 0 : index
}

function WizardFrame(props: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{props.children}</CardContent>
    </Card>
  )
}

function StepIndicator(props: { current: WizardStep; reachedIndex: number }) {
  return (
    <ol className="flex flex-wrap gap-2 text-xs" aria-label="开通步骤">
      {STEP_ORDER.map((item, index) => (
        <li
          key={item}
          aria-current={item === props.current ? 'step' : undefined}
          className={
            item === props.current
              ? 'rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground'
              : index < props.reachedIndex
                ? 'rounded-full bg-muted px-3 py-1 text-muted-foreground'
                : 'rounded-full border px-3 py-1 text-muted-foreground'
          }
        >
          {index + 1}. {STEP_LABELS[item]}
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Step 1：组织选择器（搜索 + select；主流程禁止手填 TSID）
// ---------------------------------------------------------------------------

function OrgStep(props: {
  visible: boolean
  canWrite: boolean
  keyword: string
  onKeywordChange: (_value: string) => void
  onSearch: () => void
  loading: boolean
  error: unknown
  organizations: OrgWorkspaceOption[]
  selectedOrgId: string
  onSelect: (_orgId: string) => void
  onNext: () => void
  onRetry: () => void
}) {
  if (!props.visible) return null
  return (
    <section aria-label={STEP_LABELS.organization} className="space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          props.onSearch()
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="cs-provision-org-keyword">搜索组织（按名称或关键字）</Label>
          <Input
            id="cs-provision-org-keyword"
            value={props.keyword}
            onChange={(event) => props.onKeywordChange(event.target.value)}
            placeholder="例如：Example"
          />
        </div>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">搜索</Button>
      </form>
      {props.loading ? (
        <LoadingState message="加载组织列表…" />
      ) : props.error !== null && props.error !== undefined ? (
        <ErrorState message={`加载组织失败：${getErrorMessage(props.error)}`} onRetry={props.onRetry} />
      ) : props.organizations.length === 0 ? (
        <EmptyState
          icon={<Headphones className="h-10 w-10" />}
          title="暂无可用组织"
          description="平台面不提供创建组织端点；请先在「组织管理」完成组织创建后回到本向导。"
        />
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="cs-provision-org-select">选择组织</Label>
          <select
            id="cs-provision-org-select"
            data-testid="cs-provision-org-select"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={props.selectedOrgId}
            onChange={(event) => props.onSelect(event.target.value)}
          >
            <option value="">请选择组织…</option>
            {props.organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}（ID {org.id}）
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">组织 ID 由选择器带入，禁止手工输入。</p>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="w-full sm:w-auto"
          data-testid="cs-provision-org-next"
          disabled={props.selectedOrgId.length === 0}
          onClick={props.onNext}
        >
          下一步：选择工作区
        </Button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Step 2：工作区选择器（default workspace 自动预选第一个）
// ---------------------------------------------------------------------------

function WorkspaceStep(props: {
  visible: boolean
  canWrite: boolean
  loading: boolean
  error: unknown
  workspaces: OrgWorkspaceOption[]
  selectedOrg: OrgWorkspaceOption | null
  workspaceId: string
  onWorkspaceChange: (_workspaceId: string) => void
  onNext: () => void
  onBack: () => void
  onRetry: () => void
}) {
  if (!props.visible) return null
  return (
    <section aria-label={STEP_LABELS.workspace} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        当前组织：{props.selectedOrg ? `${props.selectedOrg.name}（ID ${props.selectedOrg.id}）` : '未选择'}
      </p>
      {props.loading ? (
        <LoadingState message="加载工作区列表…" />
      ) : props.error !== null && props.error !== undefined ? (
        <ErrorState message={`加载工作区失败：${getErrorMessage(props.error)}`} onRetry={props.onRetry} />
      ) : props.workspaces.length === 0 ? (
        <EmptyState
          icon={<Headphones className="h-10 w-10" />}
          title="该组织暂无工作区"
          description="请先为该组织创建工作区（工作区创建在组织治理面完成），再回到本向导继续。"
        />
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="cs-provision-ws-select">选择工作区（默认工作区）</Label>
          <select
            id="cs-provision-ws-select"
            data-testid="cs-provision-ws-select"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={props.workspaceId}
            onChange={(event) => props.onWorkspaceChange(event.target.value)}
          >
            <option value="">请选择工作区…</option>
            {props.workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}（ID {ws.id}）
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="w-full sm:w-auto" onClick={props.onBack}>上一步</Button>
        <Button
          className="w-full sm:w-auto"
          disabled={props.workspaceId.length === 0}
          onClick={props.onNext}
        >
          下一步：开通客服坐席
        </Button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Step 3：成员选择器 + Admin provisioning（identity/assignment/enabled seat）
// ---------------------------------------------------------------------------

function IdentityStep(props: {
  visible: boolean
  canWrite: boolean
  loading: boolean
  error: unknown
  members: OrganizationMemberRow[]
  selectedWorkspace: OrgWorkspaceOption | null
  memberId: string
  onMemberChange: (_memberId: string) => void
  maxConcurrent: number
  onMaxConcurrentChange: (_value: number) => void
  pending: boolean
  onProvision: () => void
  onBack: () => void
  onRetry: () => void
}) {
  if (!props.visible) return null
  // C3：UI 必须过滤非 active 成员（archived/其它状态不得成为开通目标）。
  const activeMembers = props.members.filter((member) => member.status === 'active')
  return (
    <section aria-label={STEP_LABELS.identity} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        目标工作区：{props.selectedWorkspace ? `${props.selectedWorkspace.name}（ID ${props.selectedWorkspace.id}）` : '未选择'}
      </p>
      {props.loading ? (
        <LoadingState message="加载组织成员…" />
      ) : props.error !== null && props.error !== undefined ? (
        <ErrorState message={`加载组织成员失败：${getErrorMessage(props.error)}`} onRetry={props.onRetry} />
      ) : activeMembers.length === 0 ? (
        <EmptyState
          icon={<Headphones className="h-10 w-10" />}
          title="该组织暂无可开通成员"
          description="仅 active 成员可被开通为客服坐席；空组织或非 active 成员需先在组织治理面处理后回到本向导。"
        />
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cs-provision-member-select">选择开通为客服坐席的成员</Label>
            <select
              id="cs-provision-member-select"
              data-testid="cs-provision-member-select"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={props.memberId}
              onChange={(event) => props.onMemberChange(event.target.value)}
            >
              <option value="">请选择成员…</option>
              {activeMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.nickname || member.account}（{member.account}）
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              提交后由 Admin provisioning API 事务化创建/修复 customer_service identity、assignment 与启用坐席（成员以 user_id 派生身份，禁止 business_identity_id）。
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-provision-max-concurrent">并发上限（max_concurrent，1..20）</Label>
            <select
              id="cs-provision-max-concurrent"
              data-testid="cs-provision-max-concurrent"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={String(props.maxConcurrent)}
              onChange={(event) => props.onMaxConcurrentChange(Number(event.target.value))}
            >
              {Array.from({ length: 20 }, (_unused, index) => index + 1).map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              默认 3；以数值发送，合法域 1..20（超出由前端与后端双双 fail-closed）。
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="w-full sm:w-auto" onClick={props.onBack}>上一步</Button>
        <Button
          className="w-full sm:w-auto"
          data-testid="cs-provision-submit"
          disabled={!props.canWrite || props.memberId.length === 0 || props.pending}
          title={props.canWrite ? undefined : '需要 customer_service:write 权限'}
          onClick={props.onProvision}
        >
          {props.pending ? '开通过程中…' : '提交开通（identity/assignment/seat）'}
        </Button>
      </div>
    </section>
  )
}

function ProvisionAuditList(props: { result: CsProvisioningResult | null }) {
  if (props.result === null || props.result.audits.length === 0) return null
  return (
    <div className="overflow-x-auto" data-testid="cs-provision-audit">
      <table className="w-full text-xs">
        <caption className="sr-only">开通审计（actor/target/before/after）</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3">动作</th>
            <th scope="col" className="py-1.5 pr-3">操作者</th>
            <th scope="col" className="py-1.5 pr-3">对象</th>
            <th scope="col" className="py-1.5 pr-3">变更前 → 变更后</th>
          </tr>
        </thead>
        <tbody>
          {props.result.audits.map((entry, index) => (
            <tr key={`${entry.action}-${index}`} className="border-b last:border-0">
              <td className="py-1.5 pr-3 font-mono">{entry.action}</td>
              <td className="py-1.5 pr-3 font-mono">{entry.actor}</td>
              <td className="py-1.5 pr-3 font-mono">{entry.target}</td>
              <td className="max-w-[220px] truncate py-1.5 pr-3 font-mono" title={`${entry.before ?? 'null'} → ${entry.after ?? 'null'}`}>
                {entry.before ?? 'null'} → {entry.after ?? 'null'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4：Widget installation + allowed host origins（严格 origin 校验）
// ---------------------------------------------------------------------------

function InstallationStep(props: {
  visible: boolean
  canWrite: boolean
  provisioningResult: CsProvisioningResult | null
  pending: boolean
  onCreate: (_input: { displayName: string; allowedOrigins: string[]; consentVersion: string }) => void
  onBack: () => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [originsInput, setOriginsInput] = useState('')
  const [consentVersion, setConsentVersion] = useState('v1')
  const parsedOrigins = useMemo(() => parseAllowedOriginsInput(originsInput), [originsInput])
  if (!props.visible) return null
  const seatEnabled = props.provisioningResult?.seat?.enabled === true
  const submitDisabled =
    !props.canWrite ||
    props.pending ||
    displayName.trim().length === 0 ||
    parsedOrigins.origins.length === 0 ||
    parsedOrigins.errors.length > 0 ||
    consentVersion.trim().length === 0
  return (
    <section aria-label={STEP_LABELS.installation} className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        坐席开通：
        {props.provisioningResult === null ? (
          <Badge variant="outline">未完成</Badge>
        ) : seatEnabled ? (
          <Badge className="bg-green-100 text-green-800">seat 已启用</Badge>
        ) : (
          <Badge variant="outline">seat 未启用</Badge>
        )}
      </div>
      <ProvisionAuditList result={props.provisioningResult} />
      <div className="space-y-1.5">
        <Label htmlFor="cs-provision-install-name">接入显示名称</Label>
        <Input
          id="cs-provision-install-name"
          data-testid="cs-provision-install-name"
          value={displayName}
          maxLength={100}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="例如：商城在线客服"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cs-provision-install-origins">允许宿主页来源（allowed_origins，每行一个）</Label>
        <Textarea
          id="cs-provision-install-origins"
          data-testid="cs-provision-install-origins"
          rows={3}
          value={originsInput}
          onChange={(event) => setOriginsInput(event.target.value)}
          placeholder={'https://shop.example.com\nhttps://www.example.com'}
        />
        <p className="text-xs text-muted-foreground">
          逐个严格校验：http(s) 精确 origin（protocol+host+port），拒绝通配与路径；撤销后新 bootstrap 将被后端拒绝。
        </p>
        {parsedOrigins.errors.length > 0 && (
          <p className="text-xs text-destructive" role="alert">
            非法 origin（需 http(s) 且无路径/通配）：{parsedOrigins.errors.join('、')}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cs-provision-consent">隐私同意版本（consent_version）</Label>
        <Input
          id="cs-provision-consent"
          value={consentVersion}
          maxLength={20}
          onChange={(event) => setConsentVersion(event.target.value)}
          placeholder="v1"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="w-full sm:w-auto" onClick={props.onBack}>上一步</Button>
        <Button
          className="w-full sm:w-auto"
          data-testid="cs-provision-install-submit"
          disabled={submitDisabled}
          title={props.canWrite ? undefined : '需要 customer_service:write 权限'}
          onClick={() =>
            props.onCreate({
              displayName,
              allowedOrigins: parsedOrigins.origins,
              consentVersion,
            })
          }
        >
          {props.pending ? '创建中…' : '创建 Widget 接入'}
        </Button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Step 5：snippet（只含 public widget id；origin 来自 loader src）
// ---------------------------------------------------------------------------

function SnippetStep(props: {
  visible: boolean
  installation: WidgetInstallation | null
  onBack: () => void
}) {
  const [widgetOrigin, setWidgetOrigin] = useState('')
  if (!props.visible) return null
  let snippet = ''
  let snippetError: string | null = null
  if (props.installation !== null && widgetOrigin.trim().length > 0) {
    try {
      snippet = buildProvisionSnippet(props.installation.public_widget_id, { widgetOrigin })
    } catch (error) {
      snippetError = getErrorMessage(error)
    }
  }
  return (
    <section aria-label={STEP_LABELS.snippet} className="space-y-3">
      {props.installation === null ? (
        <EmptyState
          icon={<Headphones className="h-10 w-10" />}
          title="尚未创建 Widget 接入"
          description="请先完成上一步的 Widget 接入创建。"
        />
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="cs-provision-widget-origin">Widget 部署 origin（loader.js 的 src origin）</Label>
            <Input
              id="cs-provision-widget-origin"
              data-testid="cs-provision-widget-origin"
              value={widgetOrigin}
              onChange={(event) => setWidgetOrigin(event.target.value)}
              placeholder="https://cs-widget.example.com"
            />
          </div>
          {snippetError !== null ? (
            <p className="text-xs text-destructive" role="alert">{snippetError}</p>
          ) : snippet.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="cs-provision-snippet">接入代码</Label>
              <Textarea
                id="cs-provision-snippet"
                data-testid="cs-provision-snippet"
                readOnly
                rows={3}
                value={snippet}
                className="font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <p className="text-xs text-muted-foreground">
                snippet 只含 public widget id；Widget origin 来自 loader `src`，Organization 由后端以 installation 权威解析——不含租户参数与任何 secret。
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">填写 Widget 部署 origin 后生成接入代码。</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={props.onBack}>上一步</Button>
            <Button
              className="w-full sm:w-auto"
              data-testid="cs-provision-copy"
              disabled={snippet.length === 0}
              onClick={() => void copyText(snippet)}
            >
              <ClipboardCopy className="mr-1 h-4 w-4" /> 复制接入代码
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

function GovernanceLinksCard() {
  const links = [
    { to: '/customer-service', label: '坐席治理（suspend/resume）' },
    { to: '/customer-service/sessions', label: '会话运营' },
    { to: '/customer-service/widgets', label: 'Widget 接入管理（撤销/复制）' },
  ]
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <ListChecks className="h-4 w-4" />
        <CardTitle className="text-base">开通后的运营治理</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-md border px-3 py-2 transition-colors hover:bg-muted"
          >
            {link.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('已复制到剪贴板')
  } catch {
    toast.error('复制失败，请手动选择文本复制')
  }
}
