import { beforeEach } from 'bun:test'

// Unit-only Web Locks substitute; real cross-tab exclusion requires browser acceptance.
//
// bun 单进程连跑全部测试文件时，模块顶层注册的 beforeEach 只挂到「首次加载本模块」
// 的那个测试文件的 suite；若先跑的其他文件触发本模块加载，后续 importer 将拿不到
// 该 shim（表现为「浏览器不支持安全上传任务锁」炸锁，如 seatSend.attachmentRecovery
// 与 src/lib 合跑时 22 用例全灭）。因此导出显式安装函数，由每个使用文件在顶层调用，
// 把 hook 注册进自己的 suite。
export function installAttachmentLocksShim(): void {
  beforeEach(() => {
    const held = new Set<string>()
    if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: async (name: string, _options: unknown, callback: (_lock: object | null) => unknown) => {
        if (held.has(name)) return callback(null)
        held.add(name)
        try { return await callback({}) } finally { held.delete(name) }
      },
    } })
  })
}
