import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LoadingState } from '@/components/shared'
import { getSetupStatus, initSetup, getLoginPage } from '@/modules/identity'
import { encryptLoginPassword } from '@/lib/passwordCrypto'

/**
 * SetupPage — 首启初始化向导（P0-5）
 *
 * 目的：消除默认 admin/admin888 硬编码风险。部署后首次访问管理后台时，
 * 强制运营者通过 Web 表单创建第一个超级管理员账号。
 *
 * 流程：
 *   1. 挂载时调用 GET /adm/setup/status 确认系统未初始化
 *   2. 已初始化 → 直接跳转 /login（防重复访问）
 *   3. 未初始化 → 展示表单：account（手机号或邮箱）+ password（强密码）+ nickname
 *   4. 提交 POST /adm/setup/init，成功后跳转 /login
 *
 * 密码规则（与后端 adm_setup_logic:validate_password/1 对齐）：
 *   - 长度 8-64
 *   - 必须包含至少一个字母和一个数字
 */

const MOBILE_REGEX = /^1[3-9]\d{9}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const setupSchema = z
  .object({
    account: z
      .string()
      .min(1, '请输入手机号或邮箱')
      .refine(
        (v) => MOBILE_REGEX.test(v) || EMAIL_REGEX.test(v),
        '请输入有效的手机号或邮箱',
      ),
    password: z
      .string()
      .min(8, '密码至少 8 位')
      .max(64, '密码最多 64 位')
      .refine((v) => /[a-zA-Z]/.test(v), '密码必须包含字母')
      .refine((v) => /\d/.test(v), '密码必须包含数字'),
    passwordConfirm: z.string().min(1, '请再次输入密码'),
    nickname: z.string().min(1, '请输入昵称').max(80, '昵称最多 80 字符'),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: '两次输入的密码不一致',
    path: ['passwordConfirm'],
  })

type SetupForm = z.infer<typeof setupSchema>

export function SetupPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [alreadyInitialized, setAlreadyInitialized] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [publicKey, setPublicKey] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
  })

  // 挂载时检查是否已初始化，并同步获取 RSA 公钥，防重复访问
  useEffect(() => {
    let active = true

    const check = async () => {
      try {
        const [status, loginMeta] = await Promise.all([
          getSetupStatus(),
          getLoginPage(),
        ])
        if (!active) return
        setAlreadyInitialized(status.initialized)
        setPublicKey(loginMeta.public_key)
      } catch {
        // 网络错误时允许继续展示表单，让用户尝试提交
        if (active) setAlreadyInitialized(false)
      } finally {
        if (active) setChecking(false)
      }
    }

    check()
    return () => {
      active = false
    }
  }, [])

  const onSubmit = async (data: SetupForm) => {
    setSubmitting(true)
    try {
      const encryptedPwd = await encryptLoginPassword(data.password, publicKey)
      if (!encryptedPwd) {
        toast.error('加密初始化失败，请刷新页面后重试')
        return
      }
      await initSetup({
        account: data.account,
        password: encryptedPwd,
        nickname: data.nickname,
      })
      toast.success('超级管理员创建成功，请登录')
      navigate('/login', { replace: true })
    } catch (error: unknown) {
      const err = error as { msg?: string; message?: string }
      toast.error(err.msg || err.message || '初始化失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return <LoadingState message="检查系统初始化状态..." />
  }

  if (alreadyInitialized) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">首启初始化向导</CardTitle>
          <CardDescription>
            欢迎部署 Imboy，请创建首个超级管理员账号。该向导仅在全新部署时出现一次。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account">账号（手机号或邮箱）</Label>
              <Input
                id="account"
                placeholder="例如 13800138000 或 admin@example.com"
                autoComplete="username"
                {...register('account')}
                disabled={submitting}
              />
              {errors.account && (
                <p className="text-sm text-destructive">{errors.account.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">昵称</Label>
              <Input
                id="nickname"
                placeholder="例如 运维管理员"
                {...register('nickname')}
                disabled={submitting}
              />
              {errors.nickname && (
                <p className="text-sm text-destructive">{errors.nickname.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="8-64 位，需包含字母和数字"
                  autoComplete="new-password"
                  {...register('password')}
                  disabled={submitting}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
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
              <Label htmlFor="passwordConfirm">确认密码</Label>
              <Input
                id="passwordConfirm"
                type={showPassword ? 'text' : 'password'}
                placeholder="再次输入密码"
                autoComplete="new-password"
                {...register('passwordConfirm')}
                disabled={submitting}
              />
              {errors.passwordConfirm && (
                <p className="text-sm text-destructive">{errors.passwordConfirm.message}</p>
              )}
            </div>

            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
              <p className="font-semibold">安全提醒</p>
              <ul className="ml-4 list-disc space-y-0.5">
                <li>此账号将拥有 role_id=1 的超级管理员权限。</li>
                <li>密码经 HMAC-SHA512 加盐存储，请妥善保管原文。</li>
                <li>提交成功后此向导将永久关闭，不可再次触发。</li>
              </ul>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建超级管理员
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
