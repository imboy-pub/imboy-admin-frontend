import { Badge } from '@/components/ui/badge'
import type { DepartmentTreeNode, DepartmentRow } from '../api/pureFunctions'

type Props = {
  organizationName: string
  tree: DepartmentTreeNode[]
  selectedId: DepartmentRow['id'] | null
  onSelect: (_id: DepartmentRow['id']) => void
}

function DepartmentBranch({ node, selectedId, onSelect }: {
  node: DepartmentTreeNode
} & Pick<Props, 'selectedId' | 'onSelect'>) {
  return (
    <li className="flex flex-col items-center px-3" data-department-id={node.id} data-parent-id={node.parentId ?? ''}>
      <span className="h-5 border-l border-border" aria-hidden="true" />
      <button
        type="button"
        aria-pressed={node.id === selectedId}
        data-testid={`dept-chart-node-${node.id}`}
        onClick={() => onSelect(node.id)}
        className={`min-h-11 w-40 rounded-lg border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${node.id === selectedId ? 'border-primary bg-accent' : 'border-border bg-card hover:bg-accent'}`}
      >
        <span className="block break-words">{node.name}</span>
        {node.status === 'archived' ? <Badge variant="secondary" className="mt-1">已归档</Badge> : null}
      </button>
      {node.children.length > 0 ? (
        <>
          <span className="h-5 border-l border-border" aria-hidden="true" />
          <ul className="flex border-t border-border" aria-label={`${node.name}的下级部门`}>
            {node.children.map((child) => <DepartmentBranch key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />)}
          </ul>
        </>
      ) : null}
    </li>
  )
}

export function DepartmentOrganizationChart({ organizationName, tree, selectedId, onSelect }: Props) {
  const roots = tree.filter((node) => node.parentId === null)
  const unresolved = tree.filter((node) => node.parentId !== null)
  return (
    <div role="region" aria-label="企业组织架构图" tabIndex={0} className="overflow-x-auto rounded-lg border p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="department-chart">
      <div className="flex w-max min-w-full flex-col items-center">
        <div className="max-w-64 break-words rounded-lg bg-primary px-5 py-3 text-center font-medium text-primary-foreground">{organizationName}</div>
        {roots.length > 0 ? (
          <>
            <span className="h-5 border-l border-border" aria-hidden="true" />
            <ul className="flex border-t border-border" aria-label="企业根部门">
              {roots.map((node) => <DepartmentBranch key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />)}
            </ul>
          </>
        ) : null}
        {unresolved.length > 0 ? (
          <section className="mt-6 rounded-lg border border-dashed p-3" aria-label="上级关系待核实">
            <p className="mb-2 text-center text-sm text-muted-foreground">上级部门未显示，或层级关系异常</p>
            <ul className="flex">
              {unresolved.map((node) => <DepartmentBranch key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />)}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
