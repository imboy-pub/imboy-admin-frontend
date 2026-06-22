import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/shared'
import { getErrorMessage } from '@/lib/errorUtils'
import { fenToYuan, yuanToFen } from '@/lib/money'
import type { EntityId } from '@/types/common'
import {
  getChannelDetailPayload,
  setChannelPrice,
  type Channel,
  type ChannelPriceParams,
} from '@/modules/channels/api'

type Props = {
  channelId: EntityId | null
  channelName?: string
  open: boolean
  onOpenChange: (_open: boolean) => void
  onSuccess?: () => void
}

type PriceForm = {
  price_yuan: string
  original_price_yuan: string
  currency: string
  subscription_type: number
  description: string
}

/** detail 接口的 price/original_price 单位为「分」，预填表单时转为「元」。 */
function toForm(channel: Channel): PriceForm {
  return {
    price_yuan: channel.price ? (channel.price / 100).toFixed(2) : '',
    original_price_yuan: channel.original_price ? (channel.original_price / 100).toFixed(2) : '',
    currency: channel.currency ?? 'CNY',
    subscription_type: channel.subscription_type ?? 1,
    description: channel.description ?? '',
  }
}

export function SetChannelPriceDialog({ channelId, channelName, open, onOpenChange, onSuccess }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>设置频道价格</DialogTitle>
          <DialogDescription>
            {channelName ? `频道：${channelName}` : `频道 ID: ${channelId ?? '-'}`}
          </DialogDescription>
        </DialogHeader>
        {open && channelId && (
          <PriceFormBody
            channelId={channelId}
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type BodyProps = {
  channelId: EntityId
  onOpenChange: (_open: boolean) => void
  onSuccess?: () => void
}

/**
 * 表单主体：先拉详情（含当前价格，单位分），再以 key 重挂载受控表单完成预填。
 * 拆分为子组件以便用 key 驱动初始化，避免在 effect 中 setState。
 */
function PriceFormBody({ channelId, onOpenChange, onSuccess }: BodyProps) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['channel-detail', channelId],
    queryFn: () => getChannelDetailPayload(channelId),
  })

  if (isLoading || !detail) {
    return <LoadingState message="加载当前价格..." />
  }

  return (
    <PriceFormFields
      key={String(detail.id)}
      channelId={channelId}
      initialForm={toForm(detail)}
      currentPriceFen={detail.price}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  )
}

type FieldsProps = {
  channelId: EntityId
  initialForm: PriceForm
  currentPriceFen?: number
  onOpenChange: (_open: boolean) => void
  onSuccess?: () => void
}

function PriceFormFields({ channelId, initialForm, currentPriceFen, onOpenChange, onSuccess }: FieldsProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PriceForm>(initialForm)

  const priceMutation = useMutation({
    mutationFn: (payload: ChannelPriceParams) => setChannelPrice(channelId, payload),
    onSuccess: () => {
      toast.success('频道价格已更新')
      queryClient.invalidateQueries({ queryKey: ['channel-detail', channelId] })
      onOpenChange(false)
      onSuccess?.()
    },
    onError: (err: unknown) => toast.error(`设置价格失败: ${getErrorMessage(err)}`),
  })

  const handleSubmit = () => {
    const priceFen = yuanToFen(form.price_yuan || '0')
    if (priceFen <= 0) {
      toast.error('价格必须大于 0')
      return
    }
    const originalFen = form.original_price_yuan.trim()
      ? yuanToFen(form.original_price_yuan)
      : undefined
    priceMutation.mutate({
      price_fen: priceFen,
      original_price_fen: originalFen,
      currency: form.currency,
      subscription_type: form.subscription_type,
      description: form.description.trim() || undefined,
    })
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        当前价格 {currentPriceFen ? fenToYuan(currentPriceFen) : '未设置'}
      </p>

      <div className="grid gap-4 py-2 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="paid-price-yuan" className="font-medium">价格（元）</Label>
          <Input
            id="paid-price-yuan"
            type="number"
            min="0"
            step="0.01"
            value={form.price_yuan}
            onChange={(e) => setForm((prev) => ({ ...prev, price_yuan: e.target.value }))}
            placeholder="例如 9.90"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paid-original-price-yuan" className="font-medium">原价（元，可选）</Label>
          <Input
            id="paid-original-price-yuan"
            type="number"
            min="0"
            step="0.01"
            value={form.original_price_yuan}
            onChange={(e) => setForm((prev) => ({ ...prev, original_price_yuan: e.target.value }))}
            placeholder="例如 19.90"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paid-currency" className="font-medium">货币</Label>
          <select
            id="paid-currency"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.currency}
            onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
          >
            <option value="CNY">CNY 人民币</option>
            <option value="USD">USD 美元</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="paid-subscription-type" className="font-medium">订阅类型</Label>
          <select
            id="paid-subscription-type"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={String(form.subscription_type)}
            onChange={(e) => setForm((prev) => ({ ...prev, subscription_type: Number(e.target.value) }))}
          >
            <option value="1">一次性</option>
            <option value="2">月订阅</option>
            <option value="3">年订阅</option>
          </select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="paid-price-desc" className="font-medium">价格说明（可选）</Label>
          <Input
            id="paid-price-desc"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="例如 含全部往期内容"
            maxLength={200}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={priceMutation.isPending}>
          取消
        </Button>
        <Button onClick={handleSubmit} disabled={priceMutation.isPending}>
          {priceMutation.isPending ? '保存中...' : (
            <>
              <Save className="mr-2 h-4 w-4" />
              保存价格
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  )
}
