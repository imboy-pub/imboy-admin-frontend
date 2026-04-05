import { Button } from '@/components/ui/button'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Home, ArrowLeft, ShieldAlert } from 'lucide-react'

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
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="relative">
          <h1 className="text-[120px] font-extrabold leading-none tracking-tighter text-destructive/20 select-none">
            403
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <ShieldAlert className="h-16 w-16 text-destructive/40" />
          </div>
        </div>

        <h2 className="mt-4 text-2xl font-semibold">无权限访问</h2>
        <p className="mt-2 text-muted-foreground">
          您没有访问该页面的权限。请联系管理员获取相应权限。
        </p>

        {fromPath && (
          <div className="mt-4 rounded-lg border bg-muted/30 px-4 py-2">
            <p className="text-sm text-muted-foreground">
              来源路径：<span className="font-mono text-xs">{fromPath}</span>
            </p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回上页
          </Button>
          <Button asChild>
            <Link to="/dashboard">
              <Home className="mr-2 h-4 w-4" />
              返回首页
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
