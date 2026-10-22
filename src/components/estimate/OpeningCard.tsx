import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, Trash2, Plus, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { SERIES, fmt } from '@/lib/estimate/doors';
import { OPEN_TYPES, doorUnit, transomUnit, openingTotal, seriesById, lineFromCatalog, type Opening, type Line, type DoorSpec } from '@/lib/estimate/model';
import CatalogPicker from './CatalogPicker';

const groups = [...new Set(SERIES.map(s => s.group))];
const sel = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

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

export default function OpeningCard({ o, n, onChange, onCopy, onRemove }: {
  o: Opening; n: number; onChange: (o: Opening) => void; onCopy: () => void; onRemove: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const [open, setOpen] = useState(true);
  const d = o.door!;
  const s = seriesById(d?.seriesId);
  const calc = doorUnit(d);
  const tr = transomUnit(o);
  const setDoor = (p: Partial<DoorSpec>) => onChange({ ...o, door: { ...d, ...p } });
  const total = openingTotal(o);

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b">
        <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">{n}</span>
        <Input value={o.room} onChange={e => onChange({ ...o, room: e.target.value })} className="h-8 w-44 font-medium" placeholder="Помещение" />
        <select className={`${sel} !w-48 h-8`} value={o.openType} onChange={e => onChange({ ...o, openType: e.target.value })}>
          {OPEN_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground text-xs">проёмов</span>
          <Input type="number" min={1} value={o.qty} onChange={e => onChange({ ...o, qty: Math.max(0, Number(e.target.value) || 0) })} className="h-8 w-16 text-right" />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-base font-semibold tabular-nums mr-2">{fmt(total)}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onCopy} title="Копировать проём"><Copy size={15} /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={onRemove} title="Удалить проём"><Trash2 size={15} /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(x => !x)}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</Button>
        </div>
      </div>

      {open && (
        <div className="p-4 space-y-4">
          {/* Полотно */}
          <div className="grid gap-3 md:grid-cols-12">
            <label className="md:col-span-3 space-y-1"><span className="text-xs text-muted-foreground">Серия</span>
              <select className={sel} value={d.seriesId} onChange={e => setDoor({ seriesId: e.target.value, modelIdx: 0, options: [], perl: false })}>
                {groups.map(gr => <optgroup key={gr} label={gr}>{SERIES.filter(x => x.group === gr).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
              </select></label>
            <label className="md:col-span-5 space-y-1"><span className="text-xs text-muted-foreground">Модель и заполнение (цена по прайсу)</span>
              <select className={sel} value={d.modelIdx} onChange={e => setDoor({ modelIdx: Number(e.target.value) })}>
                {s?.models.map((m, i) => <option key={i} value={i}>{m.model}{m.fill ? ` · ${m.fill}` : ''} — {fmt(m.price)}</option>)}
              </select></label>
            <label className="md:col-span-2 space-y-1"><span className="text-xs text-muted-foreground">Высота, мм</span>
              <Input type="number" value={d.height || ''} onChange={e => setDoor({ height: Number(e.target.value) || 0 })} className="h-9" /></label>
            <label className="md:col-span-2 space-y-1"><span className="text-xs text-muted-foreground">Ширина, мм</span>
              <Input type="number" value={d.width || ''} onChange={e => setDoor({ width: Number(e.target.value) || 0 })} className="h-9" /></label>
            <label className="md:col-span-4 space-y-1"><span className="text-xs text-muted-foreground">Модель для КП (необязательно, например «1.2.2 PD»)</span>
              <Input value={d.modelName ?? ''} onChange={e => setDoor({ modelName: e.target.value })} className="h-9" placeholder={s?.models[d.modelIdx]?.model} /></label>
            <label className="md:col-span-4 space-y-1"><span className="text-xs text-muted-foreground">Цвет полотна</span>
              <Input value={d.color} onChange={e => setDoor({ color: e.target.value })} className="h-9" placeholder="Например: Вайт" list={`colors-${s?.id}`} />
              <datalist id={`colors-${s?.id}`}>{(`${s?.colors ?? ''}, ${s?.perlColors ?? ''}`).split(/[,;:.]/).map(c => c.trim()).filter(c => c && c.length < 40 && !/Каркас|Элегант$/.test(c)).map(c => <option key={c} value={c} />)}</datalist></label>
            <div className="md:col-span-4 flex flex-wrap items-end gap-x-4 gap-y-2 pb-1">
              {s?.perl && (
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={d.perl} onChange={e => setDoor({ perl: e.target.checked })} />
                  {s.perlColors?.includes('Элегант') ? 'Перламутр / Элегант' : 'Перламутр'}</label>
              )}
              {s?.options.map(op => (
                <label key={op.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={d.options.includes(op.id)} onChange={e => setDoor({ options: e.target.checked ? [...d.options, op.id] : d.options.filter(x => x !== op.id) })} />
                  {op.label} <span className="text-xs text-muted-foreground">{op.pct ? `+${op.pct}%` : `+${fmt(op.add ?? 0)}`}</span>
                </label>
              ))}
            </div>
          </div>
          <div className={`rounded-lg px-3 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 ${calc && !calc.ok ? 'bg-destructive/10 text-destructive' : 'bg-muted/50'}`}>
            {calc && !calc.ok ? <span className="flex items-center gap-1.5"><AlertTriangle size={14} />{calc.error}</span> : calc && (
              <>
                <span>Полотно: <b className="tabular-nums">{fmt(calc.unit ?? 0)}</b> за шт</span>
                <span className="text-xs text-muted-foreground">{calc.breakdown}</span>
              </>
            )}
            {s && <span className="text-xs text-muted-foreground w-full">Цвета: {s.colors}{s.perlColors ? `; перламутр: ${s.perlColors}` : ''}</span>}
            {s?.fillNote && <span className="text-xs text-muted-foreground w-full">{s.fillNote}</span>}
          </div>

          {/* Фрамуга-дверь */}
          {s?.transoms && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
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
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium flex-1">Короб, наличники, доборы <span className="text-xs text-muted-foreground font-normal">— количество на один проём</span></p>
              <Button type="button" variant="outline" size="sm" onClick={() => setPicker(x => !x)}><Plus size={14} className="mr-1" />Из прайса</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...o, lines: [...o.lines, { id: Math.random().toString(36).slice(2), kind: 'Другое', name: '', unit: 'шт', price: 0, qty: 1 }] })}>Своя позиция</Button>
            </div>
            {picker && <CatalogPicker kp="door" hint={s ? s.name.split(' ')[0] : ''} onClose={() => setPicker(false)} onPick={c => onChange({ ...o, lines: [...o.lines, lineFromCatalog(c)] })} />}
            <LinesTable lines={o.lines} mult={o.qty} onChange={lines => onChange({ ...o, lines })} />
          </div>
        </div>
      )}
    </div>
  );
}
