#!/usr/bin/env python3
"""Новый прайс → те же id позиций, что в старом (иначе сохранённые просчёты укажут не на те позиции).
Позиция узнаётся по листу, модели/названию, разделу и параметрам (не по цене). Новые позиции получают новые id.
Запуск: python3 scripts/stable_ids.py <старый price.json> <новый price.json> <выход>"""
import json, sys
old, new = (json.load(open(p, encoding='utf-8')) for p in sys.argv[1:3])

def keys(d):
    out = {}
    def put(k, i):
        out.setdefault(k, []).append(i)
    for s in d['series']:
        for m in s['models']:
            for v in m['variants']:
                put(('v', s['sheet'], m['code'], v['label']), v['id'])
        for t in ('height', 'width'):
            for x in s[t]:
                put((t, s['sheet'], x['name'], x.get('group', '')), x['id'])
    for c in d['catalog']:
        put(('c', c['sheet'], c['section'], c['sub'], c['name'], tuple(c['attrs']), c['unit'], c['kind']), c['id'])
    return out

ko, kn = keys(old), keys(new)
oldmax = max(i for v in ko.values() for i in v)
remap, nxt, kept, fresh = {}, oldmax + 1, 0, 0
for k, ids in kn.items():
    o = ko.get(k, [])
    for j, i in enumerate(ids):            # одинаковые ключи (дубли) — по порядку
        if j < len(o): remap[i] = o[j]; kept += 1
        else: remap[i] = None
# новые — по порядку появления
for i in sorted(i for i, v in remap.items() if v is None):
    remap[i] = nxt; nxt += 1; fresh += 1

for s in new['series']:
    for m in s['models']:
        for v in m['variants']: v['id'] = remap[v['id']]
    for t in ('height', 'width'):
        for x in s[t]: x['id'] = remap[x['id']]
    s['options'] = [remap[i] for i in s['options']]
for c in new['catalog']: c['id'] = remap[c['id']]
assert len({c['id'] for c in new['catalog']}) == len(new['catalog'])
json.dump(new, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
gone = sum(len(v) for k, v in ko.items() if k not in kn)
print(f'сохранено id: {kept}, новых позиций: {fresh}, пропало из прайса: {gone}')
