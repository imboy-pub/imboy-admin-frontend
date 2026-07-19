import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, ShieldCheck, ShieldOff, Plus } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/shared'
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
import { isValidPemFormat } from '@/lib/pemValidation'
import { getErrorMessage } from '@/lib/errorUtils'

export function ComplianceKeyPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [publicKey, setPublicKey] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)

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
    },
    onError: (err: unknown) => toast.error(`创建失败: ${getErrorMessage(err)}`),
  })

  const revokeMutation = useMutation({
    mutationFn: revokeComplianceKey,
    onSuccess: () => {
      toast.success('密钥已撤销')
      queryClient.invalidateQueries({ queryKey: complianceKeyQueryKey() })
      setRevokeTarget(null)
    },
    onError: (err: unknown) => toast.error(`撤销失败: ${getErrorMessage(err)}`),
  })

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message={getErrorMessage(error)} onRetry={refetch} />

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
        <EmptyState
          icon={<ShieldCheck className="h-12 w-12 text-muted-foreground" />}
          title="暂无合规密钥"
          description="还没有配置任何合规审计密钥对"
          action={{ label: '创建密钥', onClick: () => setShowCreate(true) }}
        />
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
              仅上传 RSA 公钥。公钥用于让客户端在 compliance 模式下额外加密一份消息密钥副本；
              合规私钥由审计方在本地（HSM / 离线介质）生成与妥善保管，服务端永不接收。
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
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-semibold">⚠️ 离线保管提示</p>
              <p className="mt-1 leading-relaxed">
                请确保您已在审计方本地（HSM / USB / 纸质等离线介质）妥善生成并保存了对应的合规私钥。
                服务端不再保存任何私钥，私钥一旦丢失，<b>所有用此公钥加密的历史合规密文将永久无法解密</b>。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              disabled={!publicKey.trim() || !isValidPemFormat(publicKey) || createMutation.isPending}
              onClick={() => {
                if (!isValidPemFormat(publicKey)) {
                  toast.error('公钥格式不正确，请提供 PEM 格式（以 -----BEGIN 开头，-----END 结尾）')
                  return
                }
                createMutation.mutate({
                  public_key: publicKey.trim(),
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
