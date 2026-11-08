#!/usr/bin/env python3
"""Фото ручек и фурнитуры с profildoors.ru (/findings/, /findings-orange/) → src/data/handle-photos.json.
Вход: выгрузка {pd: {заголовок: [пути]}, or: {...}}; пути: W: = /upload/dev2fun.imagecompress/webp/iblock/, I: = /upload/iblock/.
Выход: {id позиции прайса: [главное фото, {цвет: фото}]}."""
import json, re, sys

COLOR = [  # имя файла → цвет из прайса
    ('chrome-mat', 'хром матовый'), ('chrome-met', 'хром матовый'), ('chrome-gloss', 'хром глянец'), ('mat_khrom', 'хром матовый'), ('m_chr', 'хром матовый'), ('khrom', 'хром матовый'),
    ('bronze-mat', 'бронза матовая'), ('antbronze', 'античная бронза'), ('gold-gloss', 'золото глянец'), ('gold-mat', 'золото матовое'),
    ('w_gold', 'валлийское золото'), ('zoloto', 'валлийское золото'), ('imp', 'императорское золото'), ('gold', 'золото'),
    ('grey-night', 'серая ночь'), ('platinum_grey', 'платиново-серый'), ('mblack', 'матовый черный'), ('black', 'черный'), ('chernaya', 'черный'), ('_bl', 'черный'),
    ('white', 'вайт'), ('nikel', 'никель'), ('shampan', 'шампань'), ('silver', 'серебро'), ('deore', 'деоре'), ('smoki', 'смоки'),
    ('red-anthracite', 'красный антрацит'), ('green-wax', 'зелёный воск'),
]


ALIAS = {r'^ручка P30': 'DIRCODE', r'^ручка 612 на розетке': '612 WC', r'SMART WC': 'SMART LIFE'}


def url(p):
    return 'https://profildoors.ru' + p.replace('W:', '/upload/dev2fun.imagecompress/webp/iblock/', 1).replace('I:', '/upload/iblock/', 1)


def color_of(path):
    fn = path.rsplit('/', 1)[-1].lower()
    for k, c in COLOR:
        if k in fn:
            return c
    return None


def tokens(title):
    t = re.sub(r'^(Дверные ручки|ДВЕРНЫЕ РУЧКИ|РУЧКА-СКОБА|Смарт-ручка)\s*', '', title.strip(), flags=re.I)
    return [w.upper() for w in t.split() if w]


def norm_item(name):
    n = name.upper().replace('"', ' ').replace('«', ' ').replace('»', ' ')
    n = re.sub(r'\b360\s+PL\b', '360PL', n)
    return ' ' + re.sub(r'\s+', ' ', n) + ' '


def main(raw_path, price_path, out_path):
    raw = json.load(open(raw_path, encoding='utf-8'))
    price = json.load(open(price_path, encoding='utf-8'))
    groups = []
    for site, prods in raw.items():
        for title, paths in prods.items():
            groups.append((site, title, tokens(title), paths))
    out = {}
    for it in price['catalog']:
        if it['sheet'] not in ('Дверные ручки', 'Дверные ручки Orange'):
            continue
        n = norm_item(it['name'])
        # завертки Orange: фото есть отдельным файлом у ручек серии («Zavertka_OL_L_kvadratnaya_WC», «SILLUR_OL_L»)
        zm = re.match(r'^\s*Завертка\s+(SILLUR\s+)?([A-Z]{2}-?[A-Z0-9]*)', it['name'])
        if zm and it['sheet'] == 'Дверные ручки Orange':
            code = zm.group(2).replace('-', '_')
            round_ = 'кругл' in it['name']
            hits = [p for site, _, _, ps in groups if site == 'or' for p in ps]
            fn = lambda p: p.rsplit('/', 1)[-1]
            cand = [p for p in hits if code in fn(p) and ('avertka' in fn(p) or fn(p).startswith('SILLUR')) and (('kruglaya' in fn(p)) == round_ or not zm.group(1))]
            cand = [p for p in cand if ('SILLUR' in fn(p)) == bool(zm.group(1))]
            if cand:
                out[str(it['id'])] = [url(cand[0]), {}]
            continue
        if re.search(r'^\s*(завертка|розетка|накладка|цилиндр|планка|вставка)', it['name'], re.I):
            continue  # фото у сайта есть только у самих ручек
        for k, v in ALIAS.items():
            if re.search(k, it['name'], re.I):
                n = norm_item(v)
        best = None
        for site, title, tk, paths in groups:
            if (site == 'or') != (it['sheet'] == 'Дверные ручки Orange'):
                continue
            if 'РАЗДВИЖНЫХ' in tk:
                ok = 'РАЗДВИЖН' in n or 'COMPACK' in n
            else:
                ok = all(f' {w} ' in n for w in tk)
            if ok and (best is None or len(tk) > len(best[2])):
                best = (site, title, tk, paths)
        if not best:
            continue
        paths = best[3]
        main_p = next((p for p in paths if not color_of(p)), paths[0])
        if 'SMART WC' in it['name']:
            main_p = next((p for p in paths if 'smart-wc' in p), main_p)
        cols = {}
        for p in paths:
            c = color_of(p)
            if c and c not in cols:
                cols[c] = url(p)
        out[str(it['id'])] = [url(main_p), cols]
    json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    total = sum(1 for x in price['catalog'] if x['sheet'] in ('Дверные ручки', 'Дверные ручки Orange'))
    print('с фото:', len(out), 'из', total)


if __name__ == '__main__':
    main(*sys.argv[1:4])
