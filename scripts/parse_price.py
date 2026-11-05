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


def series_info(body):
    """Подсказки серии из шапки листа и примечаний: цвета профиля, покрытия/стёкла по категориям, допустимые размеры."""
    lines = [clean(l.strip().strip('"').replace('""', '"')) for l in body.split('\n')]
    head = []
    for l in lines:
        if l.startswith('Модель,') or l.startswith('Модель '):
            break
        head.append(l)
    profile, blocks, ctx_series, ctx = [], [], '', ''
    for l in head:
        if not l or l == 'Вернуться к содержанию':
            continue
        m = re.match(r'^Порошковая окраска( под эмаль)?:\s*(.+?)\.?$', l)
        if m:
            for c in re.split(r',\s*', m.group(2)):
                c = c.strip().rstrip('.')
                if c and c not in profile:
                    profile.append(c)
            continue
        if re.match(r'^Серия\s+\S+$', l):
            ctx_series, ctx = l, ''
            continue
        if re.match(r'^(Категория \d|Вставки|Цвета алюминиевого|Остекление|Стекло \d)', l) and ':' not in l.rstrip(':'):
            ctx = l.rstrip(':').strip()
            if ctx.startswith('Остекление'):
                ctx = ''
            elif re.match(r'^Стекло \d', ctx):
                ctx = 'Вставки стекла: ' + ctx      # PD: «Стекло 1», «Стекло 2» — стекло в полотне, наценка за «Стекло 2»
            continue
        if l.startswith('Толщина'):
            continue
        m = re.match(r'^([^:]{2,160}):\s*(.+)$', l)
        if m and (',' in m.group(2) or re.search(r'NCS|RAL', m.group(2)) or ctx.startswith('Вставки стекла: ')):
            typ = m.group(1).strip()
            items = [x.strip().rstrip('.:').strip() for x in re.split(r',\s*', m.group(2)) if x.strip().rstrip('.:').strip()]
            if typ.startswith('Вставки') or typ.startswith('Цвета алюминиевого'):
                ctx, typ = typ, 'Варианты'
            title = ' · '.join(x for x in (ctx_series, ctx) if x)
            cat = re.search(r'(?:Категория|Стекло) (\d)', ctx)
            blk = next((b for b in blocks if b['title'] == title), None)
            if not blk:
                blk = {'title': title, 'cat': int(cat.group(1)) if cat else None, 'insert': ctx.startswith('Вставки'), 'lists': []}
                blocks.append(blk)
            if typ == 'Варианты' and all(re.match(r'^[\d.]+$', x) for x in items):
                blk['models'] = items          # «Вставки стекла в полотно для моделей: 18, 19, 21»
            else:
                blk['lists'].append({'type': typ, 'items': items})
            if blk['insert'] and 'models' not in blk and 'модел' in ctx:
                nums = re.findall(r'\b\d+(?:\.\d+)?\b', ctx)
                if nums:
                    blk['models'] = nums
    sizes = []
    for l in lines:
        if re.search(r'(изготавлива\w*|производ\w*)\s+по\s+(высоте|ширине)', l) or re.search(r'^Стандартный шаг|^Шаг полотна', l):
            t = l.strip()
            if t and t not in sizes:
                sizes.append(t)
    def rng_of(kind):
        for t in sizes:
            if 'модел' in t.lower() and not re.search(r'модел\w*:\s*0 ', t):
                continue
            if kind == 'ширине' and not re.search(r'распашн', t):
                continue
            m = re.search(r'по ' + kind + r'[^0-9]*от (\d{3,4}) мм до (\d{3,4}) мм', t)
            if m:
                return [int(m.group(1)), int(m.group(2))]
        return None
    return {'profile': profile, 'blocks': blocks, 'sizes': sizes, 'h': rng_of('высоте'), 'w': rng_of('ширине')}


def build(text):
    sheets = parse(text)
    bodies = dict(split_sheets(text))
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
                # «Категория 1"""» под заголовком «Притворная планка» — это сама планка в покрытии этой категории
                cm = re.match(r'^Категория\s*(\d)["»]*$', rec['name'].strip())
                if cm and 'Притворная планка' in (rec['sub'] or ''):
                    rec['name'] = f'Притворная планка "Категория {cm.group(1)}"'
                if it['kind'] == 'pct':
                    rec['range'] = rng(n)
                out['catalog'].append(rec)
                if is_door:
                    options.append(uid)
        if is_door:
            out['series'].append({'sheet': sh['sheet'], 'models': models, 'height': hmk, 'width': wmk, 'options': options,
                                  'info': series_info(bodies[sh['sheet']])})
    expand_colors(out, bodies)
    fix_pogonazh_section(out)
    return out


def fix_pogonazh_section(out):
    """P, N и PD: блок «Дверной погонаж» идёт сразу за «Ответная распашная дверь (B-полотно)» и сливается с ним — отделяем."""
    for sheet in ('P, N', 'PD'):
        items = [x for x in out['catalog'] if x['sheet'] == sheet]
        start = next((k for k, x in enumerate(items) if x['name'].strip().startswith('Коробка')), None)
        if start is None:
            continue
        for x in items[start:]:
            if x['section'] == 'Ответная распашная дверь (B-полотно)':
                x['section'] = 'Дверной погонаж'
                if (x['sub'] or '').startswith('Категория'):
                    x['sub'] = ''


COLOR_SHEETS = ('Петли', 'Замки')


def expand_colors(out, bodies):
    """«…, цвет 1» → по позиции на каждый цвет из пояснения «Цвет 1: хром матовый, белый матовый…»
    (тоже для «Цвет: …» и «Цвета покраски KRONA KOBLENZ: …»). Первая позиция сохраняет свой id."""
    next_id = max(x['id'] for x in out['catalog']) + 1
    res = []
    for it in out['catalog']:
        if it['sheet'] not in COLOR_SHEETS or it['kind'] != 'price':
            res.append(it)
            continue
        lines = [clean(l.strip().strip('"').replace('""', '"')) for l in bodies.get(it['sheet'], '').splitlines()]
        base = re.sub(r'[,\s]*[Цц]вет\s*\d\s*$', '', it['name']).strip()
        num = re.search(r'[Цц]вет\s*(\d)\s*$', it['name'])
        pos = next((i for i, l in enumerate(lines) if l.startswith(it['name'].strip()) or (num is None and l.startswith(base + ','))), None)
        colors = None
        if pos is not None:
            win = lines[pos + 1:pos + 16]
            stop = next((j for j, l in enumerate(win) if re.match(r'^Модель,', l)), len(win))
            win = win[:max(0, stop - 1)] if stop < len(win) else win
            if num:
                m = next((re.match(rf'^Цвет {num.group(1)}:\s*(.+?)\.?\s*$', l) for l in win if re.match(rf'^Цвет {num.group(1)}:', l)), None)
                if m:
                    colors = m.group(1)
                elif num.group(1) == '2':
                    m = next((re.match(r'^Цвета покраски PROFILDOORS:\s*(.+?)\.?\s*$', l) for l in win if l.startswith('Цвета покраски PROFILDOORS:')), None)
                    if m:
                        colors = ', '.join(f'{c.strip()} (покраска)' for c in m.group(1).split(','))
            else:
                cands = [l for l in win[:6] if re.match(r'^(Цвет|Цвета покраски (?!PROFILDOORS))[^:]*:', l)]
                tail = re.search(r'(\d+)\s*$', base)
                if tail and len(cands) > 1:  # «КМ 7» — берём строку про свою планку («RV 7»), а не про соседнюю
                    cands = [l for l in cands if re.search(rf'\b{tail.group(1)}\b', l.split(':')[0])] or cands[:1]
                m = re.match(r'^(?:Цвет|Цвета покраски [^:]+):\s*(.+?)\.?\s*$', cands[0]) if cands else None
                if m:
                    colors = m.group(1)
        if not colors:
            res.append(it)
            continue
        for k, c in enumerate([c.strip() for c in colors.split(',') if c.strip()]):
            rec = dict(it, name=f'{base}, {c[0].lower() + c[1:]}')
            if k:
                rec['id'] = next_id
                next_id += 1
            res.append(rec)
    out['catalog'] = res


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    data = build(open(src, encoding='utf-8').read())
    json.dump(data, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('серий:', len(data['series']), 'моделей:', sum(len(s['models']) for s in data['series']),
          'позиций каталога:', len(data['catalog']))
