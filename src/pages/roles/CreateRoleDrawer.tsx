import { EntityDrawer } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface CreateRoleDrawerProps {
  open: boolean
  onOpenChange: (_open: boolean) => void
  roleName: string
  onRoleNameChange: (_value: string) => void
  roleDescription: string
  onRoleDescriptionChange: (_value: string) => void
  rolePermissions: string
  onRolePermissionsChange: (_value: string) => void
  onConfirm: () => void
  isPending: boolean
}

export function CreateRoleDrawer({
  open,
  onOpenChange,
  roleName,
  onRoleNameChange,
  roleDescription,
  onRoleDescriptionChange,
  rolePermissions,
  onRolePermissionsChange,
  onConfirm,
  isPending,
}: CreateRoleDrawerProps) {
  return (
    <EntityDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="新增角色"
      subtitle="创建新角色并设置初始权限集合（可留空后续编辑）"
      actions={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending ? '创建中...' : '确认创建'}
          </Button>
        </>
      )}
    >
      <div className="grid gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">角色名 *</label>
          <Input
            placeholder="例如：内容巡检管理员"
            value={roleName}
            onChange={(event) => onRoleNameChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">角色描述</label>
          <Textarea
            placeholder="可选"
            value={roleDescription}
            onChange={(event) => onRoleDescriptionChange(event.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">初始权限键（可选）</label>
          <Textarea
            placeholder="支持逗号、空格或换行分隔，例如：reports:read, reports:handle"
            value={rolePermissions}
            onChange={(event) => onRolePermissionsChange(event.target.value)}
            rows={4}
          />
        </div>
      </div>
    </EntityDrawer>
  )
}
