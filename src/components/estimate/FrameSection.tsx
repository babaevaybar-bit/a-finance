import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X, RotateCcw, AlertTriangle } from 'lucide-react';
import { fmt } from '@/lib/estimate/doors';
import { openingFrame, lineFromCatalog, type Opening } from '@/lib/estimate/model';
import { frameTypes, nalStyles, defaultFrame, INVISIBLE_KINDS, MONO_NAL, frameLineSum, familyOf, type FrameSpec } from '@/lib/estimate/frame';
import CatalogPicker from './CatalogPicker';
import LinesTable from './LinesTable';

const chip = (on: boolean) => `h-8 px-3 rounded-full text-sm border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted/60'}`;
const WALLS = [80, 100, 120, 150, 200, 250];

export default function FrameSection({ o, onChange }: { o: Opening; onChange: (o: Opening) => void }) {
  const [picker, setPicker] = useState(false);
  const sid = o.door?.seriesId ?? '';
  const fr: FrameSpec = o.frame ?? { type: 'none' };
  const set = (p: Partial<FrameSpec>) => onChange({ ...o, frame: { ...defaultFrame(sid), ...fr, ...p } });
  const setOver = (role: string, v: number | undefined) => {
    const over = { ...(fr.over ?? {}) };
    if (v === undefined) delete over[role]; else over[role] = v;
    set({ over });
  };
  const types = frameTypes(sid);
  const styles = nalStyles(sid);
  const lines = openingFrame(o);
  const removed = Object.entries(fr.over ?? {}).filter(([, v]) => v === 0).map(([k]) => k);
  const frameSum = lines.reduce((a, l) => a + frameLineSum(l), 0);
  const extraSum = o.lines.reduce((a, l) => a + l.price * l.qty, 0);
  const reverse = /reverse/i.test(o.openType);
  const showWall = fr.type === 'tele' || fr.type === 'copl' || fr.type === 'mono';
  const boxDepth = familyOf(sid) === 'PD_PM' ? 85 : familyOf(sid) === 'EO' ? 76 : 80;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="font-medium">Короб, наличники, доборы</h3>
        <span className="text-xs text-muted-foreground">подбираются из прайса автоматически, количество — на один проём</span>
        <span className="ml-auto font-semibold tabular-nums">{fmt(frameSum + extraSum)}</span>
      </div>

      <div className="grid gap-3 min-[1100px]:grid-cols-[auto_1fr] min-[1100px]:items-center">
        <span className="text-xs text-muted-foreground">Короб</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {types.map(t => <button key={t.id} type="button" title={t.hint} onClick={() => set({ type: t.id, over: {} })} className={chip(fr.type === t.id)}>{t.label}</button>)}
          <span className="text-xs text-muted-foreground ml-1">{types.find(t => t.id === fr.type)?.hint}</span>
        </div>

        {fr.type === 'invisible' && (<>
          <span className="text-xs text-muted-foreground">Вид</span>
          <div className="flex flex-wrap gap-1.5">
            {INVISIBLE_KINDS.map(k => <button key={k} type="button" onClick={() => set({ invisible: k })} className={chip((fr.invisible ?? 'Invisible') === k)}>{k}</button>)}
          </div>
        </>)}

        {fr.type === 'mono' && !reverse && (<>
          <span className="text-xs text-muted-foreground">Наличники моноблока</span>
          <div className="flex flex-wrap gap-1.5">
            {MONO_NAL.map(k => <button key={k.id} type="button" onClick={() => set({ monoNal: k.id })} className={chip((fr.monoNal ?? '60') === k.id)}>{k.label}</button>)}
          </div>
        </>)}

        {showWall && (<>
          <span className="text-xs text-muted-foreground">Толщина стены, мм</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input type="number" inputMode="numeric" value={fr.wall || ''} onChange={e => set({ wall: Number(e.target.value) || 0 })} className="h-8 w-20 text-right" />
            {WALLS.map(w => <button key={w} type="button" onClick={() => set({ wall: w })} className={`h-8 px-2.5 rounded-md text-xs border tabular-nums ${fr.wall === w ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted/60'}`}>{w}</button>)}
            {fr.type !== 'mono' && <span className="text-xs text-muted-foreground ml-1">короб закрывает {boxDepth} мм, остальное — добор</span>}
          </div>
        </>)}

        {(fr.type === 'tele' || fr.type === 'copl') && styles.length > 0 && (<>
          <span className="text-xs text-muted-foreground">Наличники</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {styles.map(st => <button key={st.id} type="button" onClick={() => set({ nal: st.id })} className={chip(fr.nal === st.id)}>{st.label}</button>)}
            <span className="w-px h-6 bg-border mx-1" />
            {([[2, 'с двух сторон'], [1, 'с одной'], [0, 'без наличников']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => set({ sides: v })} className={chip((fr.sides ?? 2) === v)}>{l}</button>
            ))}
          </div>
        </>)}
      </div>

      {/* Что получилось */}
      {lines.length > 0 && (
        <div className="rounded-lg border divide-y">
          {lines.filter(l => l.qty > 0).map(l => {
            const edited = fr.over?.[l.role] !== undefined;
            return (
              <div key={l.role} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-sm"><span className="text-xs text-muted-foreground mr-1.5">{l.label}</span>{l.item?.name ?? <span className="text-destructive">нет в прайсе</span>}</p>
                  <p className="text-xs text-muted-foreground">{[l.item?.spec, l.hint].filter(Boolean).join(' · ')}</p>
                  {l.warn && <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle size={12} />{l.warn}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm tabular-nums w-24 text-right">{fmt(l.item?.price ?? 0)}</span>
                  <span className="text-xs text-muted-foreground">×</span>
                  <Input type="number" inputMode="decimal" step="0.5" min={0} value={l.qty} onChange={e => setOver(l.role, Math.max(0, Number(e.target.value) || 0))} className={`h-8 w-16 text-right ${edited ? 'border-amber-400' : ''}`} />
                  <span className="text-xs text-muted-foreground w-10">{l.item?.unit}</span>
                  <span className="text-sm font-medium tabular-nums w-28 text-right">{fmt(frameLineSum(l) * o.qty)}</span>
                  {edited
                    ? <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={`Вернуть авто: ${l.autoQty}`} onClick={() => setOver(l.role, undefined)}><RotateCcw size={14} /></Button>
                    : <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Убрать" onClick={() => setOver(l.role, 0)}><X size={14} /></Button>}
                </div>
              </div>
            );
          })}
          {removed.length > 0 && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground flex flex-wrap gap-2 items-center">
              Убрано:
              {removed.map(r => <button key={r} type="button" className="text-primary hover:underline" onClick={() => setOver(r, undefined)}>{lines.find(l => l.role === r)?.label ?? r} — вернуть</button>)}
            </div>
          )}
        </div>
      )}

      {/* Дополнительно */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground flex-1">Ещё к проёму: розетки, капитель, плинтус, автопорог, фрамуга-панель…</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setPicker(x => !x)}><Plus size={14} className="mr-1" />Из прайса</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...o, lines: [...o.lines, { id: Math.random().toString(36).slice(2), kind: 'Другое', name: '', unit: 'шт', price: 0, qty: 1 }] })}>Своя позиция</Button>
        </div>
        {picker && <CatalogPicker kp="door" seriesId={sid} perl={!!o.door?.perl} onClose={() => setPicker(false)} onPick={c => onChange({ ...o, lines: [...o.lines, lineFromCatalog(c)] })} />}
        <LinesTable lines={o.lines} mult={o.qty} onChange={l => onChange({ ...o, lines: l })} />
      </div>
    </div>
  );
}
