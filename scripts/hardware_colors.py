"""Цвета ручек и фурнитуры из текстового прайса PROFILDOORS → src/data/hardware-colors.json
{ id позиции прайса: ["хром матовый", ...] }.
В прайсе после строк позиций идёт «Цвета покраски COMIT: … Цвета покраски PROFILDOORS: …» —
относится ко всем позициям выше до предыдущей строки цветов / заголовка раздела.
Запуск: python3 scripts/hardware_colors.py <прайс.txt>"""
import csv, io, json, re, sys
SHEETS = ['Дверные ручки', 'Дверные ручки Orange', 'Прочая фурнитура']
raw = open(sys.argv[1], encoding='utf-8').read()
cat = json.load(open('src/data/price.json', encoding='utf-8'))['catalog']
norm = lambda s: re.sub(r'[\s"«»]+', ' ', s).strip().lower()

def parse_colors(line):
    """→ {brand or '': [colors]}"""
    out = {}
    for m in re.finditer(r'Цвета?\s+покраски\s*([A-ZА-Я][A-Za-zА-Яа-я ]*?)?\s*\d?\s*:\s*([^.]+)', line):
        brand = (m.group(1) or '').strip().upper()
        cols = [c.strip() for c in m.group(2).split(',') if c.strip()]
        out[brand] = [c[0].lower() + c[1:] if c[:1].isupper() and not brand == 'PROFILDOORS' else c for c in cols]
    return out

res = {}
for sheet in SHEETS:
    body = '\n'.join(m.group(1) for m in re.finditer(rf'## Sheet name: {re.escape(sheet)}\n(.*?)(?=\n## Sheet name:|\Z)', raw, re.S))
    if not body: continue
    items = [it for it in cat if it['sheet'] == sheet and it['kind'] == 'price']
    used = set()
    pending = []          # [(name, brand)]
    last_name = None
    after_colors = False
    for row in csv.reader(io.StringIO(body)):
        cells = [c.strip() for c in row]
        line = ','.join(cells).strip(',')
        if not line: continue
        if re.search(r'Цвета?\s+покраски', line):
            cols = parse_colors(line)
            for name, brand in pending:
                c = cols.get(brand) or (cols.get('') if brand not in ('PROFILDOORS',) else None) or (list(cols.values())[0] if len(cols) == 1 and brand in ('', 'ИТАЛИЯ') else None)
                if not c: continue
                for it in items:
                    if it['id'] in used: continue
                    b = (it['attrs'][-1] if it['attrs'] else '').strip().upper()
                    b = b if not re.search(r'шт', b, re.I) else ''
                    if norm(it['name']) == norm(name) and b == brand:
                        res[it['id']] = c; used.add(it['id']); break
            after_colors = True
            continue
        # строка позиции: есть цена в последней непустой ячейке
        if re.search(r'\d[\d\s]*\s*[₸₽]\s*$', line) and len(cells) >= 3:
            name = cells[0] or last_name
            if not name: continue
            if after_colors: pending = []; after_colors = False
            last_name = name
            brand = next((c for c in cells[3:6] if re.fullmatch(r'[A-Z][A-Z ]+|Италия', c or '')), '')
            if not brand:
                brand = next((c for c in cells[2:5] if re.fullmatch(r'[A-Z][A-Z ]+', c or '')), '')
            pending.append((name, brand.upper()))
        elif len([c for c in cells if c]) == 1 and cells[0] and not line.rstrip().endswith('.') and len(line) < 120 and not re.search(r'Цвет|комплект|необходимо|указывать', line, re.I):
            pending = []; after_colors = False   # заголовок раздела
json.dump({str(k): v for k, v in sorted(res.items())}, open('src/data/hardware-colors.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
tot = sum(1 for it in cat if it['sheet'] in SHEETS and it['kind'] == 'price')
print(f'цвета найдены для {len(res)} из {tot} позиций')
