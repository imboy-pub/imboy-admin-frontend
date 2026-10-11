import type { EntityId } from '@/types/common'
import { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'

type PermissionRouteProps = {
  children: ReactElement
  permission?: string | string[]
  roles?: EntityId[]
}

export function PermissionRoute({ children, permission, roles }: PermissionRouteProps) {
  const location = useLocation()
  const { allowed, loading, unavailable, retry } = useAdminPermission({ permission, roles })

  if (loading) {
    return <LoadingState message="校验访问权限..." />
  }

  if (unavailable) {
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>暂时无法校验访问权限，请稍后重试。</p>
        <Button onClick={() => void retry()}>重新校验权限</Button>
      </div>
    )
  }

  if (!allowed) {
    return <Navigate to="/forbidden" replace state={{ from: location }} />
  }

  return children
}
