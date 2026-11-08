#!/usr/bin/env bash
# 与 Backend Quality Gate 使用相同版本、官方摘要及有限重试。
# Match the backend gate's version, official checksum and bounded retries.
set -euo pipefail

destination=${1:?Usage: install_gitleaks.sh /path/to/gitleaks}
version=8.30.1
archive_sha256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
gitleaks_tmp=$(mktemp -d)
trap 'rm -rf "$gitleaks_tmp"' EXIT

# 下载或校验失败必须阻断安装；不执行未校验的二进制。
# Download/checksum failures stop installation before executing the binary.
curl -fsSL --retry 3 --retry-delay 2 --retry-max-time 180 \
  --connect-timeout 15 --max-time 60 \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz" \
  -o "$gitleaks_tmp/gitleaks.tar.gz"
printf '%s  %s\n' "$archive_sha256" "$gitleaks_tmp/gitleaks.tar.gz" | sha256sum -c -
tar --no-same-owner -xzf "$gitleaks_tmp/gitleaks.tar.gz" -C "$gitleaks_tmp" gitleaks
install -m 0755 "$gitleaks_tmp/gitleaks" "$destination"
"$destination" version
