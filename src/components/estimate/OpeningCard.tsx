import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, Trash2, Plus, AlertTriangle, ChevronDown, ChevronUp, LayoutGrid, Search, Check, Maximize2 } from 'lucide-react';
import { SERIES, fmt, type Series } from '@/lib/estimate/doors';
import { OPEN_TYPES, isDouble, leavesOf, leafSizes, leafUnits, doorUnit, transomUnit, openingTotal, seriesById, lineFromCatalog, type Opening, type Line, type DoorSpec, type LeafSize } from '@/lib/estimate/model';
import usePhotoCatalog from '@/lib/estimate/usePhotoCatalog';
import { modelEntries, entryPhoto, seriesView, swatchUrl, type ModelEntry, type PhotoCatalog, type ColorDef } from '@/lib/estimate/photos';
import CatalogPicker from './CatalogPicker';

const groups = [...new Set(SERIES.map(s => s.group))];
const sel = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';
const pill = (on: boolean) => `h-8 px-3 rounded-full text-sm border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted/60'}`;

export function LinesTable({ lines, onChange, mult = 1 }: { lines: Line[]; onChange: (l: Line[]) => void; mult?: number }) {
  if (!lines.length) return null;
  const upd = (id: string, p: Partial<Line>) => onChange(lines.map(l => l.id === id ? { ...l, ...p } : l));
  return (
    <div className="divide-y rounded-lg border">
      {lines.map(l => (
        <div key={l.id} className="px-3 py-2 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px]">
            {l.itemId ? (
              <>
                <p className="text-sm"><span className="text-xs text-muted-foreground mr-1.5">{l.kind}</span>{l.name}</p>
                {(l.spec || l.maker) && <p className="text-xs text-muted-foreground">{[l.spec, l.maker].filter(Boolean).join(' · ')}</p>}
              </>
            ) : (
              <div className="flex gap-2">
                <Input value={l.kind} onChange={e => upd(l.id, { kind: e.target.value })} className="h-8 w-28" placeholder="Тип" />
                <Input value={l.name} onChange={e => upd(l.id, { name: e.target.value })} className="h-8" placeholder="Название" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {l.itemId ? <span className="text-sm tabular-nums w-24 text-right">{fmt(l.price)}</span>
              : <Input type="number" inputMode="decimal" value={l.price || ''} onChange={e => upd(l.id, { price: Number(e.target.value) || 0 })} className="h-8 w-28 text-right" placeholder="Цена" />}
            <span className="text-xs text-muted-foreground">×</span>
            <Input type="number" inputMode="decimal" min={0} step="any" value={l.qty} onChange={e => upd(l.id, { qty: Number(e.target.value) || 0 })} className="h-8 w-16 text-right" />
            <span className="text-xs text-muted-foreground w-8">{l.unit}</span>
            <span className="text-sm font-medium tabular-nums w-28 text-right">{fmt(l.price * l.qty * mult)}</span>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onChange(lines.filter(x => x.id !== l.id))} aria-label="Удалить"><Trash2 size={14} /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Картинка двери ──────────────────────────────────────────────────────────
function DoorSilhouette({ hex = '#e5e7eb' }: { hex?: string }) {
  return (
    <svg viewBox="0 0 80 190" className="h-full w-auto" aria-hidden>
      <rect x="4" y="4" width="72" height="182" rx="2" fill={hex} stroke="#9ca3af" strokeWidth="1.5" />
      <rect x="14" y="16" width="52" height="70" rx="1" fill="none" stroke="#00000022" />
      <rect x="14" y="98" width="52" height="76" rx="1" fill="none" stroke="#00000022" />
      <rect x="62" y="92" width="8" height="3" rx="1.5" fill="#6b7280" />
    </svg>
  );
}

function DoorImage({ url, hex, className = '' }: { url?: string | null; hex?: string; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!url || broken === url) return <div className={`flex items-center justify-center ${className}`}><DoorSilhouette hex={hex} /></div>;
  return <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(url)} className={`object-contain ${className}`} />;
}

function Swatch({ c, cat, on, onClick, size = 30 }: { c: ColorDef; cat: PhotoCatalog | null; on: boolean; onClick: () => void; size?: number }) {
  const sw = swatchUrl(cat, c.id);
  return (
    <button type="button" onClick={onClick} title={c.name} aria-label={c.name}
      className={`relative rounded-full shrink-0 ring-offset-2 ring-offset-background transition ${on ? 'ring-2 ring-primary' : 'ring-1 ring-black/10 hover:ring-black/30'}`}
      style={{ width: size, height: size, background: sw ? `center/cover url(${sw})` : c.hex }}>
      {on && <Check size={14} className="absolute inset-0 m-auto text-white drop-shadow-[0_0_2px_rgba(0,0,0,.8)]" />}
    </button>
  );
}

/** Рисунок двустворчатого проёма в масштабе: полотна рядом, правая половина зеркально — ручки к центру */
function OpeningDrawing({ sizes, url, hex, maxW: maxW0, maxH }: { sizes: LeafSize[]; url?: string | null; hex?: string; maxW: number; maxH: number }) {
  const n = sizes.length;
  // подгоняем под ширину блока (на телефоне он уже)
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(maxW0);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth - 40));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const maxW = Math.max(120, Math.min(maxW0, avail));
  const topH = Math.max(...sizes.map(x => x.h || 1));
  const sumW = sizes.reduce((a, x) => a + (x.w || 1), 0);
  const k = Math.min(maxH / topH, maxW / sumW); // пикселей на мм
  return (
    <div ref={ref} className="flex flex-col items-center gap-1">
      <div className="flex items-end rounded-[3px] border-[5px] border-stone-400/80 bg-stone-100 shadow-md" style={{ height: topH * k + 10 }}>
        {sizes.map((x, i) => (
          <div key={i} className={`flex ${i > 0 ? 'border-l border-stone-400/70' : ''}`}
            style={{ width: (x.w || 1) * k, height: (x.h || 1) * k, transform: i >= n / 2 ? 'scaleX(-1)' : undefined }}>
            <DoorImage url={url} hex={hex} className="w-full h-full !object-fill" />
          </div>
        ))}
      </div>
      <div className="flex text-[10px] text-muted-foreground tabular-nums" style={{ paddingLeft: 5, paddingRight: 5 }}>
        {sizes.map((x, i) => <span key={i} className="text-center border-t border-muted-foreground/40 pt-0.5" style={{ width: (x.w || 1) * k }}>{x.w}</span>)}
      </div>
    </div>
  );
}

// ── Галерея моделей ────────────────────────────────────────────────────────
function ModelGallery({ open, onClose, s, entries, current, colorId, onColor, onPick, cat }: {
  open: boolean; onClose: () => void; s: Series; entries: ModelEntry[]; current?: string; colorId?: string;
  onColor: (c: ColorDef) => void; onPick: (e: ModelEntry) => void; cat: PhotoCatalog | null;
}) {
  const [q, setQ] = useState('');
  const colors = seriesView(s.id).colors;
  const color = colors.find(c => c.id === colorId);
  const shown = entries.filter(e => !q || e.name.toLowerCase().includes(q.toLowerCase().trim()));
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl w-[calc(100vw-1.5rem)] max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b space-y-3 text-left">
          <DialogTitle>Модели {s.name}</DialogTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-48">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} placeholder="Номер модели" className="pl-8 h-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {colors.map(c => <Swatch key={c.id} c={c} cat={cat} on={c.id === colorId} onClick={() => onColor(c)} size={26} />)}
            </div>
            {color && <span className="text-sm text-muted-foreground">{color.name}</span>}
          </div>
        </DialogHeader>
        <div className="overflow-y-auto p-4">
          {shown.length === 0 && <p className="text-sm text-muted-foreground p-4">Ничего не найдено</p>}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {shown.map(e => {
              const ph = entryPhoto(e, colorId);
              const on = e.key === current;
              return (
                <button key={e.key} type="button" onClick={() => onPick(e)}
                  className={`group rounded-xl border p-2 text-left transition hover:shadow-md hover:border-primary/50 ${on ? 'border-primary ring-1 ring-primary bg-primary/5' : 'bg-card'}`}>
                  <div className="h-40 flex items-center justify-center rounded-lg bg-muted/40">
                    <DoorImage url={ph?.thumb} hex={color?.hex} className="h-full max-w-full" />
                  </div>
                  <p className="text-sm font-medium mt-2 leading-tight">{e.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">от {fmt(e.minPrice)}</p>
                  {ph && !ph.exact && <p className="text-[10px] text-amber-600 leading-tight">нет фото в этом цвете</p>}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Подбор размера ─────────────────────────────────────────────────────────
const H_QUICK = [1900, 2000, 2100, 2200, 2300, 2400, 2700, 3000];
const W_QUICK = [400, 600, 700, 800, 900, 1000];

function SizeField({ label, value, onChange, quick, min, max }: { label: string; value: number; onChange: (v: number) => void; quick: number[]; min: number; max: number }) {
  const opts = quick.filter(v => v >= min && v <= max);
  return (
    <div className="space-y-1.5">
      <span className="text-xs text-muted-foreground">{label}, мм <span className="opacity-70">({min}–{max})</span></span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input type="number" inputMode="numeric" value={value || ''} onChange={e => onChange(Number(e.target.value) || 0)} className="h-8 w-20 text-right" />
        {opts.map(v => <button key={v} type="button" onClick={() => onChange(v)} className={`h-8 px-2.5 rounded-md text-xs border tabular-nums ${value === v ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted/60'}`}>{v}</button>)}
      </div>
    </div>
  );
}

// ── Карточка проёма ────────────────────────────────────────────────────────
export default function OpeningCard({ o, n, onChange, onCopy, onRemove }: {
  o: Opening; n: number; onChange: (o: Opening) => void; onCopy: () => void; onRemove: () => void;
}) {
  const cat = usePhotoCatalog();
  const [picker, setPicker] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [open, setOpen] = useState(true);
  const d = o.door!;
  const s = seriesById(d?.seriesId);
  const view = seriesView(s?.id);
  const entries = useMemo(() => (s ? modelEntries(s, cat) : []), [s, cat]);
  const entry = entries.find(e => e.key === d.modelKey) ?? entries.find(e => e.rows.includes(d.modelIdx));
  const color = view.colors.find(c => c.id === d.colorId) ?? view.colors.find(c => c.name === d.color);
  const photo = entryPhoto(entry, color?.id);
  const calc = doorUnit(d);
  const tr = transomUnit(o);
  const total = openingTotal(o);
  const leaves = leavesOf(o);
  const sizes = leafSizes(o);
  const units = leafUnits(o);
  const sameH = sizes.every(x => x.h === sizes[0]?.h);
  const sameW = sizes.every(x => x.w === sizes[0]?.w);
  const sameSize = sameH && sameW;
  const setLeaf = (i: number, p: Partial<LeafSize>) => onChange({ ...o, leafSizes: sizes.map((x, j) => j === i ? { ...x, ...p } : x) });
  const leafErr = units.map((u, i) => (u.calc && !u.calc.ok ? `Полотно ${i + 1}: ${u.calc.error}` : '')).filter(Boolean);

  /** Обновить дверь и пересчитать зависимое: модель для КП, фото, перламутр */
  function setDoor(p: Partial<DoorSpec>) {
    const nd: DoorSpec = { ...d, ...p };
    const ns = seriesById(nd.seriesId);
    const nv = seriesView(nd.seriesId);
    const list = ns ? (ns.id === s?.id ? entries : modelEntries(ns, cat)) : [];
    const e = list.find(x => x.key === nd.modelKey) ?? list.find(x => x.rows.includes(nd.modelIdx));
    const c = nv.colors.find(x => x.id === nd.colorId);
    if (c) { nd.color = c.name; nd.perl = !!c.perl && !!ns?.perl; }
    if (e) { nd.modelKey = e.key; if (!e.rows.includes(nd.modelIdx)) nd.modelIdx = e.rows[0]; if (e.photos) nd.modelName = e.name; }
    nd.photo = entryPhoto(e, c?.id)?.thumb;
    onChange({ ...o, door: nd });
  }
  function pickSeries(id: string) {
    if (id === d.seriesId) return;
    const ns = seriesById(id)!;
    const nv = seriesView(id);
    const keepColor = nv.colors.find(c => c.id === d.colorId) ?? nv.colors[0];
    const first = modelEntries(ns, cat)[0];
    setDoor({ seriesId: id, modelKey: first?.key, modelIdx: first?.rows[0] ?? 0, modelName: '', options: [], colorId: keepColor?.id, color: keepColor?.name ?? '' });
  }
  const pickColor = (c: ColorDef) => setDoor({ colorId: c.id });
  const fills = entry ? entry.rows.map(i => ({ i, m: s!.models[i] })) : [];
  const hRange = s ? [s.grid.heights[0].min, s.grid.heights[s.grid.heights.length - 1].max] : [0, 0];
  const wRange = s ? [s.grid.widths[0].min, s.grid.widths[s.grid.widths.length - 1].max] : [0, 0];

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b">
        <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">{n}</span>
        <Input value={o.room} onChange={e => onChange({ ...o, room: e.target.value })} className="h-8 w-40 font-medium" placeholder="Помещение" />
        <select className={`${sel} !w-44 h-8`} value={o.openType} onChange={e => onChange({ ...o, openType: e.target.value, leaves: isDouble(e.target.value) ? (isDouble(o.openType) ? leavesOf(o) : 2) : 1 })}>
          {OPEN_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">шт</span>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange({ ...o, qty: Math.max(1, o.qty - 1) })}>−</Button>
          <Input type="number" min={1} value={o.qty} onChange={e => onChange({ ...o, qty: Math.max(0, Number(e.target.value) || 0) })} className="h-8 w-12 text-center px-1" />
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange({ ...o, qty: o.qty + 1 })}>+</Button>
        </div>
        {!open && entry && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            {photo && <img src={photo.thumb} alt="" className="h-8 w-auto" referrerPolicy="no-referrer" />}
            <span className="truncate">{s?.name} · {entry.name} · {d.color} · {d.height}×{d.width}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-base font-semibold tabular-nums mr-2">{fmt(total)}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onCopy} title="Копировать проём"><Copy size={15} /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={onRemove} title="Удалить проём"><Trash2 size={15} /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(x => !x)} title={open ? 'Свернуть' : 'Развернуть'}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</Button>
        </div>
      </div>

      {open && s && (
        <div className="p-4 space-y-5">
          <div className={`grid gap-5 ${leaves === 1 ? 'md:grid-cols-[200px_1fr]' : leaves === 2 ? 'md:grid-cols-[280px_1fr]' : 'md:grid-cols-[420px_1fr]'}`}>
            {/* Фото / рисунок проёма */}
            <div className="flex flex-col items-center gap-2">
              {leaves > 1 && (
                <div className="flex gap-1.5 self-stretch justify-center">
                  {[2, 4].map(n => <button key={n} type="button" onClick={() => onChange({ ...o, leaves: n })} className={pill(leaves === n)}>{n} полотна</button>)}
                </div>
              )}
              <button type="button" onClick={() => photo ? setZoom(true) : setGallery(true)}
                className={`group relative w-full ${leaves === 1 ? 'h-[260px] md:h-[340px]' : 'py-4'} rounded-xl bg-gradient-to-b from-muted/30 to-muted/70 flex items-center justify-center p-3`}>
                {leaves === 1
                  ? <DoorImage url={photo?.thumb} hex={color?.hex} className="h-full max-w-full drop-shadow-md" />
                  : <OpeningDrawing sizes={sizes} url={photo?.thumb} hex={color?.hex} maxW={leaves === 2 ? 240 : 380} maxH={leaves === 2 ? 290 : 270} />}
                {photo && <Maximize2 size={16} className="absolute top-2 right-2 text-muted-foreground opacity-0 group-hover:opacity-100" />}
              </button>
              {leaves > 1 && (
                <div className="w-full flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="h-px flex-1 bg-muted-foreground/50" />
                  <span>полотна вместе: {sizes.reduce((a, x) => a + x.w, 0)} мм (без короба)</span>
                  <span className="h-px flex-1 bg-muted-foreground/50" />
                </div>
              )}
              <div className="text-center leading-tight">
                <p className="text-sm font-medium">{entry?.name ?? '—'}{leaves > 1 ? ` × ${leaves}` : ''}</p>
                <p className="text-xs text-muted-foreground">{d.color || 'цвет не выбран'}{leaves > 1 ? (sameSize ? ` · ${sizes[0].h}×${sizes[0].w} каждое` : ' · разные размеры') : ''}</p>
                {photo && !photo.exact && <p className="text-[11px] text-amber-600">на сайте нет фото в этом цвете</p>}
                {!view.site && <p className="text-[11px] text-muted-foreground">фото этой серии нет на сайте фабрики</p>}
              </div>
            </div>

            <div className="space-y-4 min-w-0">
              {/* Коллекция */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Коллекция</span>
                <div className="space-y-1.5">
                  {groups.map(gr => (
                    <div key={gr} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground w-28 shrink-0">{gr}</span>
                      {SERIES.filter(x => x.group === gr).map(x => <button key={x.id} type="button" onClick={() => pickSeries(x.id)} className={pill(x.id === s.id)}>{x.name}</button>)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Модель */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Модель</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setGallery(true)} className="h-9"><LayoutGrid size={15} className="mr-1.5" />{entry ? entry.name : 'Выбрать модель'}<span className="ml-2 text-xs text-muted-foreground">· все модели с фото</span></Button>
                </div>
                {fills.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {fills.map(({ i, m }) => (
                      <button key={i} type="button" onClick={() => setDoor({ modelIdx: i })} className={pill(d.modelIdx === i)}>
                        {m.fill ?? 'Базовая'} <span className={`text-xs ${d.modelIdx === i ? 'opacity-80' : 'text-muted-foreground'}`}>{fmt(m.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {s.fillNote && fills.length > 1 && <p className="text-[11px] text-muted-foreground">{s.fillNote}</p>}
              </div>

              {/* Цвет */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Цвет{color ? <>: <b className="text-foreground font-medium">{color.name}</b>{color.perl ? ' (с наценкой)' : ''}</> : ''}</span>
                <div className="flex flex-wrap items-center gap-2.5 pl-0.5">
                  {view.colors.map(c => <Swatch key={c.id} c={c} cat={cat} on={c.id === color?.id} onClick={() => pickColor(c)} />)}
                </div>
              </div>

              {/* Размер */}
              {leaves > 1 && <p className="text-xs text-muted-foreground -mb-2">Задать всем полотнам сразу:</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <SizeField label="Высота" value={sameH ? sizes[0]?.h ?? d.height : 0} onChange={v => onChange({ ...o, leafSizes: leaves > 1 ? sizes.map(x => ({ ...x, h: v })) : undefined, door: { ...d, height: v } })} quick={H_QUICK} min={hRange[0]} max={hRange[1]} />
                <SizeField label="Ширина" value={sameW ? sizes[0]?.w ?? d.width : 0} onChange={v => onChange({ ...o, leafSizes: leaves > 1 ? sizes.map(x => ({ ...x, w: v })) : undefined, door: { ...d, width: v } })} quick={W_QUICK} min={wRange[0]} max={wRange[1]} />
              </div>
              {leaves > 1 && (
                <div className="rounded-lg border divide-y">
                  <div className="px-3 py-1.5 text-xs text-muted-foreground flex items-center">
                    <span className="flex-1">Размер каждого полотна (слева направо)</span>
                    {!sameSize && <button type="button" className="text-primary hover:underline" onClick={() => onChange({ ...o, leafSizes: undefined, door: { ...d, height: sizes[0].h, width: sizes[0].w } })}>сделать одинаковыми</button>}
                  </div>
                  {units.map((u, i) => (
                    <div key={i} className="px-3 py-1.5 flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-20 text-muted-foreground">Полотно {i + 1}</span>
                      <Input type="number" inputMode="numeric" value={u.h || ''} onChange={e => setLeaf(i, { h: Number(e.target.value) || 0 })} className="h-8 w-20 text-right" aria-label={`Высота полотна ${i + 1}`} />
                      <span className="text-muted-foreground">×</span>
                      <Input type="number" inputMode="numeric" value={u.w || ''} onChange={e => setLeaf(i, { w: Number(e.target.value) || 0 })} className="h-8 w-20 text-right" aria-label={`Ширина полотна ${i + 1}`} />
                      <span className="text-xs text-muted-foreground">мм</span>
                      <span className={`ml-auto tabular-nums ${u.calc && !u.calc.ok ? 'text-destructive text-xs' : 'font-medium'}`}>{u.calc && u.calc.ok ? fmt(u.calc.unit ?? 0) : 'вне прайса'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Опции */}
              {s.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {s.options.map(op => {
                    const on = d.options.includes(op.id);
                    return (
                      <button key={op.id} type="button" className={pill(on)}
                        onClick={() => setDoor({ options: on ? d.options.filter(x => x !== op.id) : [...d.options, op.id] })}>
                        {on ? '✓ ' : '+ '}{op.label} <span className={`text-xs ${on ? 'opacity-80' : 'text-muted-foreground'}`}>{op.pct ? `+${op.pct}%` : `+${fmt(op.add ?? 0)}`}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {leaves === 1 ? (
                <div className={`rounded-lg px-3 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 ${calc && !calc.ok ? 'bg-destructive/10 text-destructive' : 'bg-primary/5'}`}>
                  {calc && !calc.ok ? <span className="flex items-center gap-1.5"><AlertTriangle size={14} />{calc.error}</span> : calc && (
                    <>
                      <span>Полотно: <b className="tabular-nums text-base">{fmt(calc.unit ?? 0)}</b> за шт</span>
                      <span className="text-xs text-muted-foreground">{calc.breakdown}</span>
                    </>
                  )}
                </div>
              ) : (
                <div className={`rounded-lg px-3 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 ${leafErr.length ? 'bg-destructive/10 text-destructive' : 'bg-primary/5'}`}>
                  {leafErr.length ? leafErr.map(e => <span key={e} className="flex items-center gap-1.5 w-full"><AlertTriangle size={14} />{e}</span>) : (
                    <span>{leaves} полотна за проём: <b className="tabular-nums text-base">{fmt(units.reduce((a, u) => a + (u.calc && u.calc.ok ? u.calc.unit ?? 0 : 0), 0))}</b></span>
                  )}
                </div>
              )}

              <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Название в КП
                <Input value={d.modelName ?? ''} onChange={e => onChange({ ...o, door: { ...d, modelName: e.target.value } })} className="h-7 w-52 text-xs" placeholder={entry?.name ?? s.models[d.modelIdx]?.model} />
              </label>
            </div>
          </div>

          {/* Фрамуга-дверь */}
          {s.transoms && (
            <div className="flex flex-wrap items-center gap-2 text-sm border-t pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!o.transom} onChange={e => onChange({ ...o, transom: e.target.checked ? { idx: 0, area: 0.5 } : undefined })} />
                Верхняя фрамуга-дверь
              </label>
              {o.transom && (
                <>
                  <select className={`${sel} !w-auto h-8`} value={o.transom.idx} onChange={e => onChange({ ...o, transom: { ...o.transom!, idx: Number(e.target.value) } })}>
                    {s.transoms.map((t, i) => <option key={i} value={i}>{t.label} — {fmt(d.perl && t.perl ? t.perl : t.base)}/м²</option>)}
                  </select>
                  <Input type="number" step="0.01" value={o.transom.area} onChange={e => onChange({ ...o, transom: { ...o.transom!, area: Number(e.target.value) || 0 } })} className="h-8 w-20 text-right" />
                  <span className="text-xs text-muted-foreground">м²</span>
                  {tr && <span className="tabular-nums font-medium">{fmt(tr.sum)}</span>}
                </>
              )}
            </div>
          )}

          {/* Комплектующие */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium flex-1">Короб, наличники, доборы <span className="text-xs text-muted-foreground font-normal">— на один проём</span></p>
              <Button type="button" variant="outline" size="sm" onClick={() => setPicker(x => !x)}><Plus size={14} className="mr-1" />Из прайса</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...o, lines: [...o.lines, { id: Math.random().toString(36).slice(2), kind: 'Другое', name: '', unit: 'шт', price: 0, qty: 1 }] })}>Своя позиция</Button>
            </div>
            {picker && <CatalogPicker kp="door" hint={s.name.split(' ')[0]} onClose={() => setPicker(false)} onPick={c => onChange({ ...o, lines: [...o.lines, lineFromCatalog(c)] })} />}
            <LinesTable lines={o.lines} mult={o.qty} onChange={lines => onChange({ ...o, lines })} />
          </div>
        </div>
      )}

      {s && gallery && (
        <ModelGallery open={gallery} onClose={() => setGallery(false)} s={s} entries={entries} current={entry?.key} colorId={color?.id} cat={cat}
          onColor={pickColor} onPick={e => { setDoor({ modelKey: e.key, modelIdx: e.rows[0], modelName: '' }); setGallery(false); }} />
      )}
      {zoom && photo && (
        <Dialog open onOpenChange={v => !v && setZoom(false)}>
          <DialogContent className="max-w-md p-4">
            <DialogHeader><DialogTitle>{entry?.name} · {d.color}</DialogTitle></DialogHeader>
            <img src={photo.full} alt="" referrerPolicy="no-referrer" className="max-h-[75vh] w-auto mx-auto object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
