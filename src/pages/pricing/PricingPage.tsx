import { Fragment } from 'react'
import { Check, Minus } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared'
import { cn } from '@/lib/utils'

/**
 * 定价档位 / Pricing tier。
 * price/priceUnit/priceSub 均为展示文本，不参与计算。
 */
interface PricingTier {
  key: string
  name: string
  note: string
  price: string
  priceUnit: string
  priceSub: string
  cta: string
  ctaVariant: 'default' | 'outline'
  featured?: boolean
  badge?: string
  feats: ReadonlyArray<{ label: string; included: boolean }>
}

/** 对比表单元格：布尔走图标，字符串走文本 */
type CompareCell = boolean | string

interface CompareRow {
  label: string
  values: readonly [CompareCell, CompareCell, CompareCell]
}

interface CompareGroup {
  group: string
  rows: readonly CompareRow[]
}

const TIERS: readonly PricingTier[] = [
  {
    key: 'community',
    name: '社区版',
    note: '面向希望自主安装和维护的团队。',
    price: '¥0',
    priceUnit: '/ 自助部署',
    priceSub: '自助安装文档 · 社区交流',
    cta: '查看项目',
    ctaVariant: 'outline',
    feats: [
      { label: '自助部署与升级', included: true },
      { label: '社区交流', included: true },
    ],
  },
  {
    key: 'professional',
    name: '专业版',
    note: '面向需要部署协助和技术支持的团队。',
    price: '¥3.9',
    priceUnit: '万 / 套',
    priceSub: '私有化部署与支持服务参考价',
    cta: '联系销售',
    ctaVariant: 'default',
    featured: true,
    badge: '部署支持',
    feats: [
      { label: '私有化部署协助', included: true },
      { label: '升级与运维指导', included: true },
      { label: '约定技术支持', included: true },
    ],
  },
  {
    key: 'enterprise',
    name: '企业版',
    note: '面向需要集成开发、专属交付和长期支持的团队。',
    price: '¥12',
    priceUnit: '万 / 年起',
    priceSub: '按交付及服务需求报价',
    cta: '商务洽谈',
    ctaVariant: 'outline',
    feats: [
      { label: '定制开发与系统集成', included: true },
      { label: '专属交付和技术支持', included: true },
      { label: '按需提供部署与运维服务', included: true },
    ],
  },
] as const

const COMPARE_GROUPS: readonly CompareGroup[] = [
  {
    group: '部署能力',
    rows: [
      { label: '统一部署入口', values: [true, true, true] },
      { label: '注册人数与集群节点数', values: ['不按版次限制', '不按版次限制', '不按版次限制'] },
    ],
  },
  {
    group: '交付与服务',
    rows: [
      { label: '部署与运维', values: ['自助', '部署协助与运维指导', '专属交付'] },
      { label: '技术支持', values: ['社区', '按服务合同', '按服务合同'] },
      { label: '定制开发与系统集成', values: [false, false, '可按需订购'] },
    ],
  },
] as const

const COMPARE_HEADERS = ['社区版', '专业版', '企业版'] as const

function CompareValue({ value }: { value: CompareCell }) {
  if (typeof value === 'string') {
    return <span className="text-sm font-medium text-foreground">{value}</span>
  }
  return value ? (
    <Check className="mx-auto h-4 w-4 text-primary" aria-label="支持" />
  ) : (
    <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="不支持" />
  )
}

export function PricingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="产品定价"
        description="自托管 · 数据主权 · 端到端加密 — 开源即用，按规模升级"
      />

      {/* 三档定价卡片 */}
      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        {TIERS.map((tier) => (
          <Card
            key={tier.key}
            className={cn(
              'relative flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-lg',
              tier.featured && 'border-primary shadow-md lg:-translate-y-2'
            )}
          >
            {tier.badge && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                {tier.badge}
              </Badge>
            )}
            <CardHeader className="space-y-1">
              <h3 className="text-xl font-bold">{tier.name}</h3>
              <p className="min-h-[2.75rem] text-sm text-muted-foreground">{tier.note}</p>
              <div className="pt-2">
                <span className="text-3xl font-bold tracking-tight">{tier.price}</span>
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  {tier.priceUnit}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{tier.priceSub}</p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <ul className="flex-1 space-y-0">
                {tier.feats.map((feat) => (
                  <li
                    key={feat.label}
                    className={cn(
                      'flex items-center gap-2 border-t border-border py-2 text-sm first:border-t-0',
                      !feat.included && 'text-muted-foreground/60'
                    )}
                  >
                    {feat.included ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Minus className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    )}
                    <span>{feat.label}</span>
                  </li>
                ))}
              </ul>
              {/* ponytail: CTA 暂为占位，待接入下载链接/销售联系方式后启用 */}
              <Button
                variant={tier.ctaVariant}
                className="mt-6 w-full"
                disabled
                title="即将上线"
              >
                {tier.cta}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 交付与服务对比表 */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-bold">交付与服务对比</h2>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-3 text-left font-semibold">能力</th>
                  {COMPARE_HEADERS.map((header, idx) => (
                    <th
                      key={header}
                      className={cn(
                        'px-3 py-3 text-center font-semibold',
                        idx === 1 && 'text-primary'
                      )}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_GROUPS.map((group) => (
                  <Fragment key={group.group}>
                    <tr className="bg-muted/50">
                      <td
                        colSpan={4}
                        className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {group.group}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/30"
                      >
                        <td className="px-3 py-2.5 text-left">{row.label}</td>
                        {row.values.map((value, idx) => (
                          <td key={idx} className="px-3 py-2.5 text-center">
                            <CompareValue value={value} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            版次仅用于说明交付与服务。实际容量取决于部署配置与可用资源，价格及服务范围以合同为准。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
