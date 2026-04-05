import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { Home, ArrowLeft, Search } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        {/* 大号 404 文字 */}
        <div className="relative">
          <h1 className="text-[120px] font-extrabold leading-none tracking-tighter text-primary/20 select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <Search className="h-16 w-16 text-primary/40" />
          </div>
        </div>

        <h2 className="mt-4 text-2xl font-semibold">页面不存在</h2>
        <p className="mt-2 text-muted-foreground">
          您访问的页面可能已被移动、删除或从未存在过。
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => window.history.back()}>
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
