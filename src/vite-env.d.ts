/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_NAME: string
  readonly VITE_SIDEBAR_CONFIG_URL?: string
  readonly VITE_UX_EVENT_REPORT_URL?: string
  readonly VITE_FEEDBACK_WORKFLOW_CONFIG_URL?: string
  readonly VITE_FEEDBACK_WORKFLOW_CONFIG_SAVE_URL?: string
  readonly VITE_ADMIN_LIST_ENDPOINT?: string
  readonly VITE_ADMIN_CREATE_ENDPOINT?: string
  readonly VITE_ADMIN_ASSIGN_ROLE_ENDPOINT?: string
  readonly VITE_ROLE_LIST_ENDPOINT?: string
  readonly VITE_ROLE_CREATE_ENDPOINT?: string
  readonly VITE_ROLE_PERMISSION_SAVE_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __IMBOY_UX_TRACK__?: (_event: string, _payload: Record<string, unknown>) => void
}
