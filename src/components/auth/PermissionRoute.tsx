import { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LoadingState } from '@/components/shared'
import { useAdminPermission } from '@/hooks/useAdminPermission'

type PermissionRouteProps = {
  children: ReactElement
  permission?: string | string[]
  roles?: number[]
}

export function PermissionRoute({ children, permission, roles }: PermissionRouteProps) {
  const location = useLocation()
  const { allowed, loading } = useAdminPermission({ permission, roles })

  if (loading) {
    return <LoadingState message="校验访问权限..." />
  }

  if (!allowed) {
    return <Navigate to="/forbidden" replace state={{ from: location }} />
  }

  return children
}
