/**
 * 统一错误消息提取工具
 *
 * 后端抛出的错误为 ApiError { code: number; msg: string }，
 * 不是原生 Error 实例，直接用 err.message 会得到 undefined。
 * 此工具函数安全地从任意未知错误中提取可读消息。
 */
export function getErrorMessage(err: unknown, fallback = '操作失败，请重试'): string {
  if (err == null) return fallback
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e['msg'] === 'string' && e['msg']) return e['msg']
    if (typeof e['message'] === 'string' && e['message']) return e['message']
  }
  if (typeof err === 'string' && err) return err
  return fallback
}
