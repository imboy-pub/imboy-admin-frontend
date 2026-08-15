import { Check, Circle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PermissionCatalogItem, RoleTemplateConfig } from '@/services/api/adminConfig'

interface PermissionMatrixProps {
  filteredPermissions: PermissionCatalogItem[]
  roleTemplates: RoleTemplateConfig[]
  rolePermissionSets: Map<string, Set<string>>
}

export function PermissionMatrix({ filteredPermissions, roleTemplates, rolePermissionSets }: PermissionMatrixProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>权限矩阵（审阅）</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2 text-left">权限</th>
                <th className="px-3 py-2 text-left">模块</th>
                <th className="px-3 py-2 text-left">路径</th>
                {roleTemplates.map((role) => (
                  <th key={role.id} className="px-3 py-2 text-center">
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPermissions.map((item) => (
                <tr key={item.key} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.module}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.path}</td>
                  {roleTemplates.map((role) => {
                    const allowed = rolePermissionSets.get(role.id)?.has(item.key) || false
                    return (
                      <td key={`${item.key}-${role.id}`} className="px-3 py-2 text-center">
                        {allowed ? (
                          <Check className="mx-auto h-4 w-4 text-green-600" />
                        ) : (
                          <Circle className="mx-auto h-4 w-4 text-muted-foreground/40" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
