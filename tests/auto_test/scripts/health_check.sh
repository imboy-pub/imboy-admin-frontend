#!/usr/bin/env bash
# imboyadmin auto_test 环境健康巡检（批次W2R3 固化）
#
# 用途：台账空转期（无待首测/待修复）的例行巡检，一次跑完：
#   1. 台账计划变化分布        2. 三态计数        3. bug 三列恒等式
#   4. 三套回归 spec（插件门禁编排 / 归档恢复闭环 / detail 契约修复点）
#
# 用法：
#   bash tests/auto_test/scripts/health_check.sh
#
# 前置：
#   - 后端 beam 在 127.0.0.1:9800（插件 spec 依赖 rpc 节点 imboy@127.0.0.1，cookie=imboy）
#   - vite dev 在 8082（不在时 playwright webServer 会自动拉起）
#   - chromium 可用（缺 headless shell 时设 PLAYWRIGHT_EXECUTABLE_PATH 指向完整 chromium）
#
# 已知特性：插件 spec 依赖后端全局 lifecycle 状态，若与其他会话/任务同时操作
# 插件页可能竞态失败——单独重跑一次即可判别（历史证据见 W2R3 巡检记录）。
set -uo pipefail
cd "$(dirname "$0")/../../.."

fail=0

echo "== 1. 台账计划变化分布 =="
LC_ALL=C grep -rh '^| ' tests/auto_test/*/*.md | grep -v '^| 计划变化' \
  | LC_ALL=C awk -F'|' '{gsub(/ /,"",$2);print $2}' | sort | uniq -c

echo
echo "== 2. 三态计数 =="
for s in 待复验 回归复测 阻塞; do
  n=$(LC_ALL=C grep -rh "^| $s" tests/auto_test/*/*.md | wc -l | tr -d ' ')
  printf '%s: %s\n' "$s" "$n"
done

echo
echo "== 3. bug 三列恒等式（待处理 = 发现 − 解决） =="
identity=$(LC_ALL=C grep -rh '^| ' tests/auto_test/*/*.md | grep -v '^| 计划变化' \
  | LC_ALL=C awk -F'|' '{gsub(/ /,"",$8);gsub(/ /,"",$9);gsub(/ /,"",$10);
      if($8~/^[0-9]+$/ && $8-$9!=$10) c++} END{print c+0}')
echo "违反行数: $identity"
[ "$identity" = "0" ] || fail=1

echo
echo "== 4. 回归 spec（3 套） =="
# chromium 回退：项目 playwright 锁定的 headless shell revision 可能不在本地缓存
# （历史：缓存只有 1228 而锁定 1217），此时回退完整 chromium 可执行文件。
# 缓存由其他会话/工具共用，版本会漂移，故每次运行时动态探测而非硬编码。
if [ -z "${PLAYWRIGHT_EXECUTABLE_PATH:-}" ]; then
  PW_CACHE="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
  PINNED_REV=$(LC_ALL=C grep -A2 '"name": "chromium-headless-shell"' \
    node_modules/playwright-core/browsers.json 2>/dev/null \
    | LC_ALL=C grep '"revision"' | head -1 | LC_ALL=C sed 's/[^0-9]//g')
  SHELL_BIN="$PW_CACHE/chromium_headless_shell-${PINNED_REV}/chrome-headless-shell-mac-arm64/chrome-headless-shell"
  if [ -n "$PINNED_REV" ] && [ ! -x "$SHELL_BIN" ]; then
    FULL_BIN=$(ls "$PW_CACHE"/chromium-*/chrome-mac-arm64/*.app/Contents/MacOS/* 2>/dev/null | LC_ALL=C sort -V | tail -1)
    if [ -n "$FULL_BIN" ] && [ -x "$FULL_BIN" ]; then
      export PLAYWRIGHT_EXECUTABLE_PATH="$FULL_BIN"
      echo "ℹ️ headless shell r${PINNED_REV} 缺失，回退完整 chromium：$FULL_BIN"
    else
      echo "⚠️ headless shell r${PINNED_REV} 缺失且缓存无完整 chromium，spec 可能启动失败"
      fail=1
    fi
  fi
fi
# 插件 spec 的写操作需要 lifecycle 门禁（默认关闭）；其 afterAll 测完会 gate-off，
# 因此每次进巡检前必须重新开启，收尾无论成败都恢复关闭（trap 兜底）。
PROBE="tests/auto_test/scripts/plugin_gate_probe.escript"
if escript "$PROBE" gate-on; then
  trap 'escript "$PROBE" gate-off >/dev/null 2>&1 || true' EXIT
else
  echo "⚠️ 无法开启插件门禁（后端 rpc 不可达？），插件 spec 大概率失败"
  fail=1
fi
run_regression_specs() {
  PLAYWRIGHT_HEADLESS="${PLAYWRIGHT_HEADLESS:-1}" \
  bunx playwright test \
    tests/e2e/auto_test/round_w2r2_plugin_fix_verify.spec.ts \
    tests/e2e/auto_test/round_w2r3_archive_regression.spec.ts \
    tests/e2e/auto_test/round_w2r3_detail_regression.spec.ts \
    --workers=1 --reporter=list
}
# 插件 spec 依赖后端全局 lifecycle + 管理端登录，与其他会话/任务并发操作时
# 存在环境性失败（历史证据：W2R3 巡检三跑三样，debug 复刻全绿）。
# 约定：整批失败自动重跑一次；再失败才判 FAIL。
if ! run_regression_specs; then
  echo
  echo "-- 首跑存在失败：自动重跑一次判别是否环境性抖动 --"
  echo
  if ! run_regression_specs; then
    fail=1
  fi
fi

echo
if [ "$fail" = "0" ]; then
  echo "HEALTH CHECK: PASS"
else
  echo "HEALTH CHECK: FAIL（恒等式违反或回归 spec 挂；插件 spec 竞态时单独重跑判别）"
fi
exit "$fail"
