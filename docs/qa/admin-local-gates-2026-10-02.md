# 管理后台本地验收

候选 `6fd5b53019c0f85b4067d261a91146a747d773dc`；资产配对后端为独立、干净的 `8f25070787cc1dafb054bb97dd797daab4a8ee83`。以下六项顺序退出码均为 0：

- `bun run test`：2385 pass，0 fail，222 个文件。
- `bun run lint`
- `bun run build`
- `bun run build:widget`
- `bun run verify:widget`
- `IMBOY_REPO_DIR=<后端独立工作区> bun run verify:widget-pairing`

运行前后 Admin 全部 tracked 文件、测试驱动、HEAD 和 dirty 状态一致；配对实际读取的后端两个 handler 与配对 JSON 前后哈希一致。配对日志明确命中两个独立仓路径和完整 PASS，没有 PENDING、SKIPPED 或配对表读取豁免。

首次在 `5f2c5ef` 运行得到 2381 pass、4 fail。二进制附件测试替身缺少标准 Response.headers，导致现有 JSON 错误信封守卫触发异常。仅将该替身换成原生 Response；图片、下载、预览、URL 释放及拒绝错误信封等原断言保留，生产代码未改。针对性两个文件 39 pass，随后上述全量回归通过。失败记录保留于本机，不包装为通过。

证据位于 [evidence/admin-local-gates-2026-10-02](./evidence/admin-local-gates-2026-10-02/result.json)，日志仅归档白名单摘要，不归档原始可能含合成凭证的测试输出。附带 runner.py.txt 可恢复到 /tmp 并调整两个仓路径及冻结 HEAD 后复现，需要本地既有 Bun 依赖。

本结果只证明本地单元、检查、构建和资产配对，不证明真实客服浏览器旅程、客户 OA、设备或完整六项目标已完成；既有真实浏览器证据另行判读。没有 push、部署或生产迁移。
