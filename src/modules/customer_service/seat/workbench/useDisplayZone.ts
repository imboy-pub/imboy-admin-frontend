/**
 * R14 查看者时区生命周期（seat 工作台）。
 *
 * - focus / visibilitychange / pageshow（bfcache resume）触发 zone 核对
 *   （recheckDisplayZone）；zone 变化 → bump epoch → 页面组件 state 变化
 *   引起工作台整树重渲染，messageTime / 队列时钟 / 日期分组在渲染期经
 *   resolver memo 重新取 zone（formatter 缓存已被 recheck 失效）；
 * - 不逐条消息常驻 timer；unmount（dispose）cleanup 移除全部监听；
 * - zone resolver 本身可注入（用户设置等来源，见 lib/displayTime）。
 */
import { useEffect, useState } from 'react'
import { recheckDisplayZone } from '@/lib/displayTime'

export function useDisplayZoneEpoch(): number {
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    const recheck = (): void => {
      if (recheckDisplayZone()) setEpoch((current) => current + 1)
    }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('pageshow', recheck)
    // 挂载即核对一次：页面在别的 tab 里被切区后首次进入也能对齐。
    recheck()
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('pageshow', recheck)
    }
  }, [])
  return epoch
}
