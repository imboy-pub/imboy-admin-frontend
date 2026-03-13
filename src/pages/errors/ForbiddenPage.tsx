import { Button } from '@/components/ui/button'
import { Link, useLocation, useNavigate } from 'react-router-dom'

type LocationState = {
  from?: {
    pathname?: string
  }
}

export function ForbiddenPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromPath = (location.state as LocationState | null)?.from?.pathname

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold text-muted-foreground">403</h1>
      <p className="text-xl text-muted-foreground">无权限访问该页面</p>
      {fromPath && (
        <p className="text-sm text-muted-foreground">
          来源路径：<span className="font-mono">{fromPath}</span>
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          返回上页
        </Button>
        <Button asChild>
          <Link to="/dashboard">返回首页</Link>
        </Button>
      </div>
    </div>
  )
}

