#!/usr/bin/env python3
"""Разбор прайса PROFILDOORS (выгрузка Google-таблицы в текст: «## Sheet name: …» + строки CSV)
в каталог для «Просчёта»: src/data/price.json.

Запуск:  python3 scripts/parse_price.py <выгрузка.txt> src/data/price.json
"""
import csv, io, json, re, sys

DOOR_SHEETS = ['Под покраску', 'AG', 'AGX', 'P, N', 'PD', 'PE.O, NE.O', 'GE', 'SE.O', 'SE', 'ST', 'VE', 'VT', 'AGN', 'AT', 'Серия FT EI30']
UNITS = {'шт', 'шт.', 'к-кт', 'м2', 'кв м', 'кв.м.', 'пог.м', 'комплект', 'метр', 'компл', 'к-т'}
PRICE = re.compile(r'^\s*(\d[\d\s ]*)\s*[₽₸]\s*$')
PCT = re.compile(r'^\s*(-?\d+(?:[.,]\d+)?)\s*%\s*$')


def clean(x: str) -> str:
    return re.sub(r'\s+', ' ', (x or '').replace(' ', ' ')).strip()


def split_sheets(text):
    parts = re.split(r'^## Sheet name: (.*)$', text, flags=re.M)
    return [(parts[i].strip(), parts[i + 1]) for i in range(1, len(parts), 2)]


def rng(text):
    """Диапазон размеров из текста наценки: «от 2150 мм до 2400 мм», «свыше 1000 мм до 1200», «2100, 2200 мм», «2300 мм»."""
    t = text.replace(' ', ' ')
    nums = [int(n) for n in re.findall(r'(\d{3,4})\s*(?:мм)?', t)]
    nums = [n for n in nums if 300 <= n <= 6000]
    if not nums:
        return None
    lo, hi = min(nums), max(nums)
    strict = bool(re.search(r'свыше\s*\d', t))   # «свыше 1000» — строго больше
    return {'min': lo, 'max': hi, 'strict': strict}


def parse(text):
    sheets = []
    for name, body in split_sheets(text):
        if name == 'Содержание':
            continue
        items, section, sub, notes = [], '', '', []
        group = ''   # вид полотна, к которому относятся наценки (стандартное, E-, F-, G-полотно…)
        last_model = None
        before_markup = True
        for raw in body.split('\n'):
            if not raw.strip():
                continue
            try:
                cols = next(csv.reader(io.StringIO(raw)))
            except Exception:
                cols = [raw]
            cols = [clean(c) for c in cols]
            nonempty = [c for c in cols if c]
            if not nonempty:
                continue
            if nonempty[0] in ('Модель', 'Наименование') or nonempty == ['Вернуться к содержанию']:
                continue
            price = pct = None
            for c in reversed(cols):
                m = PRICE.match(c)
                if m:
                    price = int(re.sub(r'\D', '', m.group(1)))
                    break
                m = PCT.match(c)
                if m:
                    pct = float(m.group(1).replace(',', '.'))
                    break
            if price is None and pct is None:
                line = nonempty[0]
                if len(nonempty) == 1 and len(line) <= 90 and not line.endswith('.') and not line.startswith('*'):
                    # заголовок раздела / подраздела
                    if re.match(r'^(Наценка на|Варианты|Прочие|Дополнительные|Замки|Петли|Двери|Ответная|Врезной|Примечания|Комплектации|Короба|Погонаж|Фурнитура|Стеклянн|Системы|Верхняя|Порог)', line) or line.isupper() or line.startswith('РУЧКИ'):
                        section, sub = line, ''
                    else:
                        sub = line
                    if re.search(r'(полотно|фрамуга)\s*$', line, re.I) and not line.startswith('Наценка'):
                        group = line
                if re.match(r'^Наценка на (высоту|ширину)', line):
                    before_markup = False
                if line.startswith('В прайсе указана') or line.startswith('В стоимость полотна'):
                    before_markup = False
                continue
            # строка с ценой
            first = cols[0]
            unit = next((c for c in cols if c.lower() in UNITS), '')
            attrs = [c for c in cols[1:] if c and c != unit and not PRICE.match(c) and not PCT.match(c)]
            cont = not first   # продолжение предыдущей модели (другая категория/вариант)
            if cont and last_model is not None:
                nm = last_model
            else:
                nm = first or (attrs[0] if attrs else '')
                if not first and attrs:
                    attrs = attrs[1:]
                last_model = nm
            kind = 'pct' if pct is not None else 'price'
            if re.match(r'^Наценка на высоту', nm):
                before_markup = False
            items.append({
                'name': nm, 'attrs': attrs, 'unit': unit,
                'price': price, 'pct': pct, 'kind': kind,
                'section': section, 'sub': sub, 'early': before_markup, 'group': group,
            })
        sheets.append({'sheet': name, 'items': items})
    return sheets


def build(text):
    sheets = parse(text)
    out = {'title': '', 'series': [], 'catalog': []}
    m = re.search(r'Прайс-лист на территории[^\n]*', text)
    out['title'] = clean(m.group(0)) if m else ''
    uid = 0
    for sh in sheets:
        is_door = sh['sheet'] in DOOR_SHEETS
        models, hmk, wmk, options = [], [], [], []
        for it in sh['items']:
            uid += 1
            it['id'] = uid
            it['sheet'] = sh['sheet']
            n = it['name']
            if it['kind'] == 'pct' and re.match(r'^Наценка на высоту', n):
                hmk.append({'id': uid, 'name': n, 'pct': it['pct'], 'range': rng(n), 'group': it['group']})
                continue
            if it['kind'] == 'pct' and re.match(r'^(Наценка|Уценка) на ширину', n):
                r = rng(n)
                if r and n.startswith('Уценка') and 'менее' in n:
                    r = {'min': 0, 'max': r['max'], 'strict': False, 'below': True}
                wmk.append({'id': uid, 'name': n, 'pct': it['pct'], 'range': r, 'group': it['group']})
                continue
            is_model = (is_door and it['early'] and it['kind'] == 'price'
                        and not re.match(r'^(Наценка|Верхняя|Услуга|Комплект|Фрамуга)', n, re.I))
            if is_model:
                label = ' · '.join(a for a in it['attrs'])
                mdl = next((x for x in models if x['code'] == n), None)
                if not mdl:
                    mdl = {'code': n, 'variants': []}
                    models.append(mdl)
                if not any(v['label'] == label and v['price'] == it['price'] for v in mdl['variants']):
                    mdl['variants'].append({'id': uid, 'label': label, 'price': it['price'], 'unit': it['unit']})
            else:
                rec = {k: it[k] for k in ('id', 'sheet', 'section', 'sub', 'name', 'attrs', 'unit', 'price', 'pct', 'kind')}
                if it['kind'] == 'pct':
                    rec['range'] = rng(n)
                out['catalog'].append(rec)
                if is_door:
                    options.append(uid)
        if is_door:
            out['series'].append({'sheet': sh['sheet'], 'models': models, 'height': hmk, 'width': wmk, 'options': options})
    return out


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    data = build(open(src, encoding='utf-8').read())
    json.dump(data, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('серий:', len(data['series']), 'моделей:', sum(len(s['models']) for s in data['series']),
          'позиций каталога:', len(data['catalog']))
