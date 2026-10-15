#!/usr/bin/env python3
"""Validate the scanner result before applying the existing 40-finding ceiling."""
import json
from pathlib import Path
import sys


def check(report, exit_code):
    # A dedicated findings exit code distinguishes findings from scanner errors.
    if exit_code not in (0, 10):
        raise ValueError(f'gitleaks failed with exit {exit_code}')
    findings = json.loads(Path(report).read_text())
    if not isinstance(findings, list) or any(
        not isinstance(item, dict) or not all(item.get(key) for key in ('RuleID', 'File', 'Fingerprint'))
        for item in findings
    ):
        raise ValueError('invalid gitleaks report')
    if bool(findings) != (exit_code == 10):
        raise ValueError('gitleaks exit/report mismatch')
    if len(findings) > 40:
        raise ValueError('gitleaks findings exceed existing baseline 40')
    return len(findings)


if __name__ == '__main__':
    try:
        print(f'gitleaks findings={check(sys.argv[1], int(sys.argv[2]))}')
    except (OSError, ValueError, IndexError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
