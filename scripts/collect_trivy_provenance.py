#!/usr/bin/env python3
"""Collect allowlisted Trivy scan provenance, including partial failure evidence."""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import sys


def valid_timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(
        r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})', value
    ):
        return False
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).tzinfo is not None
    except ValueError:
        return False


def read_object(path, label, diagnostics):
    try:
        if path.is_symlink() or not path.is_file():
            diagnostics.append(f'{label}: missing regular file')
            return None
        data = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(data, dict):
            raise ValueError
        return data
    except (OSError, UnicodeError, ValueError):
        diagnostics.append(f'{label}: unreadable or invalid JSON object')
        return None


def collect(cache_dir, report_path, expected_version, scan_outcome, context):
    diagnostics = []
    payload = {'schema_version': 'trivy-provenance/v1'}
    patterns = {
        'repository': r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',
        'git_sha': r'[0-9a-f]{40}',
        'run_id': r'[0-9]+',
        'run_attempt': r'[0-9]+',
    }
    for field, pattern in patterns.items():
        value = context.get(field)
        if not isinstance(value, str) or not re.fullmatch(pattern, value):
            diagnostics.append(f'{field}: missing or invalid context')
            value = None
        payload[field] = value

    if scan_outcome not in ('success', 'failure', 'cancelled', 'skipped'):
        diagnostics.append('scan_outcome: missing or invalid outcome')
        scan_outcome = None
    expected_version = expected_version.removeprefix('v')
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', expected_version):
        diagnostics.append('scanner: invalid expected version')
        expected_version = None
    version = None
    report = read_object(report_path, 'scanner report', diagnostics)
    if report is not None:
        try:
            runs = report['runs']
            if not isinstance(runs, list) or len(runs) != 1:
                raise ValueError
            driver = runs[0]['tool']['driver']
            observed = driver['version']
            if driver['name'] != 'Trivy' or not isinstance(observed, str) or not re.fullmatch(
                r'[0-9]+\.[0-9]+\.[0-9]+', observed
            ):
                raise ValueError
            version = observed
            if version != expected_version:
                diagnostics.append('scanner: observed version differs from expected version')
        except (KeyError, TypeError, ValueError):
            diagnostics.append('scanner: invalid Trivy report identity')
    payload['scanner'] = {
        'name': 'Trivy', 'version': version,
        'expected_version': expected_version, 'scan_outcome': scan_outcome,
    }

    metadata = read_object(cache_dir / 'db/metadata.json', 'database metadata', diagnostics)
    selected_metadata = None
    if metadata is not None:
        if (type(metadata.get('Version')) is not int or metadata['Version'] < 1
                or not all(valid_timestamp(metadata.get(key)) for key in (
                    'UpdatedAt', 'NextUpdate', 'DownloadedAt'
                ))):
            diagnostics.append('database metadata: invalid version or timestamps')
        else:
            selected_metadata = {
                key: metadata[key] for key in ('Version', 'UpdatedAt', 'NextUpdate', 'DownloadedAt')
            }
    database_file = None
    database_path = cache_dir / 'db/trivy.db'
    try:
        if database_path.is_symlink() or not database_path.is_file():
            diagnostics.append('database file: missing regular file')
        else:
            digest = hashlib.sha256()
            size = 0
            with database_path.open('rb') as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    digest.update(chunk)
                    size += len(chunk)
            if size == 0:
                diagnostics.append('database file: empty file')
            else:
                # This identifies local DB bytes, not an OCI manifest or download source.
                database_file = {
                    'path': 'db/trivy.db', 'sha256': digest.hexdigest(), 'size_bytes': size,
                }
    except OSError:
        diagnostics.append('database file: cannot read file')
    payload['vulnerability_db'] = {'metadata': selected_metadata, 'file': database_file}

    policy = read_object(cache_dir / 'policy/metadata.json', 'checks bundle metadata', diagnostics)
    checks_bundle = None
    if policy is not None:
        digest = policy.get('Digest')
        if (not isinstance(digest, str) or not re.fullmatch(r'sha256:[0-9a-f]{64}', digest)
                or type(policy.get('MajorVersion')) is not int or policy['MajorVersion'] < 1
                or not valid_timestamp(policy.get('DownloadedAt'))):
            diagnostics.append('checks bundle metadata: invalid digest, version or timestamp')
        else:
            checks_bundle = {
                'digest': digest, 'major_version': policy['MajorVersion'],
                'downloaded_at': policy['DownloadedAt'],
            }
    payload['checks_bundle'] = checks_bundle
    payload['collection_status'] = 'incomplete' if diagnostics else 'complete'
    payload['diagnostics'] = diagnostics
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--expected-version', required=True)
    parser.add_argument('--scan-outcome', required=True)
    args = parser.parse_args()
    context = {field: os.environ.get(variable) for field, variable in (
        ('repository', 'GITHUB_REPOSITORY'), ('git_sha', 'GITHUB_SHA'),
        ('run_id', 'GITHUB_RUN_ID'), ('run_attempt', 'GITHUB_RUN_ATTEMPT'),
    )}
    payload = collect(args.cache_dir, args.report, args.expected_version, args.scan_outcome, context)
    try:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    except OSError:
        print('::error::Trivy provenance: cannot write the evidence artifact.', file=sys.stderr)
        return 2
    print(f"Trivy provenance collection: {payload['collection_status']}; "
          f"scan outcome: {payload['scanner']['scan_outcome']}.")
    for diagnostic in payload['diagnostics']:
        print(f'::error::Trivy provenance: {diagnostic}.', file=sys.stderr)
    return 2 if payload['diagnostics'] else 0


if __name__ == '__main__':
    sys.exit(main())
