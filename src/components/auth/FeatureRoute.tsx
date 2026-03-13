import { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LoadingState } from '@/components/shared'
import { useAdminFeatures } from '@/hooks/useAdminFeatures'
import { isAdminFeatureEnabled } from '@/services/api/features'

type FeatureRouteProps = {
  children: ReactElement
  feature: string
}

export function FeatureRoute({ children, feature }: FeatureRouteProps) {
  const location = useLocation()
  const { data: featureFlags, isLoading } = useAdminFeatures()

  if (isLoading && featureFlags === undefined) {
    return <LoadingState message="校验功能开关..." />
  }

  if (!isAdminFeatureEnabled(featureFlags, feature)) {
    return <Navigate to="/dashboard" replace state={{ from: location }} />
  }

  return children
}
