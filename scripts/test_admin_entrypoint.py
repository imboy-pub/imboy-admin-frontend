"""Run the real entrypoint against HTML/JS fixtures with the system sed/find.

用真实 sed/find 验证入口文件替换；只替换静态目录及 nginx 进程边界。
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


REPOSITORY = Path(__file__).resolve().parent.parent
ENTRYPOINT = REPOSITORY / 'docker/admin/entrypoint.sh'
PLACEHOLDER = '__IMBOY_API_HOST__'


class AdminEntrypointTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.html = self.root / 'html'
        (self.html / 'assets').mkdir(parents=True)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.log = self.root / 'nginx.log'
        self.original = {
            'index.html': (REPOSITORY / 'index.html').read_text(),
            'assets/client.js': 'const url="__IMBOY_API_HOST__/api/adm";const sidebar="__IMBOY_API_HOST__/api/adm/admin/config/sidebar";',
            'assets/style.css': '/* __IMBOY_API_HOST__ is not an HTML/JS input */',
        }
        for name, content in self.original.items():
            (self.html / name).write_text(content)
        self.env = {
            **os.environ,
            'PATH': f'{self.bin}{os.pathsep}{os.environ["PATH"]}',
            'ENTRYPOINT_FIXTURE': str(self.html),
            'ENTRYPOINT_LOG': str(self.log),
        }
        self.env.pop('IMBOY_API_HOST', None)
        self.command('find', f'''
test "$1" = /usr/share/nginx/html
shift
exec {shutil.which('find')} "$ENTRYPOINT_FIXTURE" "$@"
''')
        self.command('nginx', 'printf "%s\\n" "$*" > "$ENTRYPOINT_LOG"\n')

    def command(self, name, body):
        target = self.bin / name
        target.write_text('#!/bin/sh\nset -eu\n' + body)
        target.chmod(0o755)

    def run_entrypoint(self):
        return subprocess.run(
            ['sh', str(ENTRYPOINT)], env=self.env, capture_output=True,
            text=True, timeout=5,
        )

    def assert_replaced(self, host):
        result = self.run_entrypoint()
        self.assertEqual(result.returncode, 0, result.stderr)
        for name, content in self.original.items():
            expected = content.replace(PLACEHOLDER, host) if name.endswith(('.js', '.html')) else content
            self.assertEqual((self.html / name).read_text(), expected, name)
        self.assertEqual(self.log.read_text(), '-g daemon off;\n')

    def test_unset_origin_keeps_same_origin_api_paths(self):
        self.assert_replaced('')

    def test_empty_origin_keeps_same_origin_api_paths(self):
        self.env['IMBOY_API_HOST'] = ''
        self.assert_replaced('')

    def test_https_origin_is_inserted_without_extra_quotes(self):
        self.env['IMBOY_API_HOST'] = 'https://api.example.test:8443'
        self.assert_replaced(self.env['IMBOY_API_HOST'])

    def test_sed_replacement_characters_remain_literal(self):
        # Synthetic replacement edge case, not a recommended deployment origin.
        self.env['IMBOY_API_HOST'] = r'https://example.test/a&b|c\d'
        self.assert_replaced(self.env['IMBOY_API_HOST'])

    def test_replacement_failure_prevents_nginx_start(self):
        self.command('find', 'exit 42\n')
        result = self.run_entrypoint()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.log.exists())


if __name__ == '__main__':
    unittest.main()
