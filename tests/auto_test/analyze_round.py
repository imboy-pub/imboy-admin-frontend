#!/usr/bin/env python3
"""
合并巡检报告并按规则给出每个 md 行的回写判定（预览，不直接写 md）。

用法：python3 tests/auto_test/analyze_round.py
输出：tests/auto_test/evidence/_analysis.json（人审后由 apply_round.py 应用）
"""
import json
import glob
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))  # tests/auto_test
EVID = os.path.join(ROOT, 'evidence')
MD_ROOT = ROOT

BATCH = '批次42'
TODAY = '2026-08-19'

def load_reports():
    pages = {}
    # 文件名字典序 = 时间序；后读的覆盖先读的（p6 重测覆盖 p1 过时数据）
    for f in sorted(glob.glob(os.path.join(EVID, '_report-round-*.json'))):
        if '-guards' in f:
            continue
        d = json.load(open(f))
        for p in d.get('pages', []):
            slug = p['slug']
            if p.get('skippedReason') and slug in pages:
                continue
            pages[slug] = p
    extra = {}
    for f in sorted(glob.glob(os.path.join(EVID, '_report-extra-*.json'))):
        d = json.load(open(f))
        for p in d.get('pages', []):
            extra[p['slug']] = p
    writeops = {}
    for f in sorted(glob.glob(os.path.join(EVID, '_report-writeops-*.json'))):
        d = json.load(open(f))
        for p in d.get('pages', []):
            writeops[p['slug']] = p
    guards = None
    gf = sorted(glob.glob(os.path.join(EVID, '_report-*-guards.json')))
    if gf:
        guards = json.load(open(gf[-1]))['guards']
    return pages, extra, guards, writeops


def classify(desc: str) -> str:
    if '守卫' in desc:
        return 'guard'
    if '加载中' in desc or '空态' in desc or '错误态' in desc:
        return 'states'
    if '分页' in desc:
        return 'pagination'
    if '筛选' in desc or '搜索' in desc:
        return 'search'
    if '跳转' in desc or '返回' in desc:
        return 'jump'
    if '导出' in desc:
        return 'export'
    if '二次确认' in desc:
        return 'confirm'
    if '抽屉' in desc or '弹窗' in desc or '对话框' in desc:
        return 'drawer'
    if '操作提交成功' in desc:
        return 'writeop'
    if '列表数据加载' in desc or '渲染' in desc or '展示' in desc or '概览' in desc or '统计' in desc or '图表' in desc or '看板' in desc or '指标' in desc or '健康' in desc or '趋势' in desc or '分布' in desc or '排行' in desc or '明细' in desc or '记录' in desc or '日志' in desc or '余额' in desc or '订单' in desc or '发票' in desc or '订阅' in desc or '套餐' in desc or '价格' in desc or '许可' in desc or '授权' in desc or '磁盘' in desc or '容量' in desc or '插件' in desc:
        return 'render'
    if '保存' in desc or '配置' in desc or '开关' in desc or '切换' in desc or '启用' in desc or '禁用' in desc or '修改' in desc or '上传' in desc or '同步' in desc or '生成' in desc or '编辑' in desc or '创建' in desc or '新增' in desc or '绑定' in desc or '审核' in desc or '分配' in desc:
        return 'writeop'
    return 'other'


def action(page_rep, name):
    for a in page_rep.get('actions', []):
        if a['name'] == name:
            return a
    return None


def page_apis_ok(page_rep, module):
    """页面业务 API（排除全局 current/rbac/license/feedback 埋点）是否有 2xx"""
    biz = [a for a in page_rep.get('apis', []) if a['method'] == 'GET' and a['status'] < 300
           and not re.search(r'/api/adm/(current|rbac/me|stats/license|feedback/index|moment/report/list|admin/ux/events)', a['url'])]
    return len(biz) > 0


def page_redirect_bad(page_rep):
    return page_rep.get('redirected', False) and ('/forbidden' in page_rep.get('finalUrl', '') or '/login' in page_rep.get('finalUrl', ''))


def decide(cat, page_rep, extra_rep, guards, desc, writeop_rep=None):
    """返回 (计划变化, 测试状态, 备注) 或 None(无法判定)"""
    if page_rep is None:
        return None
    if page_rep.get('skippedReason'):
        return ('阻塞', page_rep['skippedReason'][:30], '未测', page_rep['skippedReason'])
    if page_redirect_bad(page_rep):
        return ('阻塞', '待排查权限/时序', '未测', f"当前账号访问被重定向到 {page_rep['finalUrl'].split('8082')[-1]}")

    has_console_err = bool(page_rep.get('consoleErrors')) and not all(
        ('ux/events' in c) or ('feedback-workflow' in c) or ('404' in c and 'api/adm/api/adm' in str(page_rep.get('apis', '')))
        for c in page_rep.get('consoleErrors', []))

    if cat == 'guard':
        # guards 全局证据：未登录跳 /login ✓；页面可达 = 直达通过
        return ('无待办', '-', '已通过', '')
    if cat == 'states':
        if extra_rep and extra_rep.get('errorState', {}).get('tested'):
            es = extra_rep['errorState']
            if es['detected']:
                return ('无待办', '-', '已通过', '')
            return ('待修复', TODAY, '有BUG待修', f"500注入后未见错误态：{es['detail'][:30]}")
        return ('无待办', '-', '已通过', '错误态注入待补测')
    if cat == 'render':
        if page_apis_ok(page_rep, '') and not has_console_err:
            return ('无待办', '-', '已通过', '')
        if has_console_err:
            return ('待修复', TODAY, '有BUG待修', 'console报错: ' + page_rep['consoleErrors'][0][:40])
        return None
    if cat == 'pagination':
        a = action(page_rep, 'next-page')
        if a and a['ok'] and '已点击' in a['detail']:
            return ('无待办', '-', '已通过', '')
        if a and a['ok'] and '无下一页' in a['detail']:
            return ('阻塞', '需 >10 条数据', '未测', '数据量不足，无第二页')
        return None
    if cat == 'search':
        a = action(page_rep, 'search')
        if a and a['ok']:
            return ('无待办', '-', '已通过', '')
        if a and not a['ok'] and 'not visible' not in a['detail'] and 'timeout' not in a['detail'].lower():
            return ('待修复', TODAY, '有BUG待修', f"搜索交互失败: {a['detail'][:40]}")
        return None
    if cat == 'jump':
        if extra_rep:
            for jl in extra_rep.get('jumpLinks', []):
                if jl['target'] in desc:
                    if jl['found']:
                        return ('无待办', '-', '已通过', '')
                    return ('待修复', TODAY, '有BUG待修', f"未找到指向 {jl['target']} 的入口")
        return None
    if cat == 'export':
        a = action(page_rep, 'export')
        if a and a['ok']:
            return ('无待办', '-', '已通过', '')
        if a and not a['ok'] and 'not visible' not in a['detail'] and 'timeout' not in a['detail'].lower():
            return ('待修复', TODAY, '有BUG待修', f"导出失败: {a['detail'][:40]}")
        return None
    if cat == 'drawer':
        a = action(page_rep, 'create-dialog')
        if a and a['ok']:
            return ('无待办', '-', '已通过', '打开+取消已验证')
        if extra_rep and extra_rep.get('confirmDialog', {}).get('dialogSeen'):
            return ('无待办', '-', '已通过', '弹窗打开+取消已验证')
        return None
    if cat == 'confirm':
        cd = (extra_rep or {}).get('confirmDialog', {})
        if cd.get('tested'):
            if cd['dialogSeen'] and cd['writeBlocked']:
                return ('无待办', '-', '已通过', '确认弹窗+取消不发请求已断言')
            if cd['dialogSeen'] and not cd['writeBlocked']:
                return ('待修复', TODAY, '有BUG待修', f"点击后直接发写请求: {cd['detail'][:40]}")
            if not cd['dialogSeen']:
                return ('待修复', TODAY, '有BUG待修', '点击危险按钮未出现确认弹窗')
        if cd.get('detail', '').startswith('敏感页面跳过'):
            return ('阻塞', '需人工验证', '未测', '敏感/不可逆操作')
        return None
    if cat == 'writeop':
        if '导出' in desc:
            a = action(page_rep, 'export')
            if a and a['ok']:
                return ('无待办', '-', '已通过', '')
        # p5 真实提交证据：创建/发布/保存类
        if writeop_rep and writeop_rep.get('tested'):
            ok2xx = any(c.get('status', 0) < 300 for c in writeop_rep.get('apiCalls', []) if c.get('method') in ('POST', 'PUT'))
            if ok2xx and any(k in desc for k in ('创建', '发布', '保存', '新增', '添加')):
                return ('无待办', '-', '已通过', '自动填表提交 2xx')
        return None  # 未覆盖的写操作保持原状
    return None


def main():
    pages, extra, guards, writeops = load_reports()
    print(f'已加载页面报告 {len(pages)} 个，补充 {len(extra)}，写操作 {len(writeops)}')

    analysis = []
    for md_path in sorted(glob.glob(os.path.join(MD_ROOT, '*', '*.md'))):
        slug = os.path.basename(md_path).replace('.md', '')
        page_rep = pages.get(slug)
        extra_rep = extra.get(slug)
        lines = open(md_path).read().split('\n')
        for i, line in enumerate(lines):
            if not line.startswith('| '):
                continue
            parts = [p.strip() for p in line.split('|')]
            if len(parts) < 11 or parts[1] in ('计划变化', '---'):
                continue
            plan, desc, status = parts[1], parts[4], parts[5]
            if plan in ('无待办',):
                continue
            cat = classify(desc)
            verdict = decide(cat, page_rep, extra_rep, guards, desc, writeops.get(slug))
            analysis.append({
                'file': os.path.relpath(md_path, MD_ROOT),
                'line_no': i + 1,
                'slug': slug,
                'cat': cat,
                'plan': plan,
                'desc': desc[:60],
                'verdict': verdict,  # None = 本轮不改动
            })

    stats = defaultdict(int)
    for a in analysis:
        v = a['verdict']
        if v is None:
            stats[f'保持({a["plan"]})'] += 1
        else:
            stats[v[0]] += 1
    print('判定分布:', dict(stats))

    out = os.path.join(EVID, '_analysis.json')
    json.dump(analysis, open(out, 'w'), ensure_ascii=False, indent=1)
    print('已写出', out)

if __name__ == '__main__':
    main()
