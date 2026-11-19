# 第三方许可证清单 / Third-party license inventory

本清单覆盖 Admin、客服坐席与 Widget 的全部锁定依赖实例（包括平台可选包）。运行、开发分组按依赖图可达性，兼属两组表示共享依赖；不等于最终 bundle 内容。
This inventory covers every locked instance, including platform optional packages. Reachability separates runtime and development; shared entries are not a bundle manifest.

`bun run licenses:generate` 离线读取完整性匹配锁文件的精确 tarball；本地安装包与 Bun 缓存只能辅助诊断，不能满足资格；`bun run licenses:check` 校验生成物一致性。缺失元数据、许可证文本、未知声明或不可达实例均退出 1，不能猜测许可证。
`licenses:generate` qualifies only tarballs matching lock integrity; installed/cache metadata is diagnostic only; `licenses:check` also rejects drift. Missing or unknown evidence fails closed. Provide every non-vendored locked archive, including platform variants, via IMBOY_LICENSE_ARCHIVE_DIR to an external directory of exact npm tarballs named SHA-256(name@version).tgz; their lock SHA-512 is verified, with no install scripts executed.

许可证声明来自 package.json；文本列为包顶层 LICENSE/COPYING/NOTICE 原文 SHA-256（原 tarball 也读取其嵌套许可证）。全部非 vendored 锁定原包（含平台变体）须放仓外 IMBOY_LICENSE_ARCHIVE_DIR，按 name@version 的 SHA-256 命名 .tgz，校验 lock SHA-512。清单不替代再分发时随包提供的完整许可证、版权声明与 NOTICE，也不构成法律授权。vendored qrcode.react 直接校验仓内 tarball 的 lock SHA-512 并读取包内原文。
Declarations come from package.json and hashes bind original license/notice texts. Redistribute full upstream notices and licenses where required. The vendored qrcode.react archive is checked against lock integrity.

原包缺少独立 LICENSE 时，只接受原包内与完整 MIT/BSD 模板正文一致、且附版权声明的原文（只归一化换行、空白与注释行前缀；截断正文、缺任何授权条件或免责段落均不接受），或 npm 精确版本元数据 gitHead 所指官方仓原文；仓外 .registry.json/.source-licenses.json 及 source-license-N.txt 必须通过 name/version/lock integrity、仓库 revision 与文本 hash 校验。空白原文不算正文；没有原文的已声明许可证仍标待核验。侧车校验只证明本地数据内部一致性，不能认证 registry 响应或官方源码下载；须另行审查可信下载来源证据。
Embedded MIT/BSD recognition requires the complete notice body matching a conservative template plus copyright attribution; only whitespace/comment-prefix formatting is normalized. Truncated grants, conditions or disclaimers do not qualify. Exact registry gitHead source notices may be checked separately. External sidecars are bound to name/version/lock integrity, repository revision and text hash. Empty/whitespace notices do not qualify. Sidecar checks prove internal consistency only, not registry/source authenticity; independent trusted-download evidence is required. A declaration without notice text remains unverified.

bun.lock SHA-256: `3323a4de100ea961b1b95096b557714b3ab9da589d5bae3ddbe757b46486d2bc`

| 锁定实例 / Lock instance | 版本 / Version | 用途 / Scope | 声明 / License | 原文 SHA-256 / Text | 来源 / Source | 元数据资格 / Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| @babel/code-frame | 7.29.0 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/compat-data | 7.29.0 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/core | 7.29.0 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/generator | 7.29.1 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/helper-compilation-targets | 7.28.6 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/helper-compilation-targets/lru-cache | 5.1.1 | 开发 / Development | ISC | LICENSE: 4ec3d4c66cd87f5c8d8ad911b10f99bf27cb00cdfcff82621956e379186b016b | bun-cache | 待核验 / Unverified |
| @babel/helper-globals | 7.28.0 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/helper-module-imports | 7.28.6 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/helper-module-transforms | 7.28.6 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/helper-string-parser | 7.27.1 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/helper-validator-identifier | 7.28.5 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/helper-validator-option | 7.27.1 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/helpers | 7.28.6 | 开发 / Development | MIT | LICENSE: 4be9d87b56a306293223b490c0d0b245e9e94f39884147bf051a6c7b825aeb30 | bun-cache | 待核验 / Unverified |
| @babel/parser | 7.29.0 | 开发 / Development | MIT | LICENSE: 2e97627cb278aa7556fb9e8817368302301a595b6c7582512b8d74c57b773652 | bun-cache | 待核验 / Unverified |
| @babel/runtime | 7.28.6 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/template | 7.28.6 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/traverse | 7.29.0 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @babel/types | 7.29.0 | 开发 / Development | MIT | LICENSE: 117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76 | bun-cache | 待核验 / Unverified |
| @cacheable/memory | 2.2.0 | 开发 / Development | MIT | LICENSE: 465e8da349d50d8512e4a0e9b26d2bee50392c394f17edaa3be6e0df7c2b27ad | bun-cache | 待核验 / Unverified |
| @cacheable/utils | 2.5.0 | 开发 / Development | MIT | LICENSE: 465e8da349d50d8512e4a0e9b26d2bee50392c394f17edaa3be6e0df7c2b27ad | bun-cache | 待核验 / Unverified |
| @emnapi/core | 1.11.2 | 开发 / Development | MIT | LICENSE: 2088f55c6731498410b20c95ebd345ed4a4a800bf74c0fba4d282fd2a021daaa | bun-cache | 待核验 / Unverified |
| @emnapi/runtime | 1.11.2 | 开发 / Development | MIT | LICENSE: 2088f55c6731498410b20c95ebd345ed4a4a800bf74c0fba4d282fd2a021daaa | bun-cache | 待核验 / Unverified |
| @emnapi/wasi-threads | 1.2.2 | 开发 / Development | MIT | LICENSE: 2088f55c6731498410b20c95ebd345ed4a4a800bf74c0fba4d282fd2a021daaa | bun-cache | 待核验 / Unverified |
| @eslint-community/eslint-utils | 4.9.1 | 开发 / Development | MIT | LICENSE: fcf6eabf68ca96988a6b506b4fdc6cc32535d80eb2e11c79724af5ac6f50262b | bun-cache | 待核验 / Unverified |
| @eslint-community/eslint-utils/eslint-visitor-keys | 3.4.3 | 开发 / Development | Apache-2.0 | LICENSE: d8bf34ff6d190640a01e7704ad78253fc181bc128949d71273fbbaa12f33c0b4 | bun-cache | 待核验 / Unverified |
| @eslint-community/regexpp | 4.12.2 | 开发 / Development | MIT | LICENSE: fcf6eabf68ca96988a6b506b4fdc6cc32535d80eb2e11c79724af5ac6f50262b | bun-cache | 待核验 / Unverified |
| @eslint/config-array | 0.23.5 | 开发 / Development | Apache-2.0 | LICENSE: c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | bun-cache | 待核验 / Unverified |
| @eslint/config-array/minimatch | 10.2.5 | 开发 / Development | BlueOak-1.0.0 | LICENSE.md: 2c7c5d22ed5a8ee968c64757710979afcd77438c48b4a265b94e615babd8a901 | bun-cache | 待核验 / Unverified |
| @eslint/config-helpers | 0.7.0 | 开发 / Development | Apache-2.0 | LICENSE: c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | bun-cache | 待核验 / Unverified |
| @eslint/core | 1.2.1 | 开发 / Development | Apache-2.0 | LICENSE: c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | bun-cache | 待核验 / Unverified |
| @eslint/js | 10.0.1 | 开发 / Development | MIT | LICENSE: 3b6be04f862a077a4b97929dbf247299360824d9365f8603c263769303ace18c | bun-cache | 待核验 / Unverified |
| @eslint/object-schema | 3.0.5 | 开发 / Development | Apache-2.0 | LICENSE: c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | bun-cache | 待核验 / Unverified |
| @eslint/plugin-kit | 0.7.3 | 开发 / Development | Apache-2.0 | LICENSE: c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | bun-cache | 待核验 / Unverified |
| @exodus/bytes | 1.16.0 | 开发 / Development | MIT | LICENSE: dbffd380d59504ba19fcf87ff5a1a33c37edf66d5b09966b0ad5368ab87bc2af | bun-cache | 待核验 / Unverified |
| @hookform/resolvers | 7.0.6 | 运行 / Runtime | MIT | LICENSE: e8eeb472f0a5889c2c51625b86a3f9b8630680adb9f49a125352e2e426392780 | bun-cache | 待核验 / Unverified |
| @humanfs/core | 0.19.2 | 开发 / Development | Apache-2.0 | LICENSE: c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | bun-cache | 待核验 / Unverified |
| @humanfs/node | 0.16.8 | 开发 / Development | Apache-2.0 | LICENSE: c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | bun-cache | 待核验 / Unverified |
| @humanfs/types | 0.15.0 | 开发 / Development | Apache-2.0 | MISSING | bun-cache | 待核验 / Unverified |
| @humanwhocodes/module-importer | 1.0.1 | 开发 / Development | Apache-2.0 | LICENSE: c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | bun-cache | 待核验 / Unverified |
| @humanwhocodes/retry | 0.4.3 | 开发 / Development | Apache-2.0 | LICENSE: c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | bun-cache | 待核验 / Unverified |
| @jridgewell/gen-mapping | 0.3.13 | 开发 / Development | MIT | LICENSE: 769d154fbde32a915af110b1123650bc79f4cbe675acc66e005265bf069c6c6c | bun-cache | 待核验 / Unverified |
| @jridgewell/gen-mapping/@jridgewell/sourcemap-codec | 1.5.5 | 开发 / Development | MIT | LICENSE: 769d154fbde32a915af110b1123650bc79f4cbe675acc66e005265bf069c6c6c | bun-cache | 待核验 / Unverified |
| @jridgewell/remapping | 2.3.5 | 开发 / Development | MIT | LICENSE: 769d154fbde32a915af110b1123650bc79f4cbe675acc66e005265bf069c6c6c | bun-cache | 待核验 / Unverified |
| @jridgewell/resolve-uri | 3.1.2 | 开发 / Development | MIT | LICENSE: b8778b155bfde5a28b023a558753c0fa058a52bb9de35c343c250be1bbcdedab | bun-cache | 待核验 / Unverified |
| @jridgewell/sourcemap-codec | 1.6.0 | 开发 / Development | MIT | LICENSE: 769d154fbde32a915af110b1123650bc79f4cbe675acc66e005265bf069c6c6c | bun-cache | 待核验 / Unverified |
| @jridgewell/trace-mapping | 0.3.31 | 开发 / Development | MIT | LICENSE: 769d154fbde32a915af110b1123650bc79f4cbe675acc66e005265bf069c6c6c | bun-cache | 待核验 / Unverified |
| @jridgewell/trace-mapping/@jridgewell/sourcemap-codec | 1.5.5 | 开发 / Development | MIT | LICENSE: 769d154fbde32a915af110b1123650bc79f4cbe675acc66e005265bf069c6c6c | bun-cache | 待核验 / Unverified |
| @keyv/bigmap | 1.3.1 | 开发 / Development | MIT | LICENSE: f18cad8d98d4454ad42c33f1950d642cd3b939f2ccd3c36710fa8f50842cacc0 | bun-cache | 待核验 / Unverified |
| @keyv/serialize | 1.1.1 | 开发 / Development | MIT | LICENSE: 1f7dca26d2d328c3dbb9b6fe3b15ec3cda08ffe2288e47b73d617454b256f959 | bun-cache | 待核验 / Unverified |
| @napi-rs/wasm-runtime | 1.1.6 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-android-arm-eabi | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-android-arm64 | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-darwin-arm64 | 0.155.0 | 开发 / Development | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @oxc-parser/binding-darwin-x64 | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-freebsd-x64 | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-linux-arm-gnueabihf | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-linux-arm-musleabihf | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-linux-arm64-gnu | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-linux-arm64-musl | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-linux-ppc64-gnu | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-linux-riscv64-gnu | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-linux-riscv64-musl | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-linux-s390x-gnu | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-linux-x64-gnu | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-linux-x64-musl | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-openharmony-arm64 | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-win32-arm64-msvc | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-win32-ia32-msvc | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-parser/binding-win32-x64-msvc | 0.155.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-project/types | 0.155.0 | 开发 / Development | MIT | LICENSE: 95ced5ecf1133fbf41d409b5555c86c344f83f3b019926057ddbc07cfdcc27b3 | bun-cache | 待核验 / Unverified |
| @oxc-resolver/binding-android-arm-eabi | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-android-arm64 | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-darwin-arm64 | 11.24.2 | 开发 / Development | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @oxc-resolver/binding-darwin-x64 | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-freebsd-x64 | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-linux-arm-gnueabihf | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-linux-arm-musleabihf | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-linux-arm64-gnu | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-linux-arm64-musl | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-linux-ppc64-gnu | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-linux-riscv64-gnu | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-linux-riscv64-musl | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-linux-s390x-gnu | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-linux-x64-gnu | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-linux-x64-musl | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-openharmony-arm64 | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-wasm32-wasi | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-win32-arm64-msvc | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @oxc-resolver/binding-win32-x64-msvc | 11.24.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @playwright/test | 1.65.0 | 开发 / Development | Apache-2.0 | LICENSE: 45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb<br>NOTICE: 6d602191187b35b9b01d2cffa01c8469c2c8d9de8a96f1bf868e0f264f51c81d | bun-cache | 待核验 / Unverified |
| @radix-ui/primitive | 1.2.0 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog | 1.2.1 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog | 1.3.1 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-dismissable-layer | 1.2.1 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-dismissable-layer/@radix-ui/react-use-callback-ref | 1.1.5 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-dismissable-layer/@radix-ui/react-use-effect-event | 0.0.5 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-focus-guards | 1.2.0 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-focus-scope | 1.3.1 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-focus-scope/@radix-ui/react-use-callback-ref | 1.1.5 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-id | 1.1.4 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-portal | 1.2.0 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-presence | 1.1.11 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-slot | 1.5.0 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-use-controllable-state | 1.3.0 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-alert-dialog/@radix-ui/react-dialog/@radix-ui/react-use-controllable-state/@radix-ui/react-use-effect-event | 0.0.5 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-compose-refs | 1.1.5 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-context | 1.3.0 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-dialog | 1.1.15 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-dialog/@radix-ui/primitive | 1.1.3 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-dialog/@radix-ui/react-compose-refs | 1.1.2 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-dialog/@radix-ui/react-context | 1.1.2 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-dialog/@radix-ui/react-primitive | 2.1.3 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-dismissable-layer | 1.1.11 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-dismissable-layer/@radix-ui/primitive | 1.1.3 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-dismissable-layer/@radix-ui/react-compose-refs | 1.1.2 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-dismissable-layer/@radix-ui/react-primitive | 2.1.3 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-focus-guards | 1.1.3 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-focus-scope | 1.1.7 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-focus-scope/@radix-ui/react-compose-refs | 1.1.2 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-focus-scope/@radix-ui/react-primitive | 2.1.3 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-id | 1.1.1 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-id/@radix-ui/react-use-layout-effect | 1.1.1 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-portal | 1.1.9 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-portal/@radix-ui/react-primitive | 2.1.3 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-portal/@radix-ui/react-use-layout-effect | 1.1.1 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-presence | 1.1.5 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-presence/@radix-ui/react-compose-refs | 1.1.2 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-presence/@radix-ui/react-use-layout-effect | 1.1.1 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-primitive | 2.2.0 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-primitive/@radix-ui/react-slot | 1.5.0 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-slot | 1.2.3 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-slot/@radix-ui/react-compose-refs | 1.1.2 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-use-callback-ref | 1.1.1 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-use-controllable-state | 1.2.2 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-use-controllable-state/@radix-ui/react-use-layout-effect | 1.1.1 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-use-effect-event | 0.0.2 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @radix-ui/react-use-effect-event/@radix-ui/react-use-layout-effect | 1.1.1 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-use-escape-keydown | 1.1.1 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @radix-ui/react-use-layout-effect | 1.1.4 | 运行 / Runtime | MIT | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | bun-cache | 待核验 / Unverified |
| @reduxjs/toolkit | 2.11.2 | 运行 / Runtime | MIT | LICENSE: 49784961ec6c4941437b7a2c54d8977d0528076a9e7c73dd40f7d0942b8f106d | bun-cache | 待核验 / Unverified |
| @reduxjs/toolkit/immer | 11.1.4 | 运行 / Runtime | MIT | LICENSE: 99cf22f6960a6fe228ec84ea9aefb0d75b27999ece83a3a9801e1c2081fa270b | bun-cache | 待核验 / Unverified |
| @reduxjs/toolkit/reselect | 5.1.1 | 运行 / Runtime | MIT | LICENSE: 0bb5035e49bf9b5661655b402bab3c3efccb8eab2a50e37392100139fe3280f2 | bun-cache | 待核验 / Unverified |
| @rolldown/binding-android-arm-eabi | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-android-arm64 | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-darwin-arm64 | 1.2.19 | 开发 / Development | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @rolldown/binding-darwin-x64 | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-freebsd-x64 | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-linux-arm-gnueabihf | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-linux-arm64-gnu | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-linux-arm64-musl | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-linux-ppc64-gnu | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-linux-s390x-gnu | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-linux-x64-gnu | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-linux-x64-musl | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-openharmony-arm64 | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-wasm32-wasi | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-wasm32-wasi/@emnapi/core | 2.0.0-beta.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-wasm32-wasi/@emnapi/core/@emnapi/wasi-threads | 2.2.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-wasm32-wasi/@emnapi/runtime | 2.0.0-beta.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-wasm32-wasi/@napi-rs/wasm-runtime | 1.2.6 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-win32-arm64-msvc | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/binding-win32-x64-msvc | 1.2.19 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @rolldown/pluginutils | 1.0.1 | 开发 / Development | MIT | LICENSE: e1919b3b98b8bf6c1b99fcc60a0ed46027c97ac947432e1278446c9606f50161 | bun-cache | 待核验 / Unverified |
| @standard-schema/spec | 1.1.0 | 运行 / Runtime | MIT | LICENSE: 653b779005a3a4d64a7288c940f7b9a0e8f0b1e0375f6aa6af9473caf131e564 | bun-cache | 待核验 / Unverified |
| @standard-schema/utils | 0.3.0 | 运行 / Runtime | MIT | LICENSE: 9cf2166507311f427e083ef7671da566949391cb745789abcff8bd43ac26d1f1 | bun-cache | 待核验 / Unverified |
| @tailwindcss/node | 4.3.4 | 开发 / Development | MIT | LICENSE: 60e0b68c0f35c078eef3a5d29419d0b03ff84ec1df9c3f9d6e39a519a5ae7985 | bun-cache | 待核验 / Unverified |
| @tailwindcss/node/tailwindcss | 4.3.4 | 开发 / Development | MIT | LICENSE: 60e0b68c0f35c078eef3a5d29419d0b03ff84ec1df9c3f9d6e39a519a5ae7985 | bun-cache | 待核验 / Unverified |
| @tailwindcss/oxide | 4.3.4 | 开发 / Development | MIT | LICENSE: 60e0b68c0f35c078eef3a5d29419d0b03ff84ec1df9c3f9d6e39a519a5ae7985 | bun-cache | 待核验 / Unverified |
| @tailwindcss/oxide-android-arm64 | 4.3.4 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @tailwindcss/oxide-darwin-arm64 | 4.3.4 | 开发 / Development | MIT | LICENSE: 60e0b68c0f35c078eef3a5d29419d0b03ff84ec1df9c3f9d6e39a519a5ae7985 | bun-cache | 待核验 / Unverified |
| @tailwindcss/oxide-darwin-x64 | 4.3.4 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @tailwindcss/oxide-freebsd-x64 | 4.3.4 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @tailwindcss/oxide-linux-arm-gnueabihf | 4.3.4 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @tailwindcss/oxide-linux-arm64-gnu | 4.3.4 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @tailwindcss/oxide-linux-arm64-musl | 4.3.4 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @tailwindcss/oxide-linux-x64-gnu | 4.3.4 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @tailwindcss/oxide-linux-x64-musl | 4.3.4 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @tailwindcss/oxide-wasm32-wasi | 4.3.4 | 开发 / Development | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @tailwindcss/oxide-wasm32-wasi/@emnapi/core | 1.11.3 | 开发 / Development | MIT | LICENSE: 2088f55c6731498410b20c95ebd345ed4a4a800bf74c0fba4d282fd2a021daaa | installed | 待核验 / Unverified |
| @tailwindcss/oxide-wasm32-wasi/@emnapi/runtime | 1.11.3 | 开发 / Development | MIT | LICENSE: 2088f55c6731498410b20c95ebd345ed4a4a800bf74c0fba4d282fd2a021daaa | installed | 待核验 / Unverified |
| @tailwindcss/oxide-wasm32-wasi/@emnapi/wasi-threads | 1.2.3 | 开发 / Development | MIT | LICENSE: 2088f55c6731498410b20c95ebd345ed4a4a800bf74c0fba4d282fd2a021daaa | installed | 待核验 / Unverified |
| @tailwindcss/oxide-wasm32-wasi/@napi-rs/wasm-runtime | 1.2.7 | 开发 / Development | MIT | MISSING | bun-cache | 待核验 / Unverified |
| @tailwindcss/oxide-wasm32-wasi/@tybys/wasm-util | 0.10.3 | 开发 / Development | MIT | MISSING | installed | 待核验 / Unverified |
| @tailwindcss/oxide-wasm32-wasi/tslib | 2.8.1 | 开发 / Development | 0BSD | LICENSE.txt: 210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751 | bun-cache | 待核验 / Unverified |
| @tailwindcss/oxide-win32-arm64-msvc | 4.3.4 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @tailwindcss/oxide-win32-x64-msvc | 4.3.4 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @tailwindcss/vite | 4.3.4 | 开发 / Development | MIT | LICENSE: 60e0b68c0f35c078eef3a5d29419d0b03ff84ec1df9c3f9d6e39a519a5ae7985 | bun-cache | 待核验 / Unverified |
| @tailwindcss/vite/tailwindcss | 4.3.4 | 开发 / Development | MIT | LICENSE: 60e0b68c0f35c078eef3a5d29419d0b03ff84ec1df9c3f9d6e39a519a5ae7985 | bun-cache | 待核验 / Unverified |
| @tanstack/query-core | 5.107.1 | 运行 / Runtime | MIT | LICENSE: a405ee70c632bb938acb7ac5f210e814409b3760ea9d2329d8ed8ffcfd11a0e7 | bun-cache | 待核验 / Unverified |
| @tanstack/react-query | 5.107.1 | 运行 / Runtime | MIT | LICENSE: a405ee70c632bb938acb7ac5f210e814409b3760ea9d2329d8ed8ffcfd11a0e7 | bun-cache | 待核验 / Unverified |
| @tanstack/react-store | 0.11.1 | 运行 / Runtime | MIT | LICENSE: cb4a7917af22bd56340e877f10a5c5aa4fded7af2459162630ff7fcb48bb45c7 | bun-cache | 待核验 / Unverified |
| @tanstack/react-table | 9.1.2 | 运行 / Runtime | MIT | LICENSE: 9db3f8ddd7031ab264b99bec49c221155d0c8649b53dd4aa007f2041d36cdf5f | bun-cache | 待核验 / Unverified |
| @tanstack/store | 0.11.1 | 运行 / Runtime | MIT | LICENSE: cb4a7917af22bd56340e877f10a5c5aa4fded7af2459162630ff7fcb48bb45c7 | bun-cache | 待核验 / Unverified |
| @tanstack/table-core | 9.1.2 | 运行 / Runtime | MIT | LICENSE: 9db3f8ddd7031ab264b99bec49c221155d0c8649b53dd4aa007f2041d36cdf5f | bun-cache | 待核验 / Unverified |
| @testing-library/dom | 10.4.2 | 开发 / Development | MIT | LICENSE: bf8fd38056b7606deccfcadb4d8ca1c210082d8ef5513426d2650daedc30bed3 | bun-cache | 待核验 / Unverified |
| @testing-library/react | 16.3.3 | 开发 / Development | MIT | LICENSE: 9680978280d509520d2a7b51e93ffbf7d9ec2b9de4411a6989daba5b659048e0 | bun-cache | 待核验 / Unverified |
| @testing-library/user-event | 14.6.10 | 开发 / Development | MIT | LICENSE: b5a4028c49c48f820831421de69c8ea83d621a062914bf16739fd0703c7c9fba | bun-cache | 待核验 / Unverified |
| @tybys/wasm-util | 0.10.3 | 开发 / Development | MIT | MISSING | installed | 待核验 / Unverified |
| @types/aria-query | 5.0.4 | 开发 / Development | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/d3-array | 3.2.2 | 运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/d3-color | 3.1.3 | 运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/d3-ease | 3.0.2 | 运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/d3-interpolate | 3.0.4 | 运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/d3-path | 3.1.1 | 运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/d3-scale | 4.0.9 | 运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/d3-shape | 3.1.8 | 运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/d3-time | 3.0.4 | 运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/d3-timer | 3.0.2 | 运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/esrecurse | 4.3.1 | 开发 / Development | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/estree | 1.0.8 | 开发 / Development | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/jsdom | 30.0.0 | 开发 / Development | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/jsdom/@types/node | 26.1.2 | 开发 / Development | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/jsdom/@types/node/undici-types | 8.3.0 | 开发 / Development | MIT | LICENSE: a6db8096b2707bc0102d256917d4d33f298ba36d8c3f25de067a2b5bb379db27 | bun-cache | 待核验 / Unverified |
| @types/json-schema | 7.0.15 | 开发 / Development | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/node | 26.6.6 | 开发 / Development | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/node/undici-types | 8.9.0 | 开发 / Development | MIT | LICENSE: a6db8096b2707bc0102d256917d4d33f298ba36d8c3f25de067a2b5bb379db27 | bun-cache | 待核验 / Unverified |
| @types/react | 19.3.0 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/react-dom | 19.3.0 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/tough-cookie | 4.0.5 | 开发 / Development | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @types/use-sync-external-store | 0.0.6 | 运行 / Runtime | MIT | LICENSE: c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/eslint-plugin | 8.72.1 | 开发 / Development | MIT | LICENSE: 2eb5c7a0bba9deb77a98c81bf6b9d3fb1c67118eebf968b6b1a787b3f8928ee0 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/eslint-plugin/ignore | 7.0.5 | 开发 / Development | MIT | LICENSE-MIT: 9c94db23dc4b1e9aaee5d195668b916afc71efed54af226b66cf0ccc4389c1c0 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/parser | 8.72.1 | 开发 / Development | MIT | LICENSE: 2eb5c7a0bba9deb77a98c81bf6b9d3fb1c67118eebf968b6b1a787b3f8928ee0 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/project-service | 8.72.1 | 开发 / Development | MIT | LICENSE: 053a75a14b7508a897466b65e12797201a06b0e9b5066d1223da72cac99601b5 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/scope-manager | 8.72.1 | 开发 / Development | MIT | LICENSE: 2eb5c7a0bba9deb77a98c81bf6b9d3fb1c67118eebf968b6b1a787b3f8928ee0 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/tsconfig-utils | 8.72.1 | 开发 / Development | MIT | LICENSE: 053a75a14b7508a897466b65e12797201a06b0e9b5066d1223da72cac99601b5 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/type-utils | 8.72.1 | 开发 / Development | MIT | LICENSE: f3c51ace7f159b21566d72535e84ff354505ae7ffdca835dac81fcdafbf9e879 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/types | 8.72.1 | 开发 / Development | MIT | LICENSE: 2eb5c7a0bba9deb77a98c81bf6b9d3fb1c67118eebf968b6b1a787b3f8928ee0 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/typescript-estree | 8.72.1 | 开发 / Development | MIT | LICENSE: 2eb5c7a0bba9deb77a98c81bf6b9d3fb1c67118eebf968b6b1a787b3f8928ee0 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/typescript-estree/minimatch | 10.2.5 | 开发 / Development | BlueOak-1.0.0 | LICENSE.md: 2c7c5d22ed5a8ee968c64757710979afcd77438c48b4a265b94e615babd8a901 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/typescript-estree/semver | 7.7.4 | 开发 / Development | ISC | LICENSE: 4ec3d4c66cd87f5c8d8ad911b10f99bf27cb00cdfcff82621956e379186b016b | bun-cache | 待核验 / Unverified |
| @typescript-eslint/utils | 8.72.1 | 开发 / Development | MIT | LICENSE: 2eb5c7a0bba9deb77a98c81bf6b9d3fb1c67118eebf968b6b1a787b3f8928ee0 | bun-cache | 待核验 / Unverified |
| @typescript-eslint/visitor-keys | 8.72.1 | 开发 / Development | MIT | LICENSE: 2eb5c7a0bba9deb77a98c81bf6b9d3fb1c67118eebf968b6b1a787b3f8928ee0 | bun-cache | 待核验 / Unverified |
| @typescript/typescript-aix-ppc64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-darwin-arm64 | 7.0.2 | 开发 / Development | Apache-2.0 | LICENSE: a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47<br>NOTICE.txt: f5c708b59114507b8b27b48181b6883d106bbca0c1634bbee45b5e344237b66b | bun-cache | 待核验 / Unverified |
| @typescript/typescript-darwin-x64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-freebsd-arm64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-freebsd-x64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-linux-arm | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-linux-arm64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-linux-loong64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-linux-mips64el | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-linux-ppc64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-linux-riscv64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-linux-s390x | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-linux-x64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-netbsd-arm64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-netbsd-x64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-openbsd-arm64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-openbsd-x64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-sunos-x64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-win32-arm64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @typescript/typescript-win32-x64 | 7.0.2 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| @vitejs/plugin-react | 6.2.1 | 开发 / Development | MIT | LICENSE: 29b68325fe026047d13e187b44c33b2acacf7dc647dec4583702e59f235e13b5 | bun-cache | 待核验 / Unverified |
| acorn | 8.17.0 | 开发 / Development | MIT | LICENSE: 76a876cf886ff9be2a8b5e2e86514fed06223c8c9f0c1e9ee9606e93841e00b7 | bun-cache | 待核验 / Unverified |
| acorn-jsx | 5.3.2 | 开发 / Development | MIT | LICENSE: cfa72b62b9ae173078823a3796b25c027a9071046a263beddf966df67018ce06 | bun-cache | 待核验 / Unverified |
| agent-base | 6.0.2 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| ajv | 6.15.0 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: e85e131fa4ed25538ff1f4962ced1fb6f68b079bd9164a790597a0f30b8fd030 | bun-cache | 待核验 / Unverified |
| ansi-regex | 5.0.1 | 开发 / Development | MIT | license: 48da2f39e100d4085767e94966b43f4fa95ff6a0698fba57ed460914e35f94a0 | bun-cache | 待核验 / Unverified |
| ansi-styles | 5.2.0 | 开发 / Development | MIT | license: 48da2f39e100d4085767e94966b43f4fa95ff6a0698fba57ed460914e35f94a0 | bun-cache | 待核验 / Unverified |
| aria-hidden | 1.2.6 | 运行 / Runtime | MIT | LICENSE: 30f0cfddf483d1128e3610205020f2041a6c5e837aa999e0aa82e5576187d4a9 | bun-cache | 待核验 / Unverified |
| aria-query | 5.3.0 | 开发 / Development | Apache-2.0 | LICENSE: c8df456c7ccba74b959087dff494d4ac2a12dfb0400c08b46b2494a08a000567 | bun-cache | 待核验 / Unverified |
| asynckit | 0.4.0 | 运行 / Runtime | MIT | LICENSE: 1953150d5d4b10c7542cee6f6e0c613b2682545233f069d75cfff1936386ce10 | bun-cache | 待核验 / Unverified |
| axios | 1.21.1 | 运行 / Runtime | MIT | LICENSE: 82761059eaedacb3356803aea8a170d8298609f91b14fc32ee1bfb40d690183c | bun-cache | 待核验 / Unverified |
| balanced-match | 4.0.4 | 开发 / Development | MIT | LICENSE.md: d408f38ffa3355c5faec517153295338892eb0f1ea43f57874bb23c6075979b5 | bun-cache | 待核验 / Unverified |
| baseline-browser-mapping | 2.11.35 | 开发 / Development | Apache-2.0 | LICENSE.txt: c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | bun-cache | 待核验 / Unverified |
| bcp-47 | 2.1.2 | 开发 / Development | MIT | license: dd1081884a92952802f4803110a6bb543acea9a814c786d58605b4c1219b5ebb | bun-cache | 待核验 / Unverified |
| bcp-47-match | 2.0.3 | 开发 / Development | MIT | license: 3deefaee9d13b2f578671d459a89f2fc3dbe3a12cddf88984517a858e4ee6f76 | bun-cache | 待核验 / Unverified |
| brace-expansion | 5.0.12 | 开发 / Development | MIT | LICENSE: 9c63a23124d68cd30cd316a94a1a0bca34f032786df6df69fc4b5f136bac8d2e | bun-cache | 待核验 / Unverified |
| browserslist | 4.28.7 | 开发 / Development | MIT | LICENSE: 21c2679a63d7699c0e644409e2f17d0adbc7a965003feb06b3ff4b833d21f722 | bun-cache | 待核验 / Unverified |
| cacheable | 2.5.0 | 开发 / Development | MIT | LICENSE: 465e8da349d50d8512e4a0e9b26d2bee50392c394f17edaa3be6e0df7c2b27ad | bun-cache | 待核验 / Unverified |
| call-bind-apply-helpers | 1.0.2 | 运行 / Runtime | MIT | LICENSE: 5e325595b4ea8cfec3802f545b1def5d7b73e4a5b8e9ba63e32a320f67732292 | bun-cache | 待核验 / Unverified |
| caniuse-lite | 1.0.30001823 | 开发 / Development | CC-BY-4.0 | LICENSE: fd3a263fe19ed8faa9068b43abaebafc02c77897b0c6fc09abc04bb592e5f16e | bun-cache | 待核验 / Unverified |
| class-variance-authority | 0.7.1 | 运行 / Runtime | Apache-2.0 | LICENSE: 0ccbf956cffc8dcf515809433cb5242ee67c94513d46e48c261d68d0880de406 | bun-cache | 待核验 / Unverified |
| clsx | 2.1.1 | 运行 / Runtime | MIT | license: 9a9edad7baae52622bddf3c15b2ef8a33d2c89f2d25408ad13e8a7481c6b0c97 | bun-cache | 待核验 / Unverified |
| combined-stream | 1.0.8 | 运行 / Runtime | MIT | License: 47eb8ca82c798246774946d1be0f9aa08f025fa8325ced0947aeeb4c05fe5547 | bun-cache | 待核验 / Unverified |
| convert-source-map | 2.0.0 | 开发 / Development | MIT | LICENSE: 1fa6ee8bb95a81ae3d73a5bd074a3ac380ffec13697051063ca1a601921b91db | bun-cache | 待核验 / Unverified |
| cookie | 1.1.1 | 运行 / Runtime | MIT | LICENSE: c02110eedc16c7114f1a9bdc026c65626ce1d9c7e27fd51a8e0feee8a48a6858 | bun-cache | 待核验 / Unverified |
| cross-spawn | 7.0.6 | 开发 / Development | MIT | LICENSE: aaa78451b6fecd1b9c4594c796c133c0e90cad100372ff8bc6de615e9ef9adf1 | bun-cache | 待核验 / Unverified |
| csstype | 3.2.3 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: 11d55bd4541c75ee7879547ac49089c489163dae49551389713c3d026cab383e | bun-cache | 待核验 / Unverified |
| d3-array | 3.2.4 | 运行 / Runtime | ISC | LICENSE: 3e6849627f74ff73c257a3ae1efb574015d94fc1035c05ec3c15805165efcbc4 | bun-cache | 待核验 / Unverified |
| d3-color | 3.1.0 | 运行 / Runtime | ISC | LICENSE: faa682e3e430941f958d26180458f5934a62f58dac4d70ccdd15608c15d0f884 | bun-cache | 待核验 / Unverified |
| d3-ease | 3.0.1 | 运行 / Runtime | BSD-3-Clause | LICENSE: b989d9085148d21ff64a75e14462aefa06b2589a55553b07b1460c70081c7d08 | bun-cache | 待核验 / Unverified |
| d3-format | 3.1.2 | 运行 / Runtime | ISC | LICENSE: 2a6d2d5f32ba0b755ddbc1c833f766e30cdbe6ebe9a6d4e3e24427721f0b63d3 | bun-cache | 待核验 / Unverified |
| d3-interpolate | 3.0.1 | 运行 / Runtime | ISC | LICENSE: e008c5e25a6be382593089c29bfabbc553c6378eee02895aec46ce396cc404ee | bun-cache | 待核验 / Unverified |
| d3-path | 3.1.0 | 运行 / Runtime | ISC | LICENSE: a09b0d6d76e768fca2085fad05743ee81ddd11946bcda160a3cf5e1081a479aa | bun-cache | 待核验 / Unverified |
| d3-scale | 4.0.2 | 运行 / Runtime | ISC | LICENSE: e008c5e25a6be382593089c29bfabbc553c6378eee02895aec46ce396cc404ee | bun-cache | 待核验 / Unverified |
| d3-shape | 3.2.0 | 运行 / Runtime | ISC | LICENSE: faa682e3e430941f958d26180458f5934a62f58dac4d70ccdd15608c15d0f884 | bun-cache | 待核验 / Unverified |
| d3-time | 3.1.0 | 运行 / Runtime | ISC | LICENSE: faa682e3e430941f958d26180458f5934a62f58dac4d70ccdd15608c15d0f884 | bun-cache | 待核验 / Unverified |
| d3-time-format | 4.1.0 | 运行 / Runtime | ISC | LICENSE: e008c5e25a6be382593089c29bfabbc553c6378eee02895aec46ce396cc404ee | bun-cache | 待核验 / Unverified |
| d3-timer | 3.0.1 | 运行 / Runtime | ISC | LICENSE: e008c5e25a6be382593089c29bfabbc553c6378eee02895aec46ce396cc404ee | bun-cache | 待核验 / Unverified |
| data-urls | 8.0.0 | 开发 / Development | MIT | LICENSE.txt: 528eec83cb836a0adda9f8fc3d6a2a70a710d6cc0be9a155f92212c8df28acfa | bun-cache | 待核验 / Unverified |
| debug | 4.4.3 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: 3a61c6c96caf5c1d9b623fb9b04c822b783dfcb78aa7e49c76a3f643e6ed7f95 | bun-cache | 待核验 / Unverified |
| decimal.js | 10.6.0 | 开发 / Development | MIT | LICENCE.md: 3108b546bcff5d346923a82f48b2d252ca722f9088076db6d145f6b67757ad6c | bun-cache | 待核验 / Unverified |
| decimal.js-light | 2.5.1 | 运行 / Runtime | MIT | LICENCE.md: fc0397fbd5c128bec7edef4e8d3f45e15db5fd043cdd0a2edfc4f14d47fbc3e4 | bun-cache | 待核验 / Unverified |
| deep-is | 0.1.4 | 开发 / Development | MIT | LICENSE: f2042f3634c4136d06b5139c9c6aefb81a3a462b514548bc1845953233dfba98 | bun-cache | 待核验 / Unverified |
| delayed-stream | 1.0.0 | 运行 / Runtime | MIT | License: 47eb8ca82c798246774946d1be0f9aa08f025fa8325ced0947aeeb4c05fe5547 | bun-cache | 待核验 / Unverified |
| dequal | 2.0.3 | 开发 / Development | MIT | license: 306fa513e39b23a6e8747520de761809d206b99800ef41907b530226574c59ae | bun-cache | 待核验 / Unverified |
| detect-libc | 2.1.2 | 开发 / Development | Apache-2.0 | LICENSE: b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1 | bun-cache | 待核验 / Unverified |
| detect-node-es | 1.1.0 | 运行 / Runtime | MIT | LICENSE: 54b32293ea560d22cd9b62af9b2cda1a030d910a48c6601d227c5ff2338d95f8 | bun-cache | 待核验 / Unverified |
| dom-accessibility-api | 0.5.16 | 开发 / Development | MIT | LICENSE.md: 0ffe67fe630169de46df2d29dc18f5857b4c98f0f95b0cd9e3c21fef51f9a9b8 | bun-cache | 待核验 / Unverified |
| dunder-proto | 1.0.1 | 运行 / Runtime | MIT | LICENSE: 2b770a704c15de238c3f622b01b0044ddd60b49ee30608ea6991ebf19db7a7a1 | bun-cache | 待核验 / Unverified |
| electron-to-chromium | 1.5.478 | 开发 / Development | ISC | LICENSE: 25ba5c59dad3e0dd8f9540beaa0f0a86a10e3aec35af5fdc8e88c5f6a5c0d8c6 | bun-cache | 待核验 / Unverified |
| enhanced-resolve | 5.26.0 | 开发 / Development | MIT | LICENSE: 9068a8782d2fb4c6e432cfa25334efa56f722822180570802bf86e71b6003b1e | bun-cache | 待核验 / Unverified |
| entities | 8.0.0 | 开发 / Development | BSD-2-Clause | LICENSE: cb992345949ccd6e8394b2cd6c465f7b897c864f845937dbf64e8997f389e164 | bun-cache | 待核验 / Unverified |
| es-define-property | 1.0.1 | 运行 / Runtime | MIT | LICENSE: 5e325595b4ea8cfec3802f545b1def5d7b73e4a5b8e9ba63e32a320f67732292 | bun-cache | 待核验 / Unverified |
| es-errors | 1.3.0 | 运行 / Runtime | MIT | LICENSE: 5e325595b4ea8cfec3802f545b1def5d7b73e4a5b8e9ba63e32a320f67732292 | bun-cache | 待核验 / Unverified |
| es-object-atoms | 1.1.1 | 运行 / Runtime | MIT | LICENSE: 5e325595b4ea8cfec3802f545b1def5d7b73e4a5b8e9ba63e32a320f67732292 | bun-cache | 待核验 / Unverified |
| es-set-tostringtag | 2.1.0 | 运行 / Runtime | MIT | LICENSE: 1a3aeb1f1398bd697d57c3c585faadf59d825aca6e3162cd7eeb72ff76eb2466 | bun-cache | 待核验 / Unverified |
| es-set-tostringtag/hasown | 2.0.2 | 运行 / Runtime | MIT | LICENSE: bf9b0d665be2a689851eea667ca9f42066ea1d903b38349c51e6a44b2577680a | bun-cache | 待核验 / Unverified |
| es-toolkit | 1.44.0 | 运行 / Runtime | MIT | LICENSE: ed68888a2a28f32a05e88f24d4d4ee75075a1bda2b6372a1f2e00fa0576a5524 | bun-cache | 待核验 / Unverified |
| escalade | 3.2.0 | 开发 / Development | MIT | license: 9a9edad7baae52622bddf3c15b2ef8a33d2c89f2d25408ad13e8a7481c6b0c97 | bun-cache | 待核验 / Unverified |
| escape-string-regexp | 4.0.0 | 开发 / Development | MIT | license: 5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3 | bun-cache | 待核验 / Unverified |
| eslint | 10.14.0 | 开发 / Development | MIT | LICENSE: 3b6be04f862a077a4b97929dbf247299360824d9365f8603c263769303ace18c | bun-cache | 待核验 / Unverified |
| eslint-plugin-react-hooks | 7.0.1 | 开发 / Development | MIT | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | bun-cache | 待核验 / Unverified |
| eslint-plugin-react-refresh | 0.5.7 | 开发 / Development | MIT | LICENSE: fba570176c68f716676e04cad6c39fb56b763e44fc11be22fe6863ff19092a9b | bun-cache | 待核验 / Unverified |
| eslint-scope | 9.1.2 | 开发 / Development | BSD-2-Clause | LICENSE: d3a724e2ed749f172ff70b62a1d0631b7d4b0ea273782365a3464d4e2d6b6dbd | bun-cache | 待核验 / Unverified |
| eslint-visitor-keys | 5.0.1 | 开发 / Development | Apache-2.0 | LICENSE: d8bf34ff6d190640a01e7704ad78253fc181bc128949d71273fbbaa12f33c0b4 | bun-cache | 待核验 / Unverified |
| espree | 11.2.0 | 开发 / Development | BSD-2-Clause | LICENSE: 26c95937762a3dc17a3934a0a2773c70259ba4bf28dab713c225e4af8eb9d349 | bun-cache | 待核验 / Unverified |
| esquery | 1.7.0 | 开发 / Development | BSD-3-Clause | license.txt: ac68116ae73740de4190892f334992e449a124600924ec761e64319d3aac9e6e | bun-cache | 待核验 / Unverified |
| esrecurse | 4.3.0 | 开发 / Development | BSD-2-Clause | MISSING | bun-cache | 待核验 / Unverified |
| estraverse | 5.3.0 | 开发 / Development | BSD-2-Clause | LICENSE.BSD: 0e74697a68cebdcd61502c30fe80ab7f9e341d995dcd452023654d57133534b1 | bun-cache | 待核验 / Unverified |
| esutils | 2.0.3 | 开发 / Development | BSD-2-Clause | LICENSE.BSD: 0e74697a68cebdcd61502c30fe80ab7f9e341d995dcd452023654d57133534b1 | bun-cache | 待核验 / Unverified |
| eventemitter3 | 5.0.4 | 运行 / Runtime | MIT | LICENSE: 3aecc12b1cb28832b5f65ab64291de96568c3f236a74d646281b4491f7bcadbf | bun-cache | 待核验 / Unverified |
| fast-deep-equal | 3.1.3 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: 7bf9b2de73a6b356761c948d0e9eeb4be6c1270bd04c79cd489c1e400ffdfc1a | bun-cache | 待核验 / Unverified |
| fast-json-stable-stringify | 2.1.0 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: a833d366242c298cf1b10263516572fb8dcbe68eb5072cdcac2b4546e2b4eb36 | bun-cache | 待核验 / Unverified |
| fast-levenshtein | 2.0.6 | 开发 / Development | MIT | LICENSE.md: 942a98cb8846a6354266193f173c1354615827fbb7d67f68399599dff12c4d6a | bun-cache | 待核验 / Unverified |
| fd-package-json | 2.0.0 | 开发 / Development | MIT | LICENSE: 53bd26dbb54d8c2c9ff627de563d4fb768ca1df79090216c8ae152c233e3b3ee | bun-cache | 待核验 / Unverified |
| fdir | 6.5.0 | 开发 / Development | MIT | LICENSE: 9a39f2aadab11a3697edd668ff2d8ad885b649737b7ab4d3bf12b34e5ada0c86 | bun-cache | 待核验 / Unverified |
| file-entry-cache | 11.1.5 | 开发 / Development | MIT | LICENSE: 465e8da349d50d8512e4a0e9b26d2bee50392c394f17edaa3be6e0df7c2b27ad | bun-cache | 待核验 / Unverified |
| find-up | 5.0.0 | 开发 / Development | MIT | license: 5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3 | bun-cache | 待核验 / Unverified |
| flat-cache | 6.1.23 | 开发 / Development | MIT | LICENSE: 465e8da349d50d8512e4a0e9b26d2bee50392c394f17edaa3be6e0df7c2b27ad | bun-cache | 待核验 / Unverified |
| flatted | 3.4.2 | 开发 / Development | ISC | LICENSE: 148718606d34f467fd08a2176bb4c1ab275f999576f779368503d8d3e3642861 | bun-cache | 待核验 / Unverified |
| follow-redirects | 1.16.2 | 运行 / Runtime | MIT | LICENSE: bfa8a54bb952ccda79f0f1889721d108f5b605babbb2b8a3705ffb52f4132eb7 | bun-cache | 待核验 / Unverified |
| form-data | 4.0.6 | 运行 / Runtime | MIT | License: e5b780d4f38d1d3328e3e53186c4e62d3fa149ea6f2bacd5de5ad0c30ac85343 | bun-cache | 待核验 / Unverified |
| formatly | 0.11.4 | 开发 / Development | MIT | LICENSE.md: 76c9d5f5ea942054715c026f33f8717c9e24603196a3737b8899afa216bcbdab | bun-cache | 待核验 / Unverified |
| fsevents | 2.3.3 | 开发 / Development | MIT | LICENSE: 2a8a5d6197bb97a018b8a190dd3ed853d750ca87c8e80c17aad41d6c6ff448e1 | bun-cache | 待核验 / Unverified |
| function-bind | 1.1.2 | 运行 / Runtime | MIT | LICENSE: 773e131a7684726005a7e4688a80b4620033bc08499bc1404dd1a1eb3bca725e | bun-cache | 待核验 / Unverified |
| gensync | 1.0.0-beta.2 | 开发 / Development | MIT | LICENSE: e3a956681ee067f971ac413994171b3d90ca801ec6324e76c9c55366cfe31cb0 | bun-cache | 待核验 / Unverified |
| get-intrinsic | 1.3.0 | 运行 / Runtime | MIT | LICENSE: 39c5ec504cf6bd5cd782a7c695828e09189df79f5d94840e4f08feb97b9fd416 | bun-cache | 待核验 / Unverified |
| get-intrinsic/hasown | 2.0.2 | 运行 / Runtime | MIT | LICENSE: bf9b0d665be2a689851eea667ca9f42066ea1d903b38349c51e6a44b2577680a | bun-cache | 待核验 / Unverified |
| get-nonce | 1.0.1 | 运行 / Runtime | MIT | LICENSE: acf3b087b348d2f2e731b9d4131af185aad694c1204ce14a46909483fd42da05 | bun-cache | 待核验 / Unverified |
| get-proto | 1.0.1 | 运行 / Runtime | MIT | LICENSE: be46ce1e3b0479af9ce82d22b465a6d7d2ff084fca0aaf3d54172da2b5eb5781 | bun-cache | 待核验 / Unverified |
| get-tsconfig | 4.14.3 | 开发 / Development | MIT | LICENSE: 10c904a49af44409b073532e45a53fd4df19bdf26eaf9afc7917258c2b354382 | bun-cache | 待核验 / Unverified |
| glob-parent | 6.0.2 | 开发 / Development | ISC | LICENSE: fc68eb8f1c8e1d6b8be50f3c177927e24791cae7dc251e6253a012f37926a30c | bun-cache | 待核验 / Unverified |
| globals | 17.14.0 | 开发 / Development | MIT | license: 5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3 | bun-cache | 待核验 / Unverified |
| gopd | 1.2.0 | 运行 / Runtime | MIT | LICENSE: d90bf0a089da4cf43d644ed240a0b3825dcdb705e64e38371d56995a4cc9e4c5 | bun-cache | 待核验 / Unverified |
| graceful-fs | 4.2.11 | 开发 / Development | ISC | LICENSE: f65c5d9f22a317b2a10803bd1868461ce6499c2ed7217bc80c0cc772a748789c | bun-cache | 待核验 / Unverified |
| has-symbols | 1.1.0 | 运行 / Runtime | MIT | LICENSE: 206c1adcf206dc0031b11232f5b054ec5f1662407ab1ca415247921cab2068ab | bun-cache | 待核验 / Unverified |
| has-tostringtag | 1.0.2 | 运行 / Runtime | MIT | LICENSE: e2560e002e13281578c75c850061d9255c33d16d732939e8c2db64c2506642fa | bun-cache | 待核验 / Unverified |
| hashery | 1.5.1 | 开发 / Development | MIT | LICENSE: 2eef776efe4bae7fcd2d8162ecadf2b0873aae20afac343a936ddb0de3d79253 | bun-cache | 待核验 / Unverified |
| hasown | 2.0.4 | 运行 / Runtime | MIT | LICENSE: bf9b0d665be2a689851eea667ca9f42066ea1d903b38349c51e6a44b2577680a | bun-cache | 待核验 / Unverified |
| hermes-estree | 0.25.1 | 开发 / Development | MIT | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | bun-cache | 待核验 / Unverified |
| hermes-parser | 0.25.1 | 开发 / Development | MIT | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | bun-cache | 待核验 / Unverified |
| hookified | 1.15.1 | 开发 / Development | MIT | LICENSE: 3902e57e73412bd91ba81a47fa2cef45e1729c152c835114c1692cc5e685ddbe | bun-cache | 待核验 / Unverified |
| html-encoding-sniffer | 7.0.0 | 开发 / Development | MIT | LICENSE.txt: 528eec83cb836a0adda9f8fc3d6a2a70a710d6cc0be9a155f92212c8df28acfa | bun-cache | 待核验 / Unverified |
| https-proxy-agent | 5.0.1 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| ignore | 5.3.2 | 开发 / Development | MIT | LICENSE-MIT: 9c94db23dc4b1e9aaee5d195668b916afc71efed54af226b66cf0ccc4389c1c0 | bun-cache | 待核验 / Unverified |
| immer | 11.1.21 | 运行 / Runtime | MIT | LICENSE: 99cf22f6960a6fe228ec84ea9aefb0d75b27999ece83a3a9801e1c2081fa270b | bun-cache | 待核验 / Unverified |
| imurmurhash | 0.1.4 | 开发 / Development | MIT | MISSING | bun-cache | 待核验 / Unverified |
| internmap | 2.0.3 | 运行 / Runtime | ISC | LICENSE: 9ea8903938dab5f12c4572d60725069bec2d1b0dc3bcc210b09bae946a5ebb1f | bun-cache | 待核验 / Unverified |
| is-alphabetical | 2.0.1 | 开发 / Development | MIT | license: ca4662cb5d1b738fbe5350c0d5485ba11773b4b7208974082ae6e129a52d631d | bun-cache | 待核验 / Unverified |
| is-alphanumerical | 2.0.1 | 开发 / Development | MIT | license: ca4662cb5d1b738fbe5350c0d5485ba11773b4b7208974082ae6e129a52d631d | bun-cache | 待核验 / Unverified |
| is-decimal | 2.0.1 | 开发 / Development | MIT | license: ca4662cb5d1b738fbe5350c0d5485ba11773b4b7208974082ae6e129a52d631d | bun-cache | 待核验 / Unverified |
| is-extglob | 2.1.1 | 开发 / Development | MIT | LICENSE: 73b5283588baa142c5baaef5f56d3e8fdea7a30b214e8c5737e87640f882453a | bun-cache | 待核验 / Unverified |
| is-glob | 4.0.3 | 开发 / Development | MIT | LICENSE: 4cd903859549d4b20b571041f96dfae1136ed079c476126268f9d7cc1b611150 | bun-cache | 待核验 / Unverified |
| is-potential-custom-element-name | 1.0.1 | 开发 / Development | MIT | LICENSE-MIT.txt: 483acb265f182907d1caf6cff9c16c96f31325ed23792832cc5d8b12d5f88c8a | bun-cache | 待核验 / Unverified |
| isexe | 2.0.0 | 开发 / Development | ISC | LICENSE: 4ec3d4c66cd87f5c8d8ad911b10f99bf27cb00cdfcff82621956e379186b016b | bun-cache | 待核验 / Unverified |
| jiti | 2.7.0 | 开发 / Development | MIT | LICENSE: 46231df5a7733c3f52f11b71f3df61813007745b62b09031acfb45fb42d75082 | bun-cache | 待核验 / Unverified |
| js-md5 | 0.9.2 | 运行 / Runtime | MIT | LICENSE.txt: 05a87c8bf74e38881eacfd90412bcdf06c1bd0ec6f3317fb6ea3b572ab061749 | bun-cache | 待核验 / Unverified |
| js-tokens | 4.0.0 | 开发 / Development | MIT | LICENSE: 2213d91c606205c71eb051a199478cdc2adde945893404d7f1421436dd6d5cc1 | bun-cache | 待核验 / Unverified |
| jsdom | 31.0.1 | 开发 / Development | MIT | LICENSE.txt: 8fbe420fb1fa891873359074f630997002afce10d9ac59028b8b4ed9976d52d7 | bun-cache | 待核验 / Unverified |
| jsdom/parse5 | 8.1.1 | 开发 / Development | MIT | LICENSE: 8c535800331e1e4439835555b3f9edc7fe9dee2fab0d8bbbd5a982e8b8343d4d | bun-cache | 待核验 / Unverified |
| jsdom/parse5/entities | 9.0.0 | 开发 / Development | BSD-2-Clause | LICENSE: cb992345949ccd6e8394b2cd6c465f7b897c864f845937dbf64e8997f389e164 | bun-cache | 待核验 / Unverified |
| jsesc | 3.1.0 | 开发 / Development | MIT | LICENSE-MIT.txt: 483acb265f182907d1caf6cff9c16c96f31325ed23792832cc5d8b12d5f88c8a | bun-cache | 待核验 / Unverified |
| json-schema-traverse | 0.4.1 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: 7bf9b2de73a6b356761c948d0e9eeb4be6c1270bd04c79cd489c1e400ffdfc1a | bun-cache | 待核验 / Unverified |
| json-stable-stringify-without-jsonify | 1.0.1 | 开发 / Development | MIT | LICENSE: 435a6722c786b0a56fbe7387028f1d9d3f3a2d0fb615bb8fee118727c3f59b7b | bun-cache | 待核验 / Unverified |
| json5 | 2.2.3 | 开发 / Development | MIT | LICENSE.md: 53e59feb13058722d977c699eb0407c7bce2f93c949b681bbd2ff31698535927 | bun-cache | 待核验 / Unverified |
| keyv | 5.6.0 | 开发 / Development | MIT | LICENSE: 1f7dca26d2d328c3dbb9b6fe3b15ec3cda08ffe2288e47b73d617454b256f959 | bun-cache | 待核验 / Unverified |
| knip | 6.44.1 | 开发 / Development | ISC | LICENSE: 2f654153561e7d8b90fdbf448a7de09725f936533fc9c7b485190c036d089341 | bun-cache | 待核验 / Unverified |
| knip/zod | 4.6.7 | 开发 / Development | MIT | LICENSE: 3f1189b28e3866e0d979968d466b78f813f76827cfdca1fbb124cc0a5c8841f8 | bun-cache | 待核验 / Unverified |
| levn | 0.4.1 | 开发 / Development | MIT | LICENSE: b9eb082c39fe245e38793699074c394c43a722c51fce031c3c165cb92a31035c | bun-cache | 待核验 / Unverified |
| lightningcss | 1.33.0 | 开发 / Development | MPL-2.0 | LICENSE: 5eba353fe5076ac3432177f8ab1cf75e3afcd0584251e37c3bfead5f447d040e | bun-cache | 待核验 / Unverified |
| lightningcss-android-arm64 | 1.33.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| lightningcss-darwin-arm64 | 1.33.0 | 开发 / Development | MPL-2.0 | LICENSE: 5eba353fe5076ac3432177f8ab1cf75e3afcd0584251e37c3bfead5f447d040e | bun-cache | 待核验 / Unverified |
| lightningcss-darwin-x64 | 1.33.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| lightningcss-freebsd-x64 | 1.33.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| lightningcss-linux-arm-gnueabihf | 1.33.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| lightningcss-linux-arm64-gnu | 1.33.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| lightningcss-linux-arm64-musl | 1.33.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| lightningcss-linux-x64-gnu | 1.33.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| lightningcss-linux-x64-musl | 1.33.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| lightningcss-win32-arm64-msvc | 1.33.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| lightningcss-win32-x64-msvc | 1.33.0 | 开发 / Development | UNKNOWN | MISSING | MISSING | 待核验 / Unverified |
| locate-path | 6.0.0 | 开发 / Development | MIT | license: 5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3 | bun-cache | 待核验 / Unverified |
| lru-cache | 11.5.3 | 开发 / Development | BlueOak-1.0.0 | LICENSE.md: 8a1af140fdfbf5afd3df27f7e662f989c5b963a300020dfafce42033cae9e004 | bun-cache | 待核验 / Unverified |
| lucide-react | 1.72.0 | 运行 / Runtime | ISC | LICENSE: b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57 | bun-cache | 待核验 / Unverified |
| lz-string | 1.5.0 | 开发 / Development | MIT | LICENSE: 433fc9dfe659dbfb1e91eed8351f13651e97bfa3ac6d03394c3d63f61d4bbc80 | bun-cache | 待核验 / Unverified |
| magic-string | 1.4.5 | 开发 / Development | MIT | LICENSE: 1cbe51b907662f6cb1492b16c359384a595180bf0e4d101603ed525e75c4e484 | bun-cache | 待核验 / Unverified |
| math-intrinsics | 1.1.0 | 运行 / Runtime | MIT | LICENSE: 2b770a704c15de238c3f622b01b0044ddd60b49ee30608ea6991ebf19db7a7a1 | bun-cache | 待核验 / Unverified |
| mime-db | 1.52.0 | 运行 / Runtime | MIT | LICENSE: cc1dfd4dafa27271e8212cd3b274eeb3f262e40a6fdab36ddc3f9696f706f58b | bun-cache | 待核验 / Unverified |
| mime-types | 2.1.35 | 运行 / Runtime | MIT | LICENSE: 71f83c4c0621102a56d9853812777b85751bce7e9726f686f5b056c1f8a4b0e6 | bun-cache | 待核验 / Unverified |
| minimatch | 10.2.6 | 开发 / Development | BlueOak-1.0.0 | LICENSE.md: 2c7c5d22ed5a8ee968c64757710979afcd77438c48b4a265b94e615babd8a901 | bun-cache | 待核验 / Unverified |
| ms | 2.1.3 | 开发 / Development<br>运行 / Runtime | MIT | license.md: 1662fae9b5314d11cf51284e2dcd1f006a354f7343f08712a730fcff9a359801 | bun-cache | 待核验 / Unverified |
| nanoid | 3.3.20 | 开发 / Development | MIT | LICENSE: da4db1480d9beea3483a2eda5c53b22238d0827d57da162b48f122e04d2d9987 | bun-cache | 待核验 / Unverified |
| natural-compare | 1.4.0 | 开发 / Development | MIT | MISSING | bun-cache | 待核验 / Unverified |
| node-releases | 2.0.63 | 开发 / Development | MIT | LICENSE: 3706296ed611888111ceccc1dff4712844dea4bde0b185c82d718c3b69895abe | bun-cache | 待核验 / Unverified |
| optionator | 0.9.4 | 开发 / Development | MIT | LICENSE: b9eb082c39fe245e38793699074c394c43a722c51fce031c3c165cb92a31035c | bun-cache | 待核验 / Unverified |
| oxc-parser | 0.155.0 | 开发 / Development | MIT | LICENSE: 95ced5ecf1133fbf41d409b5555c86c344f83f3b019926057ddbc07cfdcc27b3 | bun-cache | 待核验 / Unverified |
| oxc-resolver | 11.24.2 | 开发 / Development | MIT | LICENSE: 95ced5ecf1133fbf41d409b5555c86c344f83f3b019926057ddbc07cfdcc27b3 | bun-cache | 待核验 / Unverified |
| p-limit | 3.1.0 | 开发 / Development | MIT | license: 5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3 | bun-cache | 待核验 / Unverified |
| p-locate | 5.0.0 | 开发 / Development | MIT | license: 5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3 | bun-cache | 待核验 / Unverified |
| package-manager-detector | 1.9.0 | 开发 / Development | MIT | LICENSE: 05c365176db3cc00e951c44b921c809c75b8e99d2d724f7daf00381e26fb0850 | bun-cache | 待核验 / Unverified |
| parse5 | 8.0.1 | 开发 / Development | MIT | LICENSE: 8c535800331e1e4439835555b3f9edc7fe9dee2fab0d8bbbd5a982e8b8343d4d | bun-cache | 待核验 / Unverified |
| parse5-parser-stream | 8.1.1 | 开发 / Development | MIT | LICENSE: 8c535800331e1e4439835555b3f9edc7fe9dee2fab0d8bbbd5a982e8b8343d4d | bun-cache | 待核验 / Unverified |
| parse5-parser-stream/parse5 | 8.1.1 | 开发 / Development | MIT | LICENSE: 8c535800331e1e4439835555b3f9edc7fe9dee2fab0d8bbbd5a982e8b8343d4d | bun-cache | 待核验 / Unverified |
| parse5-parser-stream/parse5/entities | 9.0.0 | 开发 / Development | BSD-2-Clause | LICENSE: cb992345949ccd6e8394b2cd6c465f7b897c864f845937dbf64e8997f389e164 | bun-cache | 待核验 / Unverified |
| path-exists | 4.0.0 | 开发 / Development | MIT | license: 48da2f39e100d4085767e94966b43f4fa95ff6a0698fba57ed460914e35f94a0 | bun-cache | 待核验 / Unverified |
| path-key | 3.1.1 | 开发 / Development | MIT | license: 48da2f39e100d4085767e94966b43f4fa95ff6a0698fba57ed460914e35f94a0 | bun-cache | 待核验 / Unverified |
| picocolors | 1.1.1 | 开发 / Development | ISC | LICENSE: 6582629e2979466878f6014313dcc2f3756c9616148682227ce3063dde310750 | bun-cache | 待核验 / Unverified |
| picomatch | 4.0.7 | 开发 / Development | MIT | LICENSE: d0cd141b0c322fded5dfad1d4645bb2fedfc05b7321fe1009469638190d59ef9 | bun-cache | 待核验 / Unverified |
| playwright | 1.65.0 | 开发 / Development | Apache-2.0 | LICENSE: 45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb<br>NOTICE: 6d602191187b35b9b01d2cffa01c8469c2c8d9de8a96f1bf868e0f264f51c81d | bun-cache | 待核验 / Unverified |
| playwright-core | 1.65.0 | 开发 / Development | Apache-2.0 | LICENSE: 45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb<br>NOTICE: 6d602191187b35b9b01d2cffa01c8469c2c8d9de8a96f1bf868e0f264f51c81d | bun-cache | 待核验 / Unverified |
| postcss | 8.5.32 | 开发 / Development | MIT | LICENSE: 5be1f3465bba68a626777f984878814aaf35e7ef8e9fd314d469bcf887050fb8 | bun-cache | 待核验 / Unverified |
| prelude-ls | 1.2.1 | 开发 / Development | MIT | LICENSE: b9eb082c39fe245e38793699074c394c43a722c51fce031c3c165cb92a31035c | bun-cache | 待核验 / Unverified |
| pretty-format | 27.5.1 | 开发 / Development | MIT | LICENSE: 52412d7bc7ce4157ea628bbaacb8829e0a9cb3c58f57f99176126bc8cf2bfc85 | bun-cache | 待核验 / Unverified |
| pretty-format/react-is | 17.0.2 | 开发 / Development | MIT | LICENSE: 52412d7bc7ce4157ea628bbaacb8829e0a9cb3c58f57f99176126bc8cf2bfc85 | bun-cache | 待核验 / Unverified |
| proxy-from-env | 2.1.0 | 运行 / Runtime | MIT | LICENSE: f55828df4b8752c48e765a806465b76a103e3cb363379c569b15a1df2ba2d79e | bun-cache | 待核验 / Unverified |
| punycode | 2.3.1 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE-MIT.txt: 483acb265f182907d1caf6cff9c16c96f31325ed23792832cc5d8b12d5f88c8a | bun-cache | 待核验 / Unverified |
| qified | 0.10.1 | 开发 / Development | MIT | LICENSE: 3902e57e73412bd91ba81a47fa2cef45e1729c152c835114c1692cc5e685ddbe | bun-cache | 待核验 / Unverified |
| qified/hookified | 2.2.0 | 开发 / Development | MIT | LICENSE: 3902e57e73412bd91ba81a47fa2cef45e1729c152c835114c1692cc5e685ddbe | bun-cache | 待核验 / Unverified |
| qrcode.react | 4.2.0 | 运行 / Runtime | ISC | LICENSE: 908a4454d01d77cd6a0ae1eea0bafaa74a2e3befdbc4b7b714de2499a22351ce | ./vendor/qrcode.react-4.2.0.tgz; tar SHA-256 f621064b7325919a149bf0152c4128f47c6c30b3dc06d672006810fdaa4cc2bc | 已识别 / Identified |
| react | 19.3.1 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | bun-cache | 待核验 / Unverified |
| react-dom | 19.3.1 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | bun-cache | 待核验 / Unverified |
| react-hook-form | 7.92.0 | 运行 / Runtime | MIT | LICENSE: e8eeb472f0a5889c2c51625b86a3f9b8630680adb9f49a125352e2e426392780 | bun-cache | 待核验 / Unverified |
| react-is | 19.2.4 | 运行 / Runtime | MIT | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | bun-cache | 待核验 / Unverified |
| react-redux | 9.2.0 | 运行 / Runtime | MIT | LICENSE.md: 635da794c92d278f8355428be0f9922d643f556d4f75f33fe4aca6b98d27affe | bun-cache | 待核验 / Unverified |
| react-remove-scroll | 2.7.2 | 运行 / Runtime | MIT | LICENSE: 30f0cfddf483d1128e3610205020f2041a6c5e837aa999e0aa82e5576187d4a9 | bun-cache | 待核验 / Unverified |
| react-remove-scroll-bar | 2.3.8 | 运行 / Runtime | MIT | MISSING | bun-cache | 待核验 / Unverified |
| react-router | 7.18.5 | 运行 / Runtime | MIT | LICENSE.md: 77c9ee6a9c5d5782fb0c50b50d101189116314c14f7df0a1b0d385fc96a7ba49 | bun-cache | 待核验 / Unverified |
| react-router-dom | 7.18.5 | 运行 / Runtime | MIT | LICENSE.md: 77c9ee6a9c5d5782fb0c50b50d101189116314c14f7df0a1b0d385fc96a7ba49 | bun-cache | 待核验 / Unverified |
| react-style-singleton | 2.2.3 | 运行 / Runtime | MIT | LICENSE: 30f0cfddf483d1128e3610205020f2041a6c5e837aa999e0aa82e5576187d4a9 | bun-cache | 待核验 / Unverified |
| recharts | 3.10.1 | 运行 / Runtime | MIT | LICENSE: 2d3aa48a8d1d3b93093680e8e68d3a64cfb590c3ade377ffcaefc69dac7c2ce5 | bun-cache | 待核验 / Unverified |
| redux | 5.0.1 | 运行 / Runtime | MIT | LICENSE.md: f2da73c752c6b87624755edacf927cbd915fa76555d383e74494bad4a5155ab3 | bun-cache | 待核验 / Unverified |
| redux-thunk | 3.1.0 | 运行 / Runtime | MIT | LICENSE.md: 635da794c92d278f8355428be0f9922d643f556d4f75f33fe4aca6b98d27affe | bun-cache | 待核验 / Unverified |
| reselect | 5.2.0 | 运行 / Runtime | MIT | LICENSE: e98047a5dee068b33f82e8c4b7a63037b5108c93393198efd4097753004af5dd | bun-cache | 待核验 / Unverified |
| resolve-pkg-maps | 1.0.0 | 开发 / Development | MIT | LICENSE: 10c904a49af44409b073532e45a53fd4df19bdf26eaf9afc7917258c2b354382 | bun-cache | 待核验 / Unverified |
| rolldown | 1.2.19 | 开发 / Development | MIT | LICENSE: 23ecfff35a5a2e80d92142f75228912c3b1abc4b5a8337a821ff4397e2f9f734 | bun-cache | 待核验 / Unverified |
| rolldown/@oxc-project/types | 0.156.0 | 开发 / Development | MIT | LICENSE: 95ced5ecf1133fbf41d409b5555c86c344f83f3b019926057ddbc07cfdcc27b3 | bun-cache | 待核验 / Unverified |
| saxes | 6.0.0 | 开发 / Development | ISC | MISSING | bun-cache | 待核验 / Unverified |
| scheduler | 0.28.0 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | bun-cache | 待核验 / Unverified |
| semver | 6.3.1 | 开发 / Development | ISC | LICENSE: 4ec3d4c66cd87f5c8d8ad911b10f99bf27cb00cdfcff82621956e379186b016b | bun-cache | 待核验 / Unverified |
| set-cookie-parser | 2.7.2 | 运行 / Runtime | MIT | LICENSE: c5c6c5183a789d122f267c405f685037efb87e27fcde28ab1dd7378a2d2f5962 | bun-cache | 待核验 / Unverified |
| shebang-command | 2.0.0 | 开发 / Development | MIT | license: 69dee148a2cc470554dfa7142e830662062394d0fe67cddd379aba90dc60d6b3 | bun-cache | 待核验 / Unverified |
| shebang-regex | 3.0.0 | 开发 / Development | MIT | license: 48da2f39e100d4085767e94966b43f4fa95ff6a0698fba57ed460914e35f94a0 | bun-cache | 待核验 / Unverified |
| smol-toml | 1.9.1 | 开发 / Development | BSD-3-Clause | LICENSE: fa5659948374d4f555594f47f6da073b40dc503e921aeeece30df4362b3051a5 | bun-cache | 待核验 / Unverified |
| sonner | 2.0.8 | 运行 / Runtime | MIT | LICENSE.md: da9201378c36ffd81f51ad0b305f3f0981e90bc558789210ad65d1161eec3b7d | bun-cache | 待核验 / Unverified |
| source-map-js | 1.2.2 | 开发 / Development | BSD-3-Clause | LICENSE: 6cb0631f71c7749763fd3dd1d5bee52dd1070ec17f2edc1710079ad070bd2fbd | bun-cache | 待核验 / Unverified |
| strip-json-comments | 5.0.3 | 开发 / Development | MIT | license: 5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3 | bun-cache | 待核验 / Unverified |
| tailwind-merge | 3.7.0 | 运行 / Runtime | MIT | LICENSE.md: d4c70c7ce38cea8778f0aed3fc0bef0a9dbd27f13bd8b6773cbd6d37941971e5 | bun-cache | 待核验 / Unverified |
| tailwindcss | 4.3.5 | 开发 / Development | MIT | LICENSE: 60e0b68c0f35c078eef3a5d29419d0b03ff84ec1df9c3f9d6e39a519a5ae7985 | bun-cache | 待核验 / Unverified |
| tapable | 2.3.3 | 开发 / Development | MIT | LICENSE: 824ef6c33ae5ecbbab65d37f2b37da2bfc81d76cf7676ec0f59d00a0a38bdb75 | bun-cache | 待核验 / Unverified |
| tiny-invariant | 1.3.3 | 运行 / Runtime | MIT | LICENSE: b1c501095de70182748cb8e8d97ac5577701a4ef3b755ba30d59fd87b24bdb0f | bun-cache | 待核验 / Unverified |
| tinyglobby | 0.2.17 | 开发 / Development | MIT | LICENSE: 22c68811e174cbbfb3813d4135918df4f540959c14d872e601d9abe83d3cde8f | bun-cache | 待核验 / Unverified |
| tinyglobby/picomatch | 4.0.5 | 开发 / Development | MIT | LICENSE: d0cd141b0c322fded5dfad1d4645bb2fedfc05b7321fe1009469638190d59ef9 | bun-cache | 待核验 / Unverified |
| tldts | 7.0.23 | 开发 / Development | MIT | LICENSE: c64182d48160db948b6aa97a984f1a32974ce4d2053900361264cd33853796cb | bun-cache | 待核验 / Unverified |
| tldts-core | 7.0.23 | 开发 / Development | MIT | LICENSE: c64182d48160db948b6aa97a984f1a32974ce4d2053900361264cd33853796cb | bun-cache | 待核验 / Unverified |
| tough-cookie | 6.0.2 | 开发 / Development | BSD-3-Clause | LICENSE: 22ec6791c91ba42c0516a05f4cbdde019aae4687f8a38c5ca7e8a69ee68f851d | bun-cache | 待核验 / Unverified |
| tr46 | 7.0.0 | 开发 / Development | MIT | LICENSE.md: 499d6d466d064e0460427967a344e2a32fcb86ea8c6cd1a285ec4f1fa03fba67 | bun-cache | 待核验 / Unverified |
| ts-api-utils | 2.5.0 | 开发 / Development | MIT | LICENSE.md: 76c9d5f5ea942054715c026f33f8717c9e24603196a3737b8899afa216bcbdab | bun-cache | 待核验 / Unverified |
| tslib | 2.8.1 | 开发 / Development<br>运行 / Runtime | 0BSD | LICENSE.txt: 210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751 | bun-cache | 待核验 / Unverified |
| type-check | 0.4.0 | 开发 / Development | MIT | LICENSE: b9eb082c39fe245e38793699074c394c43a722c51fce031c3c165cb92a31035c | bun-cache | 待核验 / Unverified |
| typescript | 7.0.2 | 开发 / Development | Apache-2.0 | LICENSE: a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47<br>NOTICE.txt: f5c708b59114507b8b27b48181b6883d106bbca0c1634bbee45b5e344237b66b | bun-cache | 待核验 / Unverified |
| typescript-eslint | 8.72.1 | 开发 / Development | MIT | LICENSE: 2eb5c7a0bba9deb77a98c81bf6b9d3fb1c67118eebf968b6b1a787b3f8928ee0 | bun-cache | 待核验 / Unverified |
| typescript6 | 6.0.3 | 开发 / Development | Apache-2.0 | LICENSE.txt: a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47 | bun-cache | 待核验 / Unverified |
| unbash | 6.0.1 | 开发 / Development | ISC | LICENSE: a8715bd6ba5604134c8bfea951ebc2379ae9e71e78262275f7f87a50c845ae96 | bun-cache | 待核验 / Unverified |
| undici | 8.12.4 | 开发 / Development | MIT | LICENSE: a6db8096b2707bc0102d256917d4d33f298ba36d8c3f25de067a2b5bb379db27 | bun-cache | 待核验 / Unverified |
| undici-types | 8.10.0 | 开发 / Development | MIT | LICENSE: a6db8096b2707bc0102d256917d4d33f298ba36d8c3f25de067a2b5bb379db27 | bun-cache | 待核验 / Unverified |
| update-browserslist-db | 1.2.3 | 开发 / Development | MIT | LICENSE: c414dde36704bd9c8a76c7aa2921b19270ff9abeb478ea0050250d16cf29b0f6 | bun-cache | 待核验 / Unverified |
| uri-js | 4.4.1 | 开发 / Development<br>运行 / Runtime | BSD-2-Clause | LICENSE: 0af366eff4c01ec147c9c61ea9e8ffad64a4294754c9d79355f3fd1b97cb2fb9 | bun-cache | 待核验 / Unverified |
| use-callback-ref | 1.3.3 | 运行 / Runtime | MIT | LICENSE: 30f0cfddf483d1128e3610205020f2041a6c5e837aa999e0aa82e5576187d4a9 | bun-cache | 待核验 / Unverified |
| use-sidecar | 1.1.3 | 运行 / Runtime | MIT | LICENSE: 30f0cfddf483d1128e3610205020f2041a6c5e837aa999e0aa82e5576187d4a9 | bun-cache | 待核验 / Unverified |
| use-sync-external-store | 1.6.0 | 运行 / Runtime | MIT | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | bun-cache | 待核验 / Unverified |
| victory-vendor | 37.3.6 | 运行 / Runtime | MIT AND ISC | MISSING | bun-cache | 待核验 / Unverified |
| vite | 8.3.8 | 开发 / Development | MIT | LICENSE.md: a22152baa1aef74402443008e767e7c689a524c0909d19b0431d97f5ab066a13 | bun-cache | 待核验 / Unverified |
| w3c-xmlserializer | 6.0.0 | 开发 / Development | MIT | LICENSE.md: ab654de803cdaa9e2819ab2e934bdf7f757e308649ec231d78e80e92425cdc34 | bun-cache | 待核验 / Unverified |
| walk-up-path | 4.0.0 | 开发 / Development | ISC | LICENSE: 825dacf686e3d026be4a5b3e4efb8ddd67a8676f9e96085a53cfa045a5bd0509 | bun-cache | 待核验 / Unverified |
| webidl-conversions | 8.0.1 | 开发 / Development | BSD-2-Clause | LICENSE.md: a889cc4dbee2ae172c179856b25d75b0b7a5a136e1b97109b9b590b2ff1a879c | bun-cache | 待核验 / Unverified |
| whatwg-mimetype | 5.0.0 | 开发 / Development | MIT | LICENSE.txt: 528eec83cb836a0adda9f8fc3d6a2a70a710d6cc0be9a155f92212c8df28acfa | bun-cache | 待核验 / Unverified |
| whatwg-url | 17.3.0 | 开发 / Development | MIT | LICENSE.txt: db480f236292a093e77a83c35431a8496624e1e664a3547768a9ce2bdde39877 | bun-cache | 待核验 / Unverified |
| which | 2.0.2 | 开发 / Development | ISC | LICENSE: 4ec3d4c66cd87f5c8d8ad911b10f99bf27cb00cdfcff82621956e379186b016b | bun-cache | 待核验 / Unverified |
| word-wrap | 1.2.5 | 开发 / Development | MIT | LICENSE: 73b5283588baa142c5baaef5f56d3e8fdea7a30b214e8c5737e87640f882453a | bun-cache | 待核验 / Unverified |
| xml-name-validator | 5.0.0 | 开发 / Development | Apache-2.0 | LICENSE.txt: a6cba85bc92e0cff7a450b1d873c0eaa2e9fc96bf472df0247a26bec77bf3ff9 | bun-cache | 待核验 / Unverified |
| xmlchars | 2.2.0 | 开发 / Development | MIT | LICENSE: 45d196313c2647d313cc65ca9b093d2d6974b64d35ee7346f2c60c9d518dff2c | bun-cache | 待核验 / Unverified |
| yallist | 3.1.1 | 开发 / Development | ISC | LICENSE: 4ec3d4c66cd87f5c8d8ad911b10f99bf27cb00cdfcff82621956e379186b016b | bun-cache | 待核验 / Unverified |
| yaml | 2.9.1 | 开发 / Development | ISC | LICENSE: 5bba27375d93e9119f76c1015f7672cf9ad5f70952296e0842fb2243d6376869 | bun-cache | 待核验 / Unverified |
| yocto-queue | 0.1.0 | 开发 / Development | MIT | license: 5c932d88256b4ab958f64a856fa48e8bd1f55bc1d96b8149c65689e0c61789d3 | bun-cache | 待核验 / Unverified |
| zod | 4.3.6 | 开发 / Development<br>运行 / Runtime | MIT | LICENSE: 3f1189b28e3866e0d979968d466b78f813f76827cfdca1fbb124cc0a5c8841f8 | bun-cache | 待核验 / Unverified |
| zod-validation-error | 4.0.2 | 开发 / Development | MIT | LICENSE: 03cc9a630489a2544b799548a0e8b134f382fe09fa06dc22b339091b28b8f4a8 | bun-cache | 待核验 / Unverified |
| zustand | 5.1.0 | 运行 / Runtime | MIT | LICENSE: c1e6e266563517467b1bf874817d23e426f3149252bd7d42758cd697514b8417 | bun-cache | 待核验 / Unverified |
