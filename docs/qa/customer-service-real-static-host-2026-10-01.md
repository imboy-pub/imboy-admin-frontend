# 客服真实 E2E 承载修正 / Real E2E host correction

状态 / Status: **PARTIAL — transport and build checks only**.
Base Admin HEAD: `93af6284603d63abe8093ad1796ac58d8a7f2e46`.
Backend asset-pairing HEAD: `7057bddd4c810d38f7d504d3bd3e4f368f5647cc`.

旧承载引用不存在的无哈希 v1 文件、未转发 `/w/`，默认公开标识也不满足 loader 合同。现承载只接受显式提供的十进制 `CSWW_E2E_WIDGET_ID`，宿主 script 只声明该键；从当前构建读取 v2 入口和哈希 JS/CSS，并透明转发 `/w/` 与 `/api/`。
The old host referenced a removed v1 file, did not proxy `/w/`, and defaulted to an identifier rejected by the loader. The host now requires an explicit decimal public widget ID, serves the current v2 entry and hashed JS/CSS, and proxies the public frame route.

可复现检查 / Reproducible checks (Admin repository):

```sh
bun run build:widget
node --test scripts/test/customer-service-static-host.test.mjs
bun run verify:widget
IMBOY_REPO_DIR=/Users/leeyi/project/imboy.pub/.Codex/worktrees/gz-enterprise-backend bun run verify:widget-pairing
node --check tests/e2e/customer-service-real/helpers/static-host.mjs
git diff --check
```

结果 / Results: build exit 0; native HTTP tests 2 passed, 0 failed/skipped; artifact verification passed; both public Widget and Seat asset pairing passed. Initial pairing invocation without an explicit backend path returned SKIPPED/exit 3; the explicit-path invocation above passed.

HTTP 回归使用动态本机端口和原生回显服务，仅证明响应状态、头、方法、路径、请求体透明传输，以及所服务资源与构建文件字节一致。没有调用客服业务后端、数据库、附件存储或真实账号；不证明 CS-01/CS-02 或完整浏览器旅程。既有 E2E 的历史标识、数据库默认值及部分断言仍需更新后再执行，禁止直接复用共享旧环境。
The HTTP regression uses ephemeral local ports and a native echo server. It proves transport preservation and exact built-file bytes, not customer-service business behavior, storage, browser journeys, or production readiness. Legacy E2E identifiers, database defaults and assertions still require an isolated-fixture update before execution.
