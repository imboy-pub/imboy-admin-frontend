/**
 * EntityDrawer 分区内容（ENT-FND-01）——Profile 分区 + 关系 Drawer 模式。
 *
 * ENT-00 取证结论：EntityDrawer 纯 slot 透传，缺内容分区（sections）与
 * 关系槽位（"所在群/频道"类关系导航）抽象。本文件补齐该共享能力，由
 * EntityDrawer 通过新增的 `sections` prop 消费；既有 `children` slot
 * 语义不变（19 个既有消费者零改动）。
 *
 * 分区协议（三种 kind）：
 *   - profile      —— 标签/值字段网格（事实分区：TSID/角色/时间戳等）；
 *   - relationship —— 关系条目列表（站内路由 Link 导航；loading/empty 态）；
 *   - custom       —— 任意 ReactNode（扩展逃生门，避免平行组件体系）。
 *
 * a11y：每个分区渲染为 <section aria-labelledby>，标题 useId 生成；
 * 关系条目为真实 <Link>，天然进入 EntityDrawer 既有焦点陷阱（Tab 序）。
 */
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export type EntityDrawerField = {
  label: string
  value: ReactNode
  /** true 时值用等宽字体呈现（TSID / 时间戳等机器可读事实） */
  mono?: boolean
}

export type EntityDrawerRelationItem = {
  id: string
  label: string
  description?: string
  /** 站内路由；提供时渲染为 Link，否则渲染为纯文本条目 */
  href?: string
}

export type EntityDrawerSection =
  | { id: string; kind: 'profile'; title: string; fields: EntityDrawerField[] }
  | {
      id: string
      kind: 'relationship'
      title: string
      items: EntityDrawerRelationItem[]
      loading?: boolean
      emptyMessage?: string
    }
  | { id: string; kind: 'custom'; title: string; content: ReactNode }

function ProfileSectionBody({ fields }: { fields: EntityDrawerField[] }) {
  return (
    <dl className="space-y-2" data-section-kind="profile">
      {fields.map((field) => (
        <div key={field.label} className="flex items-baseline justify-between gap-3 text-sm">
          <dt className="shrink-0 text-muted-foreground">{field.label}</dt>
          <dd
            className={cn('text-right', field.mono && 'font-mono text-xs')}
            data-field-label={field.label}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function RelationshipSectionBody({
  items,
  loading = false,
  emptyMessage = '暂无关联记录',
}: {
  items: EntityDrawerRelationItem[]
  loading?: boolean
  emptyMessage?: string
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">关系中...</p>
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }
  return (
    <ul className="space-y-1" data-section-kind="relationship">
      {items.map((item) => (
        <li key={item.id} className="text-sm">
          {item.href ? (
            <Link
              to={item.href}
              className="inline-flex min-h-11 items-center underline-offset-2 hover:underline"
              data-relation-id={item.id}
            >
              {item.label}
            </Link>
          ) : (
            <span data-relation-id={item.id}>{item.label}</span>
          )}
          {item.description ? (
            <span className="ml-2 text-xs text-muted-foreground">{item.description}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function SectionHeading({ id, title }: { id: string; title: string }) {
  return (
    <h3 id={id} className="mb-2 text-sm font-semibold text-foreground">
      {title}
    </h3>
  )
}

/** EntityDrawer 专用分区渲染器（不直接对外页面导出，经 EntityDrawer.sections 消费）。 */
export function EntityDrawerSections({ sections }: { sections: EntityDrawerSection[] }) {
  const headingPrefix = useId()
  return (
    <div className="space-y-6" data-testid="entity-drawer-sections">
      {sections.map((section) => {
        const headingId = `${headingPrefix}-${section.id}`
        return (
          <section key={section.id} aria-labelledby={headingId} data-section-id={section.id}>
            <SectionHeading id={headingId} title={section.title} />
            {section.kind === 'profile' && <ProfileSectionBody fields={section.fields} />}
            {section.kind === 'relationship' && (
              <RelationshipSectionBody
                items={section.items}
                loading={section.loading}
                emptyMessage={section.emptyMessage}
              />
            )}
            {section.kind === 'custom' && section.content}
          </section>
        )
      })}
    </div>
  )
}
