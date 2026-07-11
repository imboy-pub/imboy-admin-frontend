import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2, Server, ShieldCheck, Key } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { LoadingState, ErrorState, PageHeader } from '@/components/shared'
import {
  getSSOConfigPayload,
  saveSSOConfig,
  testSSOConnection,
  type LdapConfig,
  type SamlConfig,
  type OAuth2Config,
} from '@/services/api/sso'
import { getErrorMessage } from '@/lib/errorUtils'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/select'

type ActiveProvider = 'ldap' | 'saml' | 'oauth2'

const PROVIDER_TABS: { id: ActiveProvider; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'ldap', label: 'LDAP / AD', icon: Server },
  { id: 'saml', label: 'SAML 2.0', icon: ShieldCheck },
  { id: 'oauth2', label: 'OAuth 2.0', icon: Key },
]

function FormField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  id: string
  label: string
  value: string
  onChange: (_val: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function TestResult({
  result,
}: {
  result: { success: boolean; message: string } | null
}) {
  if (!result) return null
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border p-3 text-sm',
        result.success
          ? 'border-green-200 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400'
          : 'border-destructive/30 bg-destructive/5 text-destructive'
      )}
    >
      {result.success ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0" />
      )}
      <span>{result.message}</span>
    </div>
  )
}

// ─── LDAP 配置表单 ──────────────────────────────────────────────────────────────

function LdapForm({ initial }: { initial?: LdapConfig }) {
  const [form, setForm] = useState<LdapConfig>({
    provider: 'ldap',
    enabled: initial?.enabled ?? false,
    host: initial?.host ?? '',
    port: initial?.port ?? 389,
    use_ssl: initial?.use_ssl ?? false,
    base_dn: initial?.base_dn ?? '',
    bind_dn: initial?.bind_dn ?? '',
    bind_password: initial?.bind_password ?? '',
    user_filter: initial?.user_filter ?? '(uid={{username}})',
    uid_attr: initial?.uid_attr ?? 'uid',
    mail_attr: initial?.mail_attr ?? 'mail',
    display_name_attr: initial?.display_name_attr ?? 'cn',
  })
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const queryClient = useQueryClient()

  const setField = <K extends keyof LdapConfig>(key: K, value: LdapConfig[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const saveMutation = useMutation({
    mutationFn: () => saveSSOConfig(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sso-config'] })
      toast.success('LDAP 配置已保存')
    },
    onError: (err: unknown) => toast.error(`保存失败: ${getErrorMessage(err)}`),
  })

  const testMutation = useMutation({
    mutationFn: () => testSSOConnection('ldap', form),
    onSuccess: (res) => setTestResult(res.payload ?? { success: false, message: '测试失败' }),
    onError: (err: unknown) => setTestResult({ success: false, message: getErrorMessage(err) }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch
          id="ldap-enabled"
          checked={form.enabled}
          onCheckedChange={(v) => setField('enabled', v)}
        />
        <Label htmlFor="ldap-enabled">启用 LDAP 认证</Label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="ldap-host"
          label="LDAP 服务器地址"
          value={form.host}
          onChange={(v) => setField('host', v)}
          placeholder="ldap.example.com"
          required
        />
        <div className="space-y-1">
          <Label htmlFor="ldap-port">端口</Label>
          <Input
            id="ldap-port"
            type="number"
            value={String(form.port)}
            onChange={(e) => setField('port', Number(e.target.value))}
            placeholder="389 / 636 (SSL)"
          />
        </div>
        <FormField
          id="ldap-base-dn"
          label="Base DN"
          value={form.base_dn}
          onChange={(v) => setField('base_dn', v)}
          placeholder="dc=example,dc=com"
          required
        />
        <FormField
          id="ldap-bind-dn"
          label="Bind DN"
          value={form.bind_dn}
          onChange={(v) => setField('bind_dn', v)}
          placeholder="cn=admin,dc=example,dc=com"
        />
        <FormField
          id="ldap-bind-password"
          label="Bind 密码"
          value={form.bind_password}
          onChange={(v) => setField('bind_password', v)}
          type="password"
          placeholder="••••••••"
        />
        <FormField
          id="ldap-user-filter"
          label="用户过滤器"
          value={form.user_filter}
          onChange={(v) => setField('user_filter', v)}
          placeholder="(uid={{username}})"
        />
        <FormField
          id="ldap-uid-attr"
          label="用户名属性"
          value={form.uid_attr}
          onChange={(v) => setField('uid_attr', v)}
          placeholder="uid"
        />
        <FormField
          id="ldap-mail-attr"
          label="邮箱属性"
          value={form.mail_attr}
          onChange={(v) => setField('mail_attr', v)}
          placeholder="mail"
        />
        <FormField
          id="ldap-name-attr"
          label="显示名属性"
          value={form.display_name_attr}
          onChange={(v) => setField('display_name_attr', v)}
          placeholder="cn"
        />
        <div className="flex items-center gap-3">
          <Switch
            id="ldap-ssl"
            checked={form.use_ssl}
            onCheckedChange={(v) => setField('use_ssl', v)}
          />
          <Label htmlFor="ldap-ssl">使用 SSL/TLS（LDAPS）</Label>
        </div>
      </div>

      <TestResult result={testResult} />

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || !form.host}
        >
          {testMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          连接测试
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          保存配置
        </Button>
      </div>
    </div>
  )
}

// ─── SAML 配置表单 ──────────────────────────────────────────────────────────────

function SamlForm({ initial }: { initial?: SamlConfig }) {
  const [form, setForm] = useState<SamlConfig>({
    provider: 'saml',
    enabled: initial?.enabled ?? false,
    metadata_url: initial?.metadata_url ?? '',
    entity_id: initial?.entity_id ?? '',
    assertion_consumer_service_url: initial?.assertion_consumer_service_url ?? '',
    name_id_format: initial?.name_id_format ?? 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  })
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const queryClient = useQueryClient()

  const setField = <K extends keyof SamlConfig>(key: K, value: SamlConfig[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const saveMutation = useMutation({
    mutationFn: () => saveSSOConfig(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sso-config'] })
      toast.success('SAML 配置已保存')
    },
    onError: (err: unknown) => toast.error(`保存失败: ${getErrorMessage(err)}`),
  })

  const testMutation = useMutation({
    mutationFn: () => testSSOConnection('saml', form),
    onSuccess: (res) => setTestResult(res.payload ?? { success: false, message: '测试失败' }),
    onError: (err: unknown) => setTestResult({ success: false, message: getErrorMessage(err) }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch
          id="saml-enabled"
          checked={form.enabled}
          onCheckedChange={(v) => setField('enabled', v)}
        />
        <Label htmlFor="saml-enabled">启用 SAML 2.0 认证</Label>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <FormField
          id="saml-metadata-url"
          label="IdP 元数据 URL"
          value={form.metadata_url}
          onChange={(v) => setField('metadata_url', v)}
          placeholder="https://idp.example.com/saml/metadata"
          required
        />
        <FormField
          id="saml-entity-id"
          label="SP Entity ID"
          value={form.entity_id}
          onChange={(v) => setField('entity_id', v)}
          placeholder="https://admin.example.com"
          required
        />
        <FormField
          id="saml-acs-url"
          label="断言消费服务 URL (ACS)"
          value={form.assertion_consumer_service_url}
          onChange={(v) => setField('assertion_consumer_service_url', v)}
          placeholder="https://admin.example.com/api/adm/sso/saml/callback"
          required
        />
        <div className="space-y-1">
          <Label htmlFor="saml-nameid">NameID 格式</Label>
          <Select
            id="saml-nameid"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.name_id_format}
            onChange={(e) => setField('name_id_format', e.target.value)}
          >
            <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">Email Address</option>
            <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">Persistent</option>
            <option value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">Transient</option>
            <option value="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">Unspecified</option>
          </Select>
        </div>
      </div>

      <TestResult result={testResult} />

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || !form.metadata_url}
        >
          {testMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          获取元数据测试
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          保存配置
        </Button>
      </div>
    </div>
  )
}

// ─── OAuth2 配置表单 ─────────────────────────────────────────────────────────────

function OAuth2Form({ initial }: { initial?: OAuth2Config }) {
  const [form, setForm] = useState<OAuth2Config>({
    provider: 'oauth2',
    enabled: initial?.enabled ?? false,
    client_id: initial?.client_id ?? '',
    client_secret: initial?.client_secret ?? '',
    auth_url: initial?.auth_url ?? '',
    token_url: initial?.token_url ?? '',
    userinfo_url: initial?.userinfo_url ?? '',
    scopes: initial?.scopes ?? 'openid profile email',
  })
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const queryClient = useQueryClient()

  const setField = <K extends keyof OAuth2Config>(key: K, value: OAuth2Config[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const saveMutation = useMutation({
    mutationFn: () => saveSSOConfig(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sso-config'] })
      toast.success('OAuth2 配置已保存')
    },
    onError: (err: unknown) => toast.error(`保存失败: ${getErrorMessage(err)}`),
  })

  const testMutation = useMutation({
    mutationFn: () => testSSOConnection('oauth2', form),
    onSuccess: (res) => setTestResult(res.payload ?? { success: false, message: '测试失败' }),
    onError: (err: unknown) => setTestResult({ success: false, message: getErrorMessage(err) }),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch
          id="oauth2-enabled"
          checked={form.enabled}
          onCheckedChange={(v) => setField('enabled', v)}
        />
        <Label htmlFor="oauth2-enabled">启用 OAuth 2.0 / OIDC 认证</Label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="oauth2-client-id"
          label="Client ID"
          value={form.client_id}
          onChange={(v) => setField('client_id', v)}
          placeholder="your-client-id"
          required
        />
        <FormField
          id="oauth2-client-secret"
          label="Client Secret"
          value={form.client_secret}
          onChange={(v) => setField('client_secret', v)}
          type="password"
          placeholder="••••••••"
          required
        />
        <FormField
          id="oauth2-auth-url"
          label="授权端点 URL"
          value={form.auth_url}
          onChange={(v) => setField('auth_url', v)}
          placeholder="https://idp.example.com/oauth/authorize"
          required
        />
        <FormField
          id="oauth2-token-url"
          label="Token 端点 URL"
          value={form.token_url}
          onChange={(v) => setField('token_url', v)}
          placeholder="https://idp.example.com/oauth/token"
          required
        />
        <FormField
          id="oauth2-userinfo-url"
          label="用户信息端点 URL"
          value={form.userinfo_url}
          onChange={(v) => setField('userinfo_url', v)}
          placeholder="https://idp.example.com/oauth/userinfo"
        />
        <FormField
          id="oauth2-scopes"
          label="Scopes（空格分隔）"
          value={form.scopes}
          onChange={(v) => setField('scopes', v)}
          placeholder="openid profile email"
        />
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <p className="font-medium mb-1">回调 URL（需在 IdP 侧配置）</p>
        <code className="font-mono text-xs">{window.location.origin}/api/adm/sso/oauth2/callback</code>
      </div>

      <TestResult result={testResult} />

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || !form.client_id}
        >
          {testMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          连接测试
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          保存配置
        </Button>
      </div>
    </div>
  )
}

// ─── 主页面 ─────────────────────────────────────────────────────────────────────

export function SSOConfigPage() {
  const [activeProvider, setActiveProvider] = useState<ActiveProvider>('ldap')

  const { data: config, isLoading, error, refetch } = useQuery({
    queryKey: ['sso-config'],
    queryFn: getSSOConfigPayload,
  })

  if (isLoading) return <LoadingState message="加载 SSO 配置..." />
  if (error) return <ErrorState message="加载 SSO 配置失败" onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="SSO 外部身份认证"
        description="配置企业 LDAP/AD、SAML 2.0 或 OAuth2/OIDC 单点登录，让管理员可使用企业账号登录"
      />

      <Card>
        <CardHeader>
          <CardTitle>选择认证协议</CardTitle>
          <CardDescription>
            每种协议独立配置；同时启用多个时，登录页将显示对应按钮。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-b mb-6">
            <div className="flex gap-1">
              {PROVIDER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveProvider(tab.id)}
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    activeProvider === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeProvider === 'ldap' && <LdapForm initial={config?.ldap} />}
          {activeProvider === 'saml' && <SamlForm initial={config?.saml} />}
          {activeProvider === 'oauth2' && <OAuth2Form initial={config?.oauth2} />}
        </CardContent>
      </Card>
    </div>
  )
}
