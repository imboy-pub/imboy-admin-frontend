import { useQuery } from '@tanstack/react-query'
import { getReportListPayload } from '@/modules/ops_governance/api/reports'
import { getFeedbackListPayload } from '@/modules/ops_governance/api/feedback'

export function useSidebarBadges() {
  const { data: reportData } = useQuery({
    queryKey: ['sidebar-badge', 'reports', 'pending'],
    queryFn: () => getReportListPayload('moment', { page: 1, size: 1, status: 0 }),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const { data: feedbackData } = useQuery({
    queryKey: ['sidebar-badge', 'feedback', 'pending'],
    queryFn: () => getFeedbackListPayload({ page: 1, size: 1, status: 1 }),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  return {
    pendingReports: reportData?.total ?? 0,
    pendingFeedback: feedbackData?.total ?? 0,
  }
}
