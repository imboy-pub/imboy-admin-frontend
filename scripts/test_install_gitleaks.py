"""Offline installation regressions; failures must never reach extraction/run.

离线安装回归：下载、校验或解压失败均须阻断，不依赖 GitHub 可用性。
"""
import io
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest


INSTALLER = Path(__file__).with_name('install_gitleaks.sh')


class InstallGitleaksTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.temp = self.root / 'temporary'
        self.temp.mkdir()
        self.events = self.root / 'events'
        self.destination = self.root / 'gitleaks'
        self.env = {
            **os.environ,
            'PATH': f'{self.bin}{os.pathsep}{os.environ["PATH"]}',
            'TMPDIR': str(self.temp),
            'INSTALL_EVENTS': str(self.events),
            'INSTALL_ARCHIVE': str(self.root / 'archive.tar.gz'),
        }
        # The fake binary is harmless and only writes its invocation to a log.
        binary = b'#!/bin/sh\nprintf "binary:%s\\n" "$*" >> "$INSTALL_EVENTS"\n'
        with tarfile.open(self.env['INSTALL_ARCHIVE'], 'w:gz') as archive:
            entry = tarfile.TarInfo('gitleaks')
            entry.size = len(binary)
            entry.mode = 0o755
            archive.addfile(entry, io.BytesIO(binary))
        self.command('curl', '''
printf 'download\\n' >> "$INSTALL_EVENTS"
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then cp "$INSTALL_ARCHIVE" "$2"; exit 0; fi
  shift
done
exit 2
''')
        self.command('tar', f'''
printf 'extract\\n' >> "$INSTALL_EVENTS"
exec {shutil.which('tar')} "$@"
''')

    def command(self, name, body):
        target = self.bin / name
        target.write_text('#!/bin/sh\nset -eu\n' + body)
        target.chmod(0o755)

    def run_installer(self):
        result = subprocess.run(
            ['bash', str(INSTALLER), str(self.destination)], env=self.env,
            capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(list(self.temp.iterdir()), [], 'temporary download must be cleaned')
        return result

    def log(self):
        return self.events.read_text().splitlines() if self.events.exists() else []

    def accept_fixture_checksum(self):
        # Only the success/extraction tests substitute verification. The checksum
        # failure test below uses the real sha256sum against the pinned digest.
        self.command('sha256sum', '''
cat >/dev/null
printf 'verified\\n' >> "$INSTALL_EVENTS"
''')

    def test_failed_download_never_extracts_or_executes_a_stale_binary(self):
        self.destination.write_text('#!/bin/sh\nprintf "stale\\n" >> "$INSTALL_EVENTS"\n')
        self.destination.chmod(0o755)
        self.command('curl', 'printf "download-failed\\n" >> "$INSTALL_EVENTS"\nexit 22\n')
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.log(), ['download-failed'])

    def test_bad_checksum_never_extracts_or_installs(self):
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('FAILED', result.stdout + result.stderr)
        self.assertEqual(self.log(), ['download'])
        self.assertFalse(self.destination.exists())

    def test_failed_extraction_never_installs_or_executes(self):
        self.accept_fixture_checksum()
        self.command('tar', 'printf "extract-failed\\n" >> "$INSTALL_EVENTS"\nexit 2\n')
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.log(), ['download', 'verified', 'extract-failed'])
        self.assertFalse(self.destination.exists())

    def test_verified_archive_is_installed_and_version_checked(self):
        self.accept_fixture_checksum()
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.log(), ['download', 'verified', 'extract', 'binary:version'])
        self.assertTrue(os.access(self.destination, os.X_OK))


if __name__ == '__main__':
    unittest.main()
