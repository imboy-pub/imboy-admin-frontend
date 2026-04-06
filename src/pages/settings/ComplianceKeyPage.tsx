import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, ShieldCheck, ShieldOff, Plus, Eye, EyeOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared'
import {
  listComplianceKeys,
  createComplianceKey,
  revokeComplianceKey,
  complianceKeyQueryKey,
  type ComplianceKey,
} from '@/services/api/complianceKey'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

function isValidPemFormat(value: string): boolean {
  const trimmed = value.trim()
  return /^-----BEGIN [A-Z ]+-----/.test(trimmed) && /-----END [A-Z ]+-----\s*$/.test(trimmed)
}

export function ComplianceKeyPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [publicKey, setPublicKey] = useState('')
  const [privateKeyEncrypted, setPrivateKeyEncrypted] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)
  const [showPrivateKey, setShowPrivateKey] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: complianceKeyQueryKey(),
    queryFn: listComplianceKeys,
  })

  const createMutation = useMutation({
    mutationFn: createComplianceKey,
    onSuccess: () => {
      toast.success('合规密钥创建成功')
      queryClient.invalidateQueries({ queryKey: complianceKeyQueryKey() })
      setShowCreate(false)
      setPublicKey('')
      setPrivateKeyEncrypted('')
    },
    onError: (err: Error) => toast.error(`创建失败: ${err.message}`),
  })

  const revokeMutation = useMutation({
    mutationFn: revokeComplianceKey,
    onSuccess: () => {
      toast.success('密钥已撤销')
      queryClient.invalidateQueries({ queryKey: complianceKeyQueryKey() })
      setRevokeTarget(null)
    },
    onError: (err: Error) => toast.error(`撤销失败: ${err.message}`),
  })

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  const keys = data?.list ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="合规密钥管理"
        description="管理 compliance_e2ee 模式下的合规审计密钥对"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 h-4 w-4" />
              创建密钥
            </Button>
          </div>
        }
      />

      {keys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            暂无合规密钥。点击「创建密钥」添加第一个。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((key: ComplianceKey) => (
            <Card key={key.key_id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {key.status === 1 ? (
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <ShieldOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    <CardTitle className="text-sm font-mono">{key.key_id}</CardTitle>
                    <Badge variant={key.status === 1 ? 'default' : 'secondary'}>
                      {key.status === 1 ? '活跃' : '已撤销'}
                    </Badge>
                  </div>
                  {key.status === 1 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setRevokeTarget(key.key_id)}
                    >
                      撤销
                    </Button>
                  )}
                </div>
                <CardDescription className="text-xs">
                  算法: {key.algorithm ?? 'RSA-OAEP-256'} | 创建时间: {key.created_at}
                  {key.revoked_at && ` | 撤销时间: ${key.revoked_at}`}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* 创建密钥对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建合规密钥</DialogTitle>
            <DialogDescription>
              上传 RSA 公钥和加密后的私钥。公钥用于加密消息副本，私钥由合规部门保管。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>公钥 (PEM 格式)</Label>
              <Textarea
                className="mt-1 font-mono text-xs"
                rows={6}
                placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>加密后的私钥</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setShowPrivateKey((prev) => !prev)}
                >
                  {showPrivateKey ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                  {showPrivateKey ? '隐藏' : '显示'}
                </Button>
              </div>
              <Textarea
                className="mt-1 font-mono text-xs"
                rows={6}
                placeholder="使用管理密码加密后的私钥..."
                value={privateKeyEncrypted}
                onChange={(e) => setPrivateKeyEncrypted(e.target.value)}
                style={showPrivateKey ? undefined : { WebkitTextSecurity: 'disc', textSecurity: 'disc' } as React.CSSProperties}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              disabled={!publicKey.trim() || !privateKeyEncrypted.trim() || !isValidPemFormat(publicKey) || createMutation.isPending}
              onClick={() => {
                if (!isValidPemFormat(publicKey)) {
                  toast.error('公钥格式不正确，请提供 PEM 格式（以 -----BEGIN 开头，-----END 结尾）')
                  return
                }
                createMutation.mutate({
                  public_key: publicKey.trim(),
                  private_key_encrypted: privateKeyEncrypted.trim(),
                })
              }}
            >
              {createMutation.isPending ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 撤销确认对话框 */}
      <Dialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认撤销</DialogTitle>
            <DialogDescription>
              撤销后该密钥将不再用于加密新消息。已加密的历史消息不受影响。此操作不可逆。
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-mono text-muted-foreground">{revokeTarget}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget)}
            >
              {revokeMutation.isPending ? '撤销中...' : '确认撤销'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
