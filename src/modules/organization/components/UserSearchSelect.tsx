import { useCallback, useState } from 'react'
import { Search, UserCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { User } from '@/types/user'
import { searchUsersPayload } from '@/modules/identity/api/users'
import { classifyOrgError, isUserSelectableForOwner } from '../api/pureFunctions'

interface UserSearchSelectProps {
  /** 输入框 id（供 Label htmlFor 关联）。 */
  id: string
  /** data-testid 前缀：生成 `{prefix}-search-input` / `{prefix}-option` / `{prefix}-selected` / `{prefix}-results`。 */
  testIdPrefix: string
  /** 标签文案。 */
  label: string
  value: User | null
  onChange: (_user: User | null) => void
  /** 选中卡片下方的附加提示行（业务约束文案，如自转移警告 / 成员资格说明）。 */
  hint?: React.ReactNode
}

/**
 * 用户搜索选择器（organization 域内共享）：按账号 / 昵称 / 邮箱 / 手机号
 * 模糊搜索用户（后端 GET /user/search 四字段 OR LIKE）并点选，禁止手填
 * 裸 TSID——与 OrganizationCreateDialog 同一约定。
 *
 * 可选性口径与创建组织一致：仅 status=1（active）可选；human 判定由
 * 后端 fail-closed 完成（User 类型无 account_type，UI 不假装能判定）。
 */
export function UserSearchSelect({ id, testIdPrefix, label, value, onChange, hint }: UserSearchSelectProps) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const runSearch = useCallback(async () => {
    const trimmed = keyword.trim()
    if (trimmed.length === 0) {
      setResults([])
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      // searchUsersPayload 返回 PaginatedResponse<User>（信封 list 已由
      // responseAdapter.normalizeLegacyPagination 归一为 items）。
      const page = await searchUsersPayload(trimmed, 1, 20)
      setResults(Array.isArray(page?.items) ? page.items : [])
    } catch (err) {
      setSearchError(classifyOrgError(err).message)
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [keyword])

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-end gap-2">
        <Input
          id={id}
          data-testid={`${testIdPrefix}-search-input`}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="按账号 / 昵称 / 邮箱 / 手机号搜索"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void runSearch()
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void runSearch()} disabled={searching}>
          <Search className="mr-1 h-4 w-4" />
          搜索
        </Button>
      </div>

      {searchError ? <p className="text-xs text-destructive">{searchError}</p> : null}

      {!value && results.length > 0 ? (
        <ul
          className="max-h-48 space-y-1 overflow-auto rounded-md border p-1"
          data-testid={`${testIdPrefix}-results`}
        >
          {results.map((user) => {
            const selectable = isUserSelectableForOwner(user)
            return (
              <li key={user.id}>
                <button
                  type="button"
                  data-testid={`${testIdPrefix}-option`}
                  disabled={!selectable}
                  onClick={() => onChange(user)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="truncate">
                    <span className="font-medium">{user.nickname || '-'}</span>
                    {user.account ? <span className="ml-1 text-muted-foreground">({user.account})</span> : null}
                    {user.email ? <span className="ml-1 text-xs text-muted-foreground">{user.email}</span> : null}
                    {user.mobile ? <span className="ml-1 text-xs text-muted-foreground">{user.mobile}</span> : null}
                    <span className="ml-1 font-mono text-xs text-muted-foreground">{user.id}</span>
                  </span>
                  {selectable ? (
                    <Badge variant="default">active</Badge>
                  ) : (
                    <Badge variant="secondary">非活跃·不可选</Badge>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {value ? (
        <div className="space-y-2">
          <div className="rounded-md border bg-muted/40 p-3" data-testid={`${testIdPrefix}-selected`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="font-medium">{value.nickname || '-'}</span>
                {value.account ? <span className="text-muted-foreground">({value.account})</span> : null}
                <Badge variant="default">active</Badge>
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                重选
              </Button>
            </div>
          </div>
          {hint}
        </div>
      ) : null}
    </div>
  )
}
