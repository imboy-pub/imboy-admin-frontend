import json
from pathlib import Path
import tempfile
import unittest
from check_gitleaks_result import check


class ResultTest(unittest.TestCase):
    def test_exit_report_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'report.json'
            with self.assertRaises(OSError):
                check(report, 0)
            for raw, rc, valid in [
                ('[]', 0, True), ('[]', 10, False), ('[]', 1, False),
                ('[]', 2, False), ('', 0, False), ('{}', 0, False),
                ('[{}]', 10, False),
            ]:
                with self.subTest(raw=raw, rc=rc):
                    report.write_text(raw)
                    if valid:
                        self.assertEqual(check(report, rc), 0)
                    else:
                        with self.assertRaises(ValueError):
                            check(report, rc)
            item = {'RuleID': 'fixture', 'File': 'fixture', 'Fingerprint': 'fixture:1'}
            report.write_text(json.dumps([item] * 40))
            self.assertEqual(check(report, 10), 40)
            with self.assertRaises(ValueError):
                check(report, 0)
            report.write_text(json.dumps([item] * 41))
            with self.assertRaises(ValueError):
                check(report, 10)


if __name__ == '__main__':
    unittest.main()
