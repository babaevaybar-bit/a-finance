import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Loader2, Search, X, Plus, Crosshair, ExternalLink, KeyRound, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  geocodeAddress, searchAddresses, dgisConfigured, setDgisKey, dgisLink, labelHex, updateCard, createCard, positionBetween,
  type GeoResult, type KCard, type KList,
} from '@/lib/kanban';

const pinHtml = (color: string) =>
  `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`;
const searchDot = '<div style="width:18px;height:18px;border-radius:50%;background:#e2483d;border:3px solid white;box-shadow:0 0 0 3px #e2483d55,0 1px 4px rgba(0,0,0,.4)"></div>';

/**
 * Вид «Карта»: карточки с адресом — точками на карте.
 * Поиск адреса идёт через 2ГИС (если подключён ключ), иначе через OpenStreetMap.
 * Если адрес не находится — точку можно поставить кликом по карте.
 */
export default function MapView({ boardId, lists, cards, onOpen, onChanged, readOnly }: {
  boardId: string; lists: KList[]; cards: KCard[]; onOpen: (id: string) => void; onChanged: () => void; readOnly?: boolean;
}) {
  const { isDirector } = useAuth();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const searchMarker = useRef<L.Marker | null>(null);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [source, setSource] = useState<'2gis' | 'osm' | 'none'>('none');
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<GeoResult | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newList, setNewList] = useState('');
  const [attachTo, setAttachTo] = useState('');
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  const [has2gis, setHas2gis] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState('');
  // Ползунок «Ключ API»: блок с ключом скрыт, пока его не откроют (положение запоминается)
  const [showKey, setShowKeyState] = useState(() => { try { return localStorage.getItem('afin-dgis-key-open') === '1'; } catch { return false; } });
  const setShowKey = (v: boolean) => { setShowKeyState(v); if (!v) setKeyInput(''); try { localStorage.setItem('afin-dgis-key-open', v ? '1' : '0'); } catch { /* ignore */ } };

  const located = cards.filter(c => c.lat != null && c.lng != null);
  const pending = cards.filter(c => c.address && (c.lat == null || c.lng == null));
  const noPoint = cards.filter(c => c.lat == null || c.lng == null);

  useEffect(() => { dgisConfigured().then(setHas2gis).catch(() => setHas2gis(false)); }, []);

  useEffect(() => {
    if (!el.current || map.current) return;
    // без значка «Leaflet» с флагом; ссылку на OpenStreetMap оставляем — это условие использования карты
    map.current = L.map(el.current, { zoomControl: true, attributionControl: false }).setView([42.3417, 69.5901], 12); // Шымкент
    L.control.attribution({ prefix: false }).addTo(map.current);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    map.current.on('click', (e: L.LeafletMouseEvent) => {
      if (!placingRef.current) return;
      placingRef.current = false; setPlacing(false);
      choose({ label: 'Точка на карте', sub: `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`, lat: e.latlng.lat, lng: e.latlng.lng }, false);
    });
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const c of located) {
      const l = lists.find(x => x.id === c.list_id);
      const color = c.cover_color ? labelHex(c.cover_color) : l?.color ? labelHex(l.color) : '#1f6f5c';
      const m = L.marker([c.lat!, c.lng!], { icon: L.divIcon({ className: '', html: pinHtml(color), iconSize: [26, 26], iconAnchor: [13, 26] }), title: c.title });
      const div = document.createElement('div');
      div.style.minWidth = '170px';
      div.innerHTML = '<div style="font-weight:600;margin-bottom:2px"></div><div style="font-size:12px;color:#666"></div><div style="font-size:12px;margin:2px 0 4px"></div><a href="#" style="font-size:12px">Открыть карточку</a>';
      (div.children[0] as HTMLElement).textContent = c.title;
      (div.children[1] as HTMLElement).textContent = l?.title ?? '';
      (div.children[2] as HTMLElement).textContent = c.address ?? '';
      (div.children[3] as HTMLElement).onclick = ev => { ev.preventDefault(); onOpen(c.id); };
      m.bindPopup(div).addTo(layer.current);
      pts.push([c.lat!, c.lng!]);
    }
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 15 });
  }, [located.map(c => `${c.id}:${c.lat}:${c.lng}:${c.list_id}`).join('|')]);

  async function runSearch() {
    const text = q.trim();
    if (text.length < 2) return;
    setSearching(true); setPicked(null);
    const low = text.toLowerCase();
    const own: GeoResult[] = cards.filter(c => c.lat != null && ((c.address ?? '').toLowerCase().includes(low) || c.title.toLowerCase().includes(low)))
      .map(c => ({ label: c.title, sub: `карточка · ${c.address ?? ''}`, lat: c.lat!, lng: c.lng! }));
    const r = await searchAddresses(text);
    setSearching(false);
    setSource(r.source);
    if (r.warning) toast.error(r.warning);
    setResults([...own, ...r.results]);
  }

  function choose(r: GeoResult, fromSearch = true) {
    if (!map.current) return;
    map.current.setView([r.lat, r.lng], Math.max(map.current.getZoom(), 17));
    searchMarker.current?.remove();
    searchMarker.current = L.marker([r.lat, r.lng], { icon: L.divIcon({ className: '', html: searchDot, iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map.current);
    setResults(null);
    if (fromSearch && r.sub?.startsWith('карточка')) return;
    setPicked(r); setNewTitle(''); setNewList(lists[0]?.id ?? ''); setAttachTo('');
  }

  const pickedAddress = (r: GeoResult) => r.label === 'Точка на карте' ? (q.trim() || r.sub || '') : [r.label, r.sub].filter(Boolean).join(', ');

  async function createHere() {
    if (!picked || !newTitle.trim() || !newList) return;
    const tail = cards.filter(c => c.list_id === newList).sort((a, b) => a.position - b.position).slice(-1)[0];
    const id = await createCard(boardId, newList, newTitle.trim(), positionBetween(tail?.position, undefined));
    if (id) await updateCard(id, { address: pickedAddress(picked), lat: picked.lat, lng: picked.lng });
    toast.success('Карточка создана с этим адресом');
    setPicked(null); searchMarker.current?.remove(); onChanged();
  }
  async function attachHere() {
    if (!picked || !attachTo) return;
    const c = cards.find(x => x.id === attachTo);
    await updateCard(attachTo, { lat: picked.lat, lng: picked.lng, ...(c?.address ? {} : { address: pickedAddress(picked) }) });
    toast.success('Точка привязана к карточке');
    setPicked(null); searchMarker.current?.remove(); onChanged();
  }

  async function locateAll() {
    setBusy(true);
    let found = 0;
    for (const c of pending) {
      const p = await geocodeAddress(c.address!);
      if (p) { await updateCard(c.id, { lat: p.lat, lng: p.lng }); found += 1; }
    }
    setBusy(false);
    toast[found ? 'success' : 'error'](found ? `Найдено на карте: ${found} из ${pending.length}` : 'Адреса не найдены — поставьте точки вручную кликом по карте');
    onChanged();
  }

  return (
    <div className="h-full p-3 md:p-4 flex flex-col gap-3 md:flex-row">
      <div className={`relative isolate z-0 flex-1 min-h-[360px] rounded-xl overflow-hidden shadow-sm bg-card ${placing ? '[&_.leaflet-container]:cursor-crosshair' : ''}`}>
        <div ref={el} className="w-full h-full min-h-[360px]" />

        <div className="absolute left-14 right-3 top-3 z-[500] max-w-md space-y-1.5">
          <form onSubmit={e => { e.preventDefault(); runSearch(); }} className="flex items-center gap-1.5 rounded-xl bg-card/95 backdrop-blur shadow-md px-2.5 py-1.5">
            <Search size={15} className="text-muted-foreground shrink-0" />
            <input value={q} onChange={e => { setQ(e.target.value); if (!e.target.value) setResults(null); }}
              placeholder={has2gis ? 'Поиск в 2ГИС: ЖК, улица, организация' : 'Найти адрес: улица и дом, мкр'} className="flex-1 bg-transparent outline-none text-sm py-1 min-w-0" />
            {q && <button type="button" aria-label="Очистить" onClick={() => { setQ(''); setResults(null); setPicked(null); searchMarker.current?.remove(); }}><X size={15} className="text-muted-foreground" /></button>}
            <Button type="submit" size="sm" className="h-7" disabled={searching || q.trim().length < 2}>{searching ? <Loader2 size={13} className="animate-spin" /> : 'Найти'}</Button>
          </form>

          {results && (
            <div className="rounded-xl bg-card shadow-md overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                {results.length === 0 && <div className="px-3 py-2.5 text-sm text-muted-foreground">Ничего не нашлось.</div>}
                {results.map((r, i) => (
                  <button key={i} type="button" onClick={() => choose(r)} className="w-full text-left px-3 py-2 hover:bg-muted border-b border-border last:border-0">
                    <div className="text-sm flex items-start gap-1.5"><MapPin size={13} className="mt-0.5 text-muted-foreground shrink-0" />{r.label}</div>
                    {r.sub && <div className="text-[11px] text-muted-foreground pl-5 truncate">{r.sub}</div>}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/40 text-xs">
                <span className="text-muted-foreground">{source === '2gis' ? 'Поиск: 2ГИС' : 'Поиск: OpenStreetMap'}</span>
                <a href={dgisLink(q)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Открыть в 2ГИС<ExternalLink size={11} /></a>
                {!readOnly && <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline ml-auto" onClick={() => { setResults(null); placingRef.current = true; setPlacing(true); }}><Crosshair size={12} />Поставить точку вручную</button>}
              </div>
            </div>
          )}

          {placing && (
            <div className="rounded-xl bg-primary text-primary-foreground shadow-md px-3 py-2 text-sm flex items-center gap-2">
              <Crosshair size={14} />Нажмите на карте, где находится объект
              <button type="button" className="ml-auto underline text-xs" onClick={() => { placingRef.current = false; setPlacing(false); }}>Отмена</button>
            </div>
          )}

          {picked && !readOnly && (
            <div className="rounded-xl bg-card shadow-md p-3 space-y-2.5">
              <div>
                <div className="text-sm font-medium">{picked.label}</div>
                {picked.sub && <div className="text-[11px] text-muted-foreground">{picked.sub}</div>}
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">Новая карточка здесь</div>
                <Input className="h-8" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Клиент, что заказал" />
                <div className="flex gap-1.5">
                  <select className="h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-sm" value={newList} onChange={e => setNewList(e.target.value)}>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                  </select>
                  <Button size="sm" className="h-8" disabled={!newTitle.trim()} onClick={createHere}><Plus size={13} className="mr-1" />Создать</Button>
                </div>
              </div>
              {noPoint.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-2">
                  <div className="text-xs font-semibold text-muted-foreground">или привязать к карточке без точки</div>
                  <div className="flex gap-1.5">
                    <select className="h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-sm" value={attachTo} onChange={e => setAttachTo(e.target.value)}>
                      <option value="">выберите карточку</option>
                      {noPoint.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    <Button size="sm" variant="outline" className="h-8" disabled={!attachTo} onClick={attachHere}><Link2 size={13} className="mr-1" />Привязать</Button>
                  </div>
                </div>
              )}
              <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => { setPicked(null); searchMarker.current?.remove(); }}>Закрыть</button>
            </div>
          )}
        </div>
      </div>

      <aside className="md:w-72 shrink-0 rounded-xl bg-card shadow-sm p-3 space-y-3 overflow-y-auto flex flex-col">
        <div className="text-sm font-semibold flex items-center gap-1.5"><MapPin size={14} />На карте: {located.length}</div>

        {!readOnly && (
          <Button size="sm" variant="outline" className="w-full h-8" onClick={() => { placingRef.current = true; setPlacing(true); }}>
            <Crosshair size={13} className="mr-1.5" />Поставить точку кликом
          </Button>
        )}

        {pending.length > 0 && !readOnly && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 space-y-2">
            <div>У {pending.length} карточек есть адрес, но точка ещё не найдена.</div>
            <Button size="sm" className="w-full h-8" disabled={busy} onClick={locateAll}>
              {busy ? <><Loader2 size={13} className="mr-1.5 animate-spin" />Ищу…</> : 'Найти на карте'}
            </Button>
          </div>
        )}

        <div className="space-y-1">
          {located.map(c => (
            <button key={c.id} type="button" className="w-full text-left rounded px-2 py-1.5 hover:bg-muted text-sm"
              onClick={() => { map.current?.setView([c.lat!, c.lng!], 17); }}>
              <div className="truncate">{c.title}</div>
              <div className="text-[11px] text-muted-foreground truncate">{c.address}</div>
            </button>
          ))}
        </div>

        {noPoint.length > 0 && (
          <div className="text-xs text-muted-foreground border-t border-border pt-2">
            Без точки на карте: {noPoint.length}. Найдите адрес сверху или поставьте точку кликом — и привяжите к карточке.
          </div>
        )}

        {/* 2ГИС — только для директора; весь блок прячется ползунком (положение запоминается) */}
        {isDirector && (
          <div className="border-t border-border pt-2 mt-auto">
            <div className="flex items-center justify-end gap-1.5">
              <KeyRound size={12} className="text-muted-foreground/60" aria-hidden />
              <Switch checked={showKey || has2gis === false} disabled={has2gis === false} onCheckedChange={setShowKey}
                aria-label="Показать или скрыть настройки 2ГИС" title="Настройки 2ГИС" className="scale-75 origin-right" />
            </div>
            {(showKey || has2gis === false) && (
              <div className="space-y-2 pt-1">
                <div className="text-xs font-semibold flex items-center gap-1.5"><KeyRound size={12} />2ГИС</div>
                {has2gis ? (
                  <div className="text-xs text-green-700">Подключён: поиск идёт по базе 2ГИС (ЖК, организации, адреса).</div>
                ) : (
                  <div className="text-xs text-muted-foreground">Сейчас поиск идёт по OpenStreetMap — там нет многих ЖК. С ключом 2ГИС поиск будет как в приложении 2ГИС.</div>
                )}
                <div className="space-y-1.5">
                  {/* type="text" + маскировка: браузер не подставляет сюда сохранённый пароль от сайта */}
                  <Input className="h-8 text-xs [-webkit-text-security:disc]" type="text" name="dgis-api-key" inputMode="text"
                    autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-1p-ignore
                    value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder={has2gis ? 'Новый ключ 2ГИС' : 'Вставьте ключ 2ГИС'} />
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7 text-xs flex-1" disabled={!keyInput.trim()} onClick={async () => {
                      const key = keyInput.trim();
                      if (key.length < 20 || /\s/.test(key)) { toast.error('Это не похоже на ключ 2ГИС — скопируйте ключ из Platform Manager'); return; }
                      try { await setDgisKey(key); setKeyInput(''); setHas2gis(true); setShowKey(false); toast.success('Ключ 2ГИС сохранён'); }
                      catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось сохранить'); }
                    }}>Сохранить ключ</Button>
                    {has2gis && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={async () => { await setDgisKey(''); setHas2gis(false); toast('Ключ 2ГИС удалён'); }}>Отключить</Button>}
                  </div>
                  <a href="https://platform.2gis.ru/" target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">Где взять ключ: Platform Manager 2ГИС<ExternalLink size={10} /></a>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
