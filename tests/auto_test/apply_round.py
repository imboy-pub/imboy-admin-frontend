#!/usr/bin/env python3
"""
把 _analysis.json 的判定应用到各模块 md（只覆盖现有行，绝不新增行）。
维护 bug 三列恒等式：新发现 bug → 发现+1（待处理 = 发现 − 解决 自动维持）。

用法：python3 tests/auto_test/apply_round.py [--dry]
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
EVID = os.path.join(ROOT, 'evidence')
MD_ROOT = ROOT
BATCH = '批次42'

def main():
    dry = '--dry' in sys.argv
    analysis = json.load(open(os.path.join(EVID, '_analysis.json')))

    by_file = {}
    for a in analysis:
        if a['verdict'] is None:
            continue
        by_file.setdefault(a['file'], []).append(a)

    changed = 0
    for rel, items in sorted(by_file.items()):
        path = os.path.join(MD_ROOT, rel)
        lines = open(path).read().split('\n')
        for it in items:
            ln = it['line_no'] - 1
            parts = [p.strip() for p in lines[ln].split('|')]
            if len(parts) < 11:
                print(f'  跳过格式异常行 {rel}:{it["line_no"]}')
                continue
            plan, planned_time, status, remark = it['verdict']
            old_plan = parts[1]
            found = int(parts[7] or 0)
            solved = int(parts[8] or 0)
            # bug 计数：新转入待修复才累计发现
            if plan == '待修复' and old_plan != '待修复':
                found += 1
            parts[1] = plan
            parts[2] = planned_time
            parts[5] = status
            parts[6] = BATCH
            parts[7] = str(found)
            parts[8] = str(solved)
            parts[9] = str(found - solved)
            parts[10] = remark
            lines[ln] = '| ' + ' | '.join(parts[1:11]) + ' |'
        if not dry:
            open(path, 'w').write('\n'.join(lines))
        changed += 1
        print(f'{rel}: {len(items)} 行{"(dry)" if dry else "已回写"}')
    print(f'共 {changed} 个文件')

if __name__ == '__main__':
    main()
