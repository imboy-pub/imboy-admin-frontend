import '../../test/setupDom'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { SSOConfigPage } from './SSOConfigPage'
import client from '../../services/api/client'

type AnyFn = (..._args: unknown[]) => unknown

type MutableClient = {
  get: AnyFn
  post: AnyFn
}

const mutableClient = client as unknown as MutableClient
const originalGet = mutableClient.get
const originalPost = mutableClient.post

const emptyConfig = {
  data: { success: true, payload: { ldap: undefined, saml: undefined, oauth2: undefined } },
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  })
  const invalidatedKeys: unknown[] = []
  ;(queryClient as unknown as { invalidateQueries: AnyFn }).invalidateQueries = async (
    arg: unknown
  ) => {
    invalidatedKeys.push((arg as { queryKey?: unknown })?.queryKey)
    return undefined
  }

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SSOConfigPage />
    </QueryClientProvider>
  )
  return { ...utils, invalidatedKeys }
}

describe('SSOConfigPage', () => {
  beforeEach(() => {
    mutableClient.get = async () => emptyConfig
    mutableClient.post = async () => ({ data: { success: true, payload: {} } })
  })

  afterEach(() => {
    mutableClient.get = originalGet
    mutableClient.post = originalPost
    cleanup()
  })

  it('invalidates sso-config query after saving LDAP config', async () => {
    const { getByText, findByText, invalidatedKeys } = renderPage()
    // 等待加载完成，LDAP 表单出现
    await findByText('启用 LDAP 认证')

    await act(async () => {
      fireEvent.click(getByText('保存配置'))
    })

    await waitFor(() => {
      expect(invalidatedKeys).toContainEqual(['sso-config'])
    })
  })
})
