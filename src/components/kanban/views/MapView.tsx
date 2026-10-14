import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Loader2, Search, X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { geocodeAddress, searchAddresses, labelHex, updateCard, createCard, positionBetween, type KCard, type KList } from '@/lib/kanban';

/**
 * Вид «Карта»: карточки с адресом — точками на карте (OpenStreetMap).
 * Адрес вводится в карточке; координаты находятся автоматически.
 */
export default function MapView({ boardId, lists, cards, onOpen, onChanged, readOnly }: {
  boardId: string; lists: KList[]; cards: KCard[]; onOpen: (id: string) => void; onChanged: () => void; readOnly?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ label: string; lat: number; lng: number }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newList, setNewList] = useState('');
  const searchMarker = useRef<L.Marker | null>(null);

  async function runSearch() {
    const text = q.trim();
    if (text.length < 3) return;
    setSearching(true);
    // сначала среди карточек доски, потом — на карте города
    const own = cards.filter(c => (c.address ?? '').toLowerCase().includes(text.toLowerCase()) || c.title.toLowerCase().includes(text.toLowerCase()));
    const geo = await searchAddresses(/шымкент|алматы|астана|тараз|туркестан/i.test(text) ? text : `${text}, Шымкент`);
    setSearching(false);
    setResults([
      ...own.filter(c => c.lat != null).map(c => ({ label: `Карточка: ${c.title}`, lat: c.lat!, lng: c.lng! })),
      ...geo,
    ]);
  }
  function goTo(r: { label: string; lat: number; lng: number }) {
    if (!map.current) return;
    map.current.setView([r.lat, r.lng], 17);
    searchMarker.current?.remove();
    searchMarker.current = L.marker([r.lat, r.lng], {
      icon: L.divIcon({ className: '', html: '<div style="width:18px;height:18px;border-radius:50%;background:#e2483d;border:3px solid white;box-shadow:0 0 0 2px #e2483d55,0 1px 4px rgba(0,0,0,.4)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    }).addTo(map.current);
    setResults(null);
    if (!r.label.startsWith('Карточка: ')) { setPicked(r); setNewTitle(''); setNewList(lists[0]?.id ?? ''); }
  }
  async function createHere() {
    if (!picked || !newTitle.trim() || !newList) return;
    const tail = cards.filter(c => c.list_id === newList).sort((a, b) => a.position - b.position).slice(-1)[0];
    const id = await createCard(boardId, newList, newTitle.trim(), positionBetween(tail?.position, undefined));
    if (id) await updateCard(id, { address: picked.label, lat: picked.lat, lng: picked.lng });
    toast.success('Карточка создана с этим адресом');
    setPicked(null); searchMarker.current?.remove(); onChanged();
  }
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const located = cards.filter(c => c.lat != null && c.lng != null);
  const pending = cards.filter(c => c.address && (c.lat == null || c.lng == null));
  const noAddress = cards.filter(c => !c.address);

  useEffect(() => {
    if (!el.current || map.current) return;
    // без значка «Leaflet» с флагом; ссылку на OpenStreetMap оставляем — это условие использования карты
    map.current = L.map(el.current, { zoomControl: true, attributionControl: false }).setView([42.3417, 69.5901], 12); // Шымкент
    L.control.attribution({ prefix: false }).addTo(map.current);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const c of located) {
      const l = lists.find(x => x.id === c.list_id);
      const color = c.cover_color ? labelHex(c.cover_color) : l?.color ? labelHex(l.color) : '#1f6f5c';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
        iconSize: [26, 26], iconAnchor: [13, 26],
      });
      const m = L.marker([c.lat!, c.lng!], { icon, title: c.title });
      const div = document.createElement('div');
      div.style.minWidth = '160px';
      div.innerHTML = `<div style="font-weight:600;margin-bottom:2px"></div><div style="font-size:12px;color:#666"></div><div style="font-size:12px;margin-top:2px"></div><a href="#" style="font-size:12px">Открыть карточку</a>`;
      (div.children[0] as HTMLElement).textContent = c.title;
      (div.children[1] as HTMLElement).textContent = l?.title ?? '';
      (div.children[2] as HTMLElement).textContent = c.address ?? '';
      (div.children[3] as HTMLElement).onclick = ev => { ev.preventDefault(); onOpen(c.id); };
      m.bindPopup(div);
      m.addTo(layer.current);
      pts.push([c.lat!, c.lng!]);
    }
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
  }, [located.map(c => `${c.id}:${c.lat}:${c.lng}:${c.list_id}`).join('|')]);

  // Найти координаты для карточек с адресом (не чаще 1 запроса в секунду — правило OpenStreetMap)
  async function locateAll() {
    setBusy(true);
    let found = 0;
    for (const c of pending) {
      const p = await geocodeAddress(c.address!);
      if (p) { await updateCard(c.id, { lat: p.lat, lng: p.lng }); found += 1; }
      await new Promise(r => setTimeout(r, 1100));
    }
    setBusy(false);
    toast[found ? 'success' : 'error'](found ? `Найдено на карте: ${found} из ${pending.length}` : 'Адреса не найдены — уточните их (город, улица, дом)');
    onChanged();
  }

  return (
    <div className="h-full p-3 md:p-4 flex flex-col gap-3 md:flex-row">
      <div className="relative flex-1 min-h-[360px] rounded-xl overflow-hidden shadow-sm bg-card">
        <div ref={el} className="w-full h-full min-h-[360px]" />
        {/* поиск по адресу */}
        <div className="absolute left-14 right-3 top-3 z-[500] max-w-md">
          <form onSubmit={e => { e.preventDefault(); runSearch(); }} className="flex items-center gap-1.5 rounded-xl bg-card/95 backdrop-blur shadow-md px-2.5 py-1.5">
            <Search size={15} className="text-muted-foreground shrink-0" />
            <input value={q} onChange={e => { setQ(e.target.value); if (!e.target.value) setResults(null); }}
              placeholder="Найти адрес: мкр Нурсат, Байдибек би 120…" className="flex-1 bg-transparent outline-none text-sm py-1 min-w-0" />
            {q && <button type="button" aria-label="Очистить" onClick={() => { setQ(''); setResults(null); setPicked(null); searchMarker.current?.remove(); }}><X size={15} className="text-muted-foreground" /></button>}
            <Button type="submit" size="sm" className="h-7" disabled={searching || q.trim().length < 3}>{searching ? <Loader2 size={13} className="animate-spin" /> : 'Найти'}</Button>
          </form>
          {results && (
            <div className="mt-1.5 rounded-xl bg-card shadow-md overflow-hidden max-h-72 overflow-y-auto">
              {results.length === 0 ? <div className="px-3 py-2.5 text-sm text-muted-foreground">Ничего не нашлось. Попробуйте улицу и номер дома.</div>
                : results.map((r, i) => (
                  <button key={i} type="button" onClick={() => goTo(r)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b border-border last:border-0">
                    <MapPin size={12} className="inline mr-1.5 text-muted-foreground" />{r.label}
                  </button>
                ))}
            </div>
          )}
          {picked && !readOnly && (
            <div className="mt-1.5 rounded-xl bg-card shadow-md p-3 space-y-2">
              <div className="text-xs text-muted-foreground">{picked.label}</div>
              <Input className="h-8" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Новая карточка: клиент, что заказал" />
              <div className="flex gap-1.5">
                <select className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm" value={newList} onChange={e => setNewList(e.target.value)}>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
                <Button size="sm" className="h-8" disabled={!newTitle.trim()} onClick={createHere}><Plus size={13} className="mr-1" />Создать</Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setPicked(null)}><X size={14} /></Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <aside className="md:w-72 shrink-0 rounded-xl bg-card shadow-sm p-3 space-y-3 overflow-y-auto">
        <div className="text-sm font-semibold flex items-center gap-1.5"><MapPin size={14} />На карте: {located.length}</div>
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
              onClick={() => { map.current?.setView([c.lat!, c.lng!], 16); }}>
              <div className="truncate">{c.title}</div>
              <div className="text-[11px] text-muted-foreground truncate">{c.address}</div>
            </button>
          ))}
        </div>
        {noAddress.length > 0 && (
          <div className="text-xs text-muted-foreground border-t border-border pt-2">
            Без адреса: {noAddress.length}. Откройте карточку и заполните «Адрес», чтобы она появилась на карте.
          </div>
        )}
      </aside>
    </div>
  );
}
