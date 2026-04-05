import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * 全局顶部加载进度条。
 *
 * 使用方式：
 * 1. 将 <TopLoadingBar /> 挂载在组件树顶部
 * 2. 在任何位置调用 `startTopLoading()` / `finishTopLoading()` 控制进度
 */

let loadingCount = 0
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

export function startTopLoading() {
  loadingCount++
  notify()
}

export function finishTopLoading() {
  loadingCount = Math.max(0, loadingCount - 1)
  notify()
}

export function TopLoadingBar() {
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncState = useCallback(() => {
    if (loadingCount > 0) {
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current)
        finishTimerRef.current = null
      }

      setVisible(true)
      setProgress((prev) => {
        if (prev >= 90) return prev
        const increment = prev < 30 ? 30 : prev < 60 ? 20 : 10
        return Math.min(90, prev + increment)
      })

      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            if (timerRef.current) {
              clearInterval(timerRef.current)
              timerRef.current = null
            }
            return prev
          }
          return prev + Math.random() * 5
        })
      }, 300)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      setProgress(100)
      finishTimerRef.current = setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 300)
    }
  }, [])

  useEffect(() => {
    listeners.add(syncState)
    return () => {
      listeners.delete(syncState)
      if (timerRef.current) clearInterval(timerRef.current)
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
    }
  }, [syncState])

  if (!visible && progress === 0) return null

  return (
    <div
      className="fixed left-0 top-0 z-[9999] h-[3px] w-full"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 300ms' }}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-out"
        style={{
          width: `${Math.min(100, progress)}%`,
          boxShadow: progress > 50 ? '0 0 8px rgba(59,130,246,0.5)' : 'none',
        }}
      />
    </div>
  )
}
