import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import {
  adminFeatureQueryKey,
  getAdminFeaturesPayload,
  getCachedAdminFeatures,
  getCachedAdminEntries,
  isAdminEntryEnabled,
  type FeatureFlags,
} from '@/services/api/features'

export function useAdminFeatures() {
  const account = useAuthStore((state) => state.admin?.account || '')
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const cachedFeatures = getCachedAdminFeatures()

  return useQuery<FeatureFlags | null>({
    queryKey: adminFeatureQueryKey(account),
    queryFn: () => getAdminFeaturesPayload(),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60 * 1000,
    initialData: cachedFeatures ?? undefined,
  })
}

export function useAdminEntries() {
  return useQuery<string[]>({
    queryKey: [...adminFeatureQueryKey(), 'entries'],
    queryFn: async () => {
      await getAdminFeaturesPayload()
      return getCachedAdminEntries()
    },
    staleTime: 5 * 60 * 1000,
    initialData: getCachedAdminEntries(),
  })
}

export function useAdminEntryEnabled(entry: string): boolean {
  const { data: adminEntries } = useAdminEntries()
  return isAdminEntryEnabled(adminEntries, entry)
}
