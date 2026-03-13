import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl text-muted-foreground">页面不存在</p>
      <Button asChild>
        <Link to="/dashboard">返回首页</Link>
      </Button>
    </div>
  )
}
