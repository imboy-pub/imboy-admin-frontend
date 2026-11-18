import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from collect_trivy_provenance import collect


class ProvenanceTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.cache = self.root / 'cache'
        (self.cache / 'db').mkdir(parents=True)
        (self.cache / 'policy').mkdir()
        self.marker = 'unrelated-content-must-not-be-published'
        self.metadata = {
            'Version': 2, 'UpdatedAt': '2026-11-18T19:07:09.82030288Z',
            'NextUpdate': '2026-11-19T19:07:09.820302589Z',
            'DownloadedAt': '2026-11-18T22:19:20.404428685Z',
            'unrelated': self.marker,
        }
        self.policy = {
            'Digest': 'sha256:' + 'a' * 64, 'MajorVersion': 2,
            'DownloadedAt': '2026-11-19T06:21:37.410714214+08:00',
            'unrelated': self.marker,
        }
        self.write_json(self.cache / 'db/metadata.json', self.metadata)
        self.write_json(self.cache / 'policy/metadata.json', self.policy)
        self.database_bytes = b'local database fixture\x00\x01'
        (self.cache / 'db/trivy.db').write_bytes(self.database_bytes)
        self.report = self.root / 'trivy.sarif'
        self.write_report()
        self.context = {
            'repository': 'example/admin', 'git_sha': 'b' * 40,
            'run_id': '123', 'run_attempt': '1',
        }

    def write_json(self, path, value):
        path.write_text(json.dumps(value), encoding='utf-8')

    def write_report(self, version='0.76.2'):
        self.write_json(self.report, {
            'version': '2.1.0',
            'runs': [{
                'tool': {'driver': {'name': 'Trivy', 'version': version}},
                'results': [{'message': {'text': self.marker}}],
            }],
        })

    def collect(self, outcome='success'):
        return collect(self.cache, self.report, 'v0.76.2', outcome, self.context)

    def test_exact_provenance_and_allowlist(self):
        evidence = self.collect()
        self.assertEqual(evidence['collection_status'], 'complete')
        self.assertEqual(evidence['diagnostics'], [])
        self.assertEqual(evidence['vulnerability_db']['file'], {
            'path': 'db/trivy.db',
            'sha256': hashlib.sha256(self.database_bytes).hexdigest(),
            'size_bytes': len(self.database_bytes),
        })
        self.assertEqual(set(evidence['vulnerability_db']['metadata']), {
            'Version', 'UpdatedAt', 'NextUpdate', 'DownloadedAt',
        })
        self.assertEqual(evidence['checks_bundle']['digest'], self.policy['Digest'])
        self.assertEqual(evidence['scanner']['version'], '0.76.2')
        self.assertNotIn(self.marker, json.dumps(evidence))
        self.assertNotIn('source', evidence['vulnerability_db'])

    def test_missing_inputs_preserve_other_evidence(self):
        paths = ('db/metadata.json', 'db/trivy.db', 'policy/metadata.json')
        for relative in paths:
            with self.subTest(relative=relative):
                path = self.cache / relative
                original = path.read_bytes()
                path.unlink()
                evidence = self.collect()
                self.assertEqual(evidence['collection_status'], 'incomplete')
                self.assertTrue(evidence['diagnostics'])
                self.assertEqual(evidence['scanner']['version'], '0.76.2')
                if relative != 'db/trivy.db':
                    self.assertIsNotNone(evidence['vulnerability_db']['file'])
                path.write_bytes(original)

    def test_invalid_metadata_is_diagnostic_and_sanitized(self):
        mutations = (
            ('db/metadata.json', self.marker),
            ('db/metadata.json', json.dumps({**self.metadata, 'Version': True})),
            ('db/metadata.json', json.dumps({**self.metadata, 'UpdatedAt': '2026-02-30T00:00:00Z'})),
            ('db/metadata.json', json.dumps({**self.metadata, 'DownloadedAt': '2026-11-18T22:00:00'})),
            ('policy/metadata.json', json.dumps({**self.policy, 'Digest': self.marker})),
            ('policy/metadata.json', '[]'),
        )
        for relative, raw in mutations:
            with self.subTest(relative=relative, raw=raw):
                path = self.cache / relative
                original = path.read_bytes()
                path.write_text(raw, encoding='utf-8')
                evidence = self.collect()
                self.assertEqual(evidence['collection_status'], 'incomplete')
                self.assertIsNotNone(evidence['vulnerability_db']['file'])
                self.assertNotIn(self.marker, json.dumps(evidence))
                path.write_bytes(original)

    def test_empty_or_symlinked_database_is_not_complete(self):
        path = self.cache / 'db/trivy.db'
        path.write_bytes(b'')
        self.assertEqual(self.collect()['collection_status'], 'incomplete')
        path.unlink()
        outside = self.root / 'outside'
        outside.write_bytes(self.database_bytes)
        path.symlink_to(outside)
        self.assertIsNone(self.collect()['vulnerability_db']['file'])

    def test_report_version_and_context_cannot_be_faked(self):
        self.write_report('0.77.0')
        self.assertEqual(self.collect()['collection_status'], 'incomplete')
        self.write_report(self.marker)
        evidence = self.collect()
        self.assertIsNone(evidence['scanner']['version'])
        self.assertNotIn(self.marker, json.dumps(evidence))
        self.write_report()
        self.context['git_sha'] = self.marker
        evidence = self.collect()
        self.assertIsNone(evidence['git_sha'])
        self.assertEqual(evidence['collection_status'], 'incomplete')
        self.assertNotIn(self.marker, json.dumps(evidence))

    def test_failed_scan_preserves_outcome_and_available_data(self):
        evidence = self.collect('failure')
        self.assertEqual(evidence['scanner']['scan_outcome'], 'failure')
        self.assertEqual(evidence['collection_status'], 'complete')
        self.report.unlink()
        evidence = self.collect('failure')
        self.assertEqual(evidence['collection_status'], 'incomplete')
        self.assertEqual(evidence['scanner']['scan_outcome'], 'failure')
        self.assertIsNone(evidence['scanner']['version'])
        self.assertIsNotNone(evidence['vulnerability_db']['file'])
        self.assertIsNotNone(evidence['checks_bundle'])

    def test_cli_writes_partial_artifact_and_exits_nonzero(self):
        (self.cache / 'policy/metadata.json').unlink()
        output = self.root / 'out/provenance.json'
        env = {**os.environ, 'GITHUB_REPOSITORY': self.context['repository'],
               'GITHUB_SHA': self.context['git_sha'], 'GITHUB_RUN_ID': '123',
               'GITHUB_RUN_ATTEMPT': '1', 'UNRELATED_ENV': self.marker}
        result = subprocess.run([
            sys.executable, '-B', str(Path(__file__).with_name('collect_trivy_provenance.py')),
            '--cache-dir', str(self.cache), '--report', str(self.report),
            '--output', str(output), '--expected-version', 'v0.76.2', '--scan-outcome', 'failure',
        ], env=env, text=True, capture_output=True, check=False)
        self.assertEqual(result.returncode, 2)
        evidence = json.loads(output.read_text())
        self.assertEqual(evidence['collection_status'], 'incomplete')
        self.assertEqual(evidence['scanner']['scan_outcome'], 'failure')
        self.assertIn('checks bundle metadata', result.stderr)
        self.assertNotIn(self.marker, output.read_text() + result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
