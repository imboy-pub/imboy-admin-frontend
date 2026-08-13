#!/usr/bin/env python3
"""从 src/pages/** 与 src/modules/**/pages/** 的 *Page.tsx 源码生成 auto_test 种子文档。

只在「新增页面/首次建立计划」时运行；已存在的 md 文件不会被覆盖，
日常维护走 LOOP_PROMPT.md 的覆盖写规程（绝不新增行）。

    cd imboyadmin && python3 tests/auto_test/gen_seed.py
"""
import glob
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(BASE))  # imboyadmin/

PAGE_GLOBS = [
    os.path.join(ROOT, 'src', 'pages', '*', '*Page.tsx'),
    os.path.join(ROOT, 'src', 'modules', '*', 'pages', '*Page.tsx'),
]

HEADER = (
    '| 计划变化 | 计划时间 | 页面path | 功能介绍 | 测试状态 | 测试轮次 | 发现bug | 解决bug | 待处理bug | 备注 |\n'
    '|---|---|---|---|---|---|---|---|---|---|---|\n'
)

CJK = re.compile(r'[一-鿿]')


def rel_path(f):
    """src 内相对路径，去掉 src/ 前缀，作为「页面path」列。"""
    return os.path.relpath(f, os.path.join(ROOT, 'src'))


def module_of(f):
    parts = os.path.relpath(f, os.path.join(ROOT, 'src')).split(os.sep)
    if parts[0] == 'modules':
        return parts[1]
    return parts[1] if parts[0] == 'pages' else parts[0]


def extract_features(src):
    """返回有序去重的功能介绍列表（不含路径，路径统一在写行时补）。"""
    feats = []

    def add(text):
        text = text.strip()
        if text and text not in feats:
            feats.append(text)

    add('路由直达与权限守卫（未登录跳 /login，无权限跳 403）')
    if 'LoadingState' in src or 'ErrorState' in src:
        add('加载中 / 空态 / 错误态展示（LoadingState / ErrorState）')
    if 'DataTable' in src:
        add('列表数据加载渲染与字段格式化')
    if 'DataTablePagination' in src:
        add('分页翻页与每页条数切换（筛选/搜索变化时重置 page=1）')
    if 'FilterBar' in src:
        add('筛选 / 搜索条件生效与清空重置')
    if 'BatchActionBar' in src:
        add('批量勾选与批量操作执行')
    if 'EntityDrawer' in src:
        add('抽屉（详情/编辑）打开、提交与关闭')
    if 'ConfirmDialog' in src:
        add('危险/写操作二次确认弹窗（确认执行与取消）')
    if re.search(r'handleExportCsv|csvExport|exportCsv', src):
        add('导出 CSV（字段完整性与大数据量分页导出）')

    # toast.success('xxx成功') → 以 toast 文案命名的写操作行
    covered_toast = False
    for m in re.finditer(r"toast\.success\(\s*['\"`]([^'\"`]{2,40})['\"`]", src):
        label = re.sub(r'\$\{[^}]*\}', 'N', m.group(1))      # 去模板插值
        label = re.split(r'[：:，,]', label)[0]               # 只留主干动作
        label = re.sub(r'(成功|完成)$', '', label).strip('已 ')
        if CJK.search(label) and 1 < len(label) <= 12:
            add(f'「{label}」操作提交成功并刷新列表数据')
            covered_toast = True

    # useMutation 但没有任何 toast 时，补一条通用写操作行
    if 'useMutation' in src and not covered_toast:
        names = re.findall(r'const\s+(\w+?)(?:Mutation)\s*=\s*useMutation', src)
        for name in names[:4]:
            add(f'「{name}」写操作提交与错误提示')

    # 页面内 navigate 跳转（${...} 归一化为 :id 后去重）
    seen_nav = set()
    for m in re.finditer(r"navigate\(\s*[`'\"]([^`'\"]+)['\"`]", src):
        target = re.sub(r'\$\{[^}]*\}', ':id', m.group(1))
        if target not in ('-1',) and len(target) < 60 and target not in seen_nav:
            seen_nav.add(target)
            add(f'跳转 `{target}`')

    return feats[:16]


def write_md(f):
    mod = module_of(f)
    name = os.path.basename(f)[:-4]  # 去掉 .tsx
    out_dir = os.path.join(BASE, mod)
    out = os.path.join(out_dir, name + '.md')
    if os.path.exists(out):
        return None  # 已存在，不覆盖
    src = open(f, encoding='utf-8').read()
    feats = extract_features(src)
    rp = rel_path(f)
    lines = [
        f'# `src/{rp}`\n',
        f'> 功能点 {len(feats)} 个 | bug 发现 0 / 解决 0 / 待处理 0',
        '> 索引：[../README.md](../README.md)\n',
        HEADER.rstrip('\n'),
    ]
    for feat in feats:
        lines.append(f'| 待首测 | - | `src/{rp}` | {feat} | 未测 | - | 0 | 0 | 0 |  |')
    os.makedirs(out_dir, exist_ok=True)
    open(out, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    return out


def main():
    created, skipped = [], 0
    files = sorted(set(p for g in PAGE_GLOBS for p in glob.glob(g)))
    for f in files:
        r = write_md(f)
        if r:
            created.append(r)
        else:
            skipped += 1
    print(f'新建 {len(created)} 个页面 md，跳过已存在 {skipped} 个')
    for r in created:
        print(' +', os.path.relpath(r, BASE))
    if not created and skipped:
        print('（全部已存在，未改动）')


if __name__ == '__main__':
    sys.exit(main())
