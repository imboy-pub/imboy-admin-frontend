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
    note: '开源自托管，功能完整，适合个人/团队评估与小规模自建。',
    price: '¥0',
    priceUnit: '/ 永久',
    priceSub: '木兰宽松许可 · 限规模上限',
    cta: '下载开源版',
    ctaVariant: 'outline',
    feats: [
      { label: '单聊 / 群聊 / 朋友圈', included: true },
      { label: 'E2EE 端到端加密', included: true },
      { label: '钱包 / 付费频道 / 支付', included: true },
      { label: '单机部署 + 可观测性栈', included: true },
      { label: '集群水平扩展', included: false },
      { label: '白标 / 品牌定制', included: false },
      { label: '信创国产化适配', included: false },
    ],
  },
  {
    key: 'professional',
    name: '专业版',
    note: '私有化授权买断，含集群与白标，适合企业自主可控部署。',
    price: '¥3.9',
    priceUnit: '万 / 套',
    priceSub: '终身授权 · 绑定域名 · 含 1 年升级',
    cta: '联系销售',
    ctaVariant: 'default',
    featured: true,
    badge: '推荐 · 最快现金流',
    feats: [
      { label: '社区版全部功能', included: true },
      { label: '集群部署（水平扩展）', included: true },
      { label: '运行时白标 / 换肤', included: true },
      { label: '付费频道运营后台', included: true },
      { label: '加密对象存储增强', included: true },
      { label: '优先技术支持 SLA', included: true },
      { label: '信创国产化 / SSO 审计', included: false },
    ],
  },
  {
    key: 'enterprise',
    name: '企业版',
    note: '面向政企/金融/信创：国产化、合规审计、专属支持。',
    price: '¥12',
    priceUnit: '万 / 年起',
    priceSub: '按规模与模块定制报价',
    cta: '商务洽谈',
    ctaVariant: 'outline',
    feats: [
      { label: '专业版全部功能', included: true },
      { label: '信创国产化（达梦/鲲鹏/国密）', included: true },
      { label: 'SSO / 审计合规', included: true },
      { label: '气隙(air-gap)部署', included: true },
      { label: '更强 SLA + 专属支持', included: true },
      { label: '定制开发与集成', included: true },
      { label: '数据不出境保障', included: true },
    ],
  },
] as const

const COMPARE_GROUPS: readonly CompareGroup[] = [
  {
    group: '核心 IM',
    rows: [
      { label: '单聊 / 群聊 / 朋友圈', values: [true, true, true] },
      { label: 'E2EE 端到端加密', values: [true, true, true] },
      { label: '钱包 / 付费频道 / 支付', values: [true, true, true] },
    ],
  },
  {
    group: '部署与运营',
    rows: [
      { label: '单机部署 + 可观测性', values: [true, true, true] },
      { label: '集群部署（水平扩展）', values: [false, true, true] },
      { label: '运行时白标 / 换肤', values: [false, true, true] },
      { label: '付费频道运营后台', values: [false, true, true] },
    ],
  },
  {
    group: '合规与信创',
    rows: [
      { label: '信创国产化（达梦/鲲鹏/国密）', values: [false, false, true] },
      { label: 'SSO / 审计合规', values: [false, false, true] },
      { label: '气隙部署 / 数据不出境', values: [false, false, true] },
    ],
  },
  {
    group: '服务',
    rows: [
      { label: '技术支持', values: ['社区', '优先 SLA', '专属'] },
      { label: '授权方式', values: ['开源', '终身买断', '年费订阅'] },
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

      {/* 功能对比表 */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-bold">功能对比</h2>
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
            价格为建议参考价（专业版对标主流私有化 IM 终身授权区间）。最终授权方式、规模上限与信创适配范围以商务报价为准。社区版规模上限由
            License 授权层控制，购买专业版/企业版解锁更高上限。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
