#!/usr/bin/env bash
# 验证本地加载的真实镜像；不登录、不拉取候选镜像、不推送。
# Verify locally loaded images without registry login, candidate pulls or pushes.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo 'Usage: check_docker_images.sh ADMIN_LOCAL_IMAGE WIDGET_LOCAL_IMAGE' >&2
  exit 2
fi
admin_image=$1
widget_image=$2
frontend_sha=$(git rev-parse HEAD)
smoke_tmp=$(mktemp -d)
containers=()
cleanup() {
  status=$?
  for container in "${containers[@]}"; do
    if [[ $status -ne 0 ]]; then docker logs "$container" >&2 || true; fi
    docker rm -f "$container" >/dev/null || true
  done
  rm -rf "$smoke_tmp"
  exit "$status"
}
trap cleanup EXIT

for image in "$admin_image" "$widget_image"; do
  test "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")" = linux/amd64
  test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" = "$frontend_sha"
done

wait_for_http() {
  curl -fsS --retry 10 --retry-all-errors --retry-connrefused --retry-delay 1 --retry-max-time 60 \
    --connect-timeout 2 --max-time 5 "$1" -o "$2"
}

# 验证显式 origin 与默认同源两种配置，比较真实镜像内的原始文件。
# Test explicit-origin and same-origin modes against pristine files in the image.
for api_origin in 'https://api.docker-smoke.invalid' ''; do
  admin_container=$(docker create --pull=never --platform linux/amd64 \
    -e "IMBOY_API_HOST=$api_origin" -p 127.0.0.1::80 "$admin_image")
  containers+=("$admin_container")
  mkdir -p "$smoke_tmp/admin"
  docker cp "$admin_container:/usr/share/nginx/html/." "$smoke_tmp/admin"
  docker start "$admin_container" >/dev/null
  admin_http="http://$(docker port "$admin_container" 80/tcp)"
  wait_for_http "$admin_http/health" "$smoke_tmp/admin-health"
  test "$(cat "$smoke_tmp/admin-health")" = ok
  python3 - "$smoke_tmp/admin" "$admin_http" "$api_origin" <<'PY'
from html.parser import HTMLParser
from pathlib import Path
import sys
from urllib.request import build_opener, ProxyHandler

root, origin, api_origin = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
opener = build_opener(ProxyHandler({}))
placeholder = b'__IMBOY_API_HOST__'

def fetch(route):
    with opener.open(origin + route, timeout=5) as response:
        assert response.status == 200 and response.geturl() == origin + route, route
        return response.read()

original = (root / 'index.html').read_bytes()
assert placeholder in original, 'Admin build must contain the production API placeholder'
expected = original.replace(placeholder, api_origin.encode())
assert fetch('/') == expected, 'Admin HTML/CSP origin replacement differs'
assert fetch('/setup') == expected, 'Admin SPA history fallback differs'

class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('src'):
            self.paths.append(attrs['src'])
        if tag == 'link' and attrs.get('rel') in ('stylesheet', 'modulepreload'):
            self.paths.append(attrs['href'])

assets = Assets()
assets.feed(expected.decode())
assert assets.paths, 'Admin entry assets are missing'
injected_scripts = {
    '/' + file.relative_to(root).as_posix(): file.read_bytes()
    for file in root.rglob('*.js') if placeholder in file.read_bytes()
}
assert injected_scripts, 'Admin JS must contain the production API placeholders'
for suffix in (b'/api/adm', b'/api/adm/admin/config/sidebar'):
    assert any(placeholder + suffix in content for content in injected_scripts.values()), suffix.decode()
paths = sorted(set(assets.paths + list(injected_scripts)))
for route in paths:
    assert route.startswith('/assets/') and '..' not in route.split('/'), route
    content = (root / route.lstrip('/')).read_bytes()
    if route.endswith('.js'):
        content = content.replace(placeholder, api_origin.encode())
    assert fetch(route) == content, f'Admin runtime asset differs: {route}'
print(f'Admin runtime PASS: origin={api_origin or "same-origin"}, {len(paths)} entry/config assets')
PY
done

widget_container=$(docker run -d --pull=never --platform linux/amd64 \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -p 127.0.0.1::8080 "$widget_image")
containers+=("$widget_container")
test "$(docker inspect --format '{{.Config.User}}' "$widget_container")" = 101
test "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$widget_container")" = true
widget_http="http://$(docker port "$widget_container" 8080/tcp)"
wait_for_http "$widget_http/health.txt" "$smoke_tmp/widget-health"
python3 - "$widget_http" "$frontend_sha" <<'PY'
import json
from pathlib import Path
import sys
from urllib.request import build_opener, ProxyHandler

origin, frontend_sha = sys.argv[1:]
root = Path('dist-widget')
manifest = json.loads((root / 'manifest.json').read_text())
assert manifest['source_head'] == frontend_sha, 'Widget manifest has the wrong source SHA'
opener = build_opener(ProxyHandler({}))
paths = ['manifest.json', 'manifest.sha256', *[item['path'] for item in manifest['files']]]
for route, source in [(path, path) for path in paths] + [('v1/loader.js', 'loader.js')]:
    url = f'{origin}/{route}'
    with opener.open(url, timeout=5) as response:
        assert response.status == 200 and response.geturl() == url, route
        assert response.read() == (root / source).read_bytes(), f'Widget runtime bytes differ: {route}'
print(f'Widget runtime PASS: uid=101, read-only rootfs, {len(paths)} verified files and v1 loader alias')
PY

# 本地配置 ID 不是 Registry digest；发布候选仍需 Golden 和匿名拉取门。
# Local image IDs are not registry digests; release candidates still need release gates.
{
  echo '## Docker runtime checks / Docker 运行验证'
  printf -- '- Frontend tested checkout: %s\n' "$frontend_sha"
  printf -- '- Admin local image ID: %s\n' "$(docker image inspect --format '{{.Id}}' "$admin_image")"
  printf -- '- Widget local image ID: %s\n' "$(docker image inspect --format '{{.Id}}' "$widget_image")"
  echo '- PASS: Admin health, SPA/entry assets and API origin injection (explicit and same-origin).'
  echo '- PASS: Widget UID 101/read-only runtime, exact verified artifact bytes, manifest source SHA and v1 loader alias.'
  echo '- Scope: local linux/amd64 images; no registry digest, Golden acceptance or anonymous pull evidence.'
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
