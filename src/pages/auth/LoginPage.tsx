import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/authStore'
import { getCaptchaUrl, getLoginPage, loginPayload } from '@/modules/identity/api'
import { encryptLoginPassword } from '@/lib/passwordCrypto'

const loginSchema = z.object({
  account: z.string().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
  captcha: z.string().length(5, '验证码为5位'),
})

type LoginForm = z.infer<typeof loginSchema>

const ROUTE_ALIASES: Record<string, string> = {
  '/adm': '/dashboard',
  '/adm/': '/dashboard',
  '/adm/index': '/dashboard',
  '/adm/welcome': '/dashboard',
  '/adm/current': '/dashboard',
  '/adm/user/list': '/users',
  '/adm/group/list': '/groups',
  '/adm/channel/list': '/channels',
  '/adm/report/list': '/reports',
  '/adm/moment/report/list': '/reports',
  '/adm/feedback/index': '/feedback',
  '/adm/msg/list': '/messages',
  '/adm/logout_application/list': '/logout-applications',
  '/adm/log/list': '/logs',
}

const KNOWN_FRONTEND_ROUTES = new Set([
  '/dashboard',
  '/users',
  '/groups',
  '/channels',
  '/reports',
  '/feedback',
  '/messages',
  '/logout-applications',
  '/settings',
  '/settings/versions',
  '/settings/ddl',
  '/admins',
  '/roles',
  '/logs',
])

function normalizeNextRoute(rawNext?: string): string {
  if (!rawNext || typeof rawNext !== 'string') return '/dashboard'
  const trimmed = rawNext.trim()
  if (!trimmed) return '/dashboard'

  let path = trimmed
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname
    } catch {
      return '/dashboard'
    }
  }

  if (!path.startsWith('/')) {
    path = `/${path}`
  }

  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    path = path.slice(0, queryIndex)
  }
  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) {
    path = path.slice(0, hashIndex)
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }

  if (ROUTE_ALIASES[path]) {
    return ROUTE_ALIASES[path]
  }

  if (path.startsWith('/adm/passport')) {
    return '/dashboard'
  }

  if (path.startsWith('/adm/')) {
    const directPath = path.replace('/adm', '') || '/dashboard'
    if (KNOWN_FRONTEND_ROUTES.has(directPath)) {
      return directPath
    }
    return '/dashboard'
  }

  if (KNOWN_FRONTEND_ROUTES.has(path)) {
    return path
  }

  return '/dashboard'
}

export function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [captchaUrl, setCaptchaUrl] = useState('')
  const [systemName, setSystemName] = useState('Imboy 管理后台')
  const [csrfToken, setCsrfToken] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const navigate = useNavigate()
  const { isAuthenticated, setAdmin } = useAuthStore()

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const refreshCaptcha = useCallback(() => {
    setCaptchaUrl(getCaptchaUrl())
    setValue('captcha', '')
  }, [setValue])

  useEffect(() => {
    // 初始化获取 csrf_token 和验证码
    const init = async () => {
      try {
        const pageData = await getLoginPage()
        setCsrfToken(pageData.csrf_token)
        setPublicKey(pageData.public_key)
        if (pageData.system_name) {
          setSystemName(pageData.system_name)
        }
        refreshCaptcha()
      } catch (error) {
        console.error('初始化登录页面失败:', error)
      }
    }
    init()
  }, [refreshCaptcha])

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    try {
      const encryptedPwd = await encryptLoginPassword(data.password, publicKey)
      if (!encryptedPwd) {
        toast.error('登录信息初始化失败，请刷新页面后重试')
        refreshCaptcha()
        return
      }

      const loginData = await loginPayload({
        account: data.account,
        pwd: encryptedPwd,
        captcha: data.captcha,
        csrf_token: csrfToken,
      })
      setAdmin({
        id: loginData.id,
        account: loginData.account,
        nickname: loginData.nickname,
        avatar: loginData.avatar,
        role_id: loginData.role_id,
        login_count: 0,
        last_login_ip: '',
        last_login_at: '',
        status: 1,
        created_at: '',
      })
      toast.success('登录成功')
      navigate(normalizeNextRoute(loginData.next))
    } catch (error: unknown) {
      const err = error as { msg?: string }
      toast.error(err.msg || '登录失败')
      refreshCaptcha()
    } finally {
      setLoading(false)
    }
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{systemName}</CardTitle>
          <CardDescription>请输入您的账号和密码登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account">账号</Label>
              <Input
                id="account"
                placeholder="请输入账号"
                {...register('account')}
                disabled={loading}
              />
              {errors.account && (
                <p className="text-sm text-destructive">{errors.account.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入密码"
                  {...register('password')}
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="captcha">验证码</Label>
              <div className="flex gap-2">
                <Input
                  id="captcha"
                  placeholder="请输入验证码"
                  maxLength={5}
                  {...register('captcha')}
                  disabled={loading}
                  className="flex-1"
                />
                {captchaUrl && (
                  <img
                    src={captchaUrl}
                    alt="验证码"
                    className="h-10 w-24 cursor-pointer rounded border"
                    onClick={refreshCaptcha}
                    title="点击刷新"
                  />
                )}
              </div>
              {errors.captcha && (
                <p className="text-sm text-destructive">{errors.captcha.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
