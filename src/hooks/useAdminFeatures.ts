import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import {
  getAdminFeaturesPayload,
  getCachedAdminFeatures,
  type FeatureFlags,
} from '@/services/api/features'

export function useAdminFeatures() {
  const account = useAuthStore((state) => state.admin?.account || '')
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const cachedFeatures = getCachedAdminFeatures()

  return useQuery<FeatureFlags | null>({
    queryKey: ['admin', 'features', account || 'anonymous'],
    queryFn: () => getAdminFeaturesPayload(),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60 * 1000,
    initialData: cachedFeatures ?? undefined,
  })
}
