import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, X, RotateCcw, AlertTriangle, Minus } from 'lucide-react';
import { fmt } from '@/lib/estimate/doors';
import { openingFrame, lineFromCatalog, type Opening } from '@/lib/estimate/model';
import { frameTypes, nalStyles, defaultFrame, INVISIBLE_KINDS, MONO_NAL, frameLineSum, familyOf, type FrameSpec, type FrameLine } from '@/lib/estimate/frame';
import CatalogPicker from './CatalogPicker';
import LinesTable from './LinesTable';

const field = 'h-9 w-full sm:w-auto rounded-lg border border-input bg-background px-2.5 text-sm min-w-0';
const WALLS = [80, 100, 120, 150, 200, 250];

/** Короткое описание позиции: размер и перламутр вместо длинного названия из прайса */
function shortSpec(l: FrameLine) {
  const spec = l.item?.spec ?? '';
  const dims = spec.match(/\d+×\d+(×\d+)?/)?.[0];
  const wall = spec.match(/стена (\d+ мм)/)?.[1];
  const perl = /Перламутр/.test(spec) ? 'перламутр' : '';
  if (wall) return [`${l.label === 'Расширитель' ? 'ширина' : 'под стену'} ${wall}`, perl].filter(Boolean).join(' · ');
  return [dims ?? spec.replace(/,?\s*(одностворчатый|распашной)/, ''), perl].filter(Boolean).join(' · ');
}

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
  const shown = lines.filter(l => l.qty > 0);
  const removed = lines.filter(l => l.qty <= 0 && fr.over?.[l.role] === 0);
  const frameSum = lines.reduce((a, l) => a + frameLineSum(l), 0);
  const extraSum = o.lines.reduce((a, l) => a + l.price * l.qty, 0);
  const reverse = /reverse/i.test(o.openType);
  const showWall = fr.type === 'tele' || fr.type === 'copl' || fr.type === 'mono';
  const showNal = (fr.type === 'tele' || fr.type === 'copl') && styles.length > 0;
  const boxDepth = familyOf(sid) === 'PD_PM' ? 85 : familyOf(sid) === 'EO' ? 76 : 80;
  const step = (l: FrameLine, d: number) => setOver(l.role, Math.max(0, Math.round((l.qty + d) * 2) / 2));

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="font-medium">Короб и наличники</h3>
        <span className="ml-auto font-semibold tabular-nums">{fmt(frameSum + extraSum)}</span>
      </div>

      {/* Настройки — одной строкой */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 flex-1 basis-[45%] sm:basis-auto sm:flex-none">
          <span className="block text-[11px] text-muted-foreground">Короб</span>
          <select className={field} value={fr.type} onChange={e => set({ type: e.target.value as FrameSpec['type'], over: {} })}>
            {types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>

        {fr.type === 'invisible' && (
          <label className="space-y-1 flex-1 basis-[45%] sm:basis-auto sm:flex-none">
            <span className="block text-[11px] text-muted-foreground">Вид</span>
            <select className={field} value={fr.invisible ?? 'Invisible'} onChange={e => set({ invisible: e.target.value })}>
              {INVISIBLE_KINDS.map(k => <option key={k}>{k}</option>)}
            </select>
          </label>
        )}

        {fr.type === 'mono' && !reverse && (
          <label className="space-y-1 flex-1 basis-[45%] sm:basis-auto sm:flex-none">
            <span className="block text-[11px] text-muted-foreground">Наличник моноблока</span>
            <select className={field} value={fr.monoNal ?? '60'} onChange={e => set({ monoNal: e.target.value })}>
              {MONO_NAL.map(k => <option key={k.id} value={k.id}>{k.label.replace('Наличник ', '')}</option>)}
            </select>
          </label>
        )}

        {showWall && (
          <label className="space-y-1 flex-1 basis-[45%] sm:basis-auto sm:flex-none">
            <span className="block text-[11px] text-muted-foreground">Стена, мм</span>
            <input type="number" inputMode="numeric" list="walls" value={fr.wall || ''} onChange={e => set({ wall: Number(e.target.value) || 0 })}
              className={`${field} sm:w-24 text-right`} title={fr.type !== 'mono' ? `короб закрывает ${boxDepth} мм, остальное — добор` : undefined} />
            <datalist id="walls">{WALLS.map(w => <option key={w} value={w} />)}</datalist>
          </label>
        )}

        {showNal && (<>
          <label className="space-y-1 flex-1 basis-[45%] sm:basis-auto sm:flex-none">
            <span className="block text-[11px] text-muted-foreground">Наличник</span>
            <select className={field} value={fr.nal} onChange={e => set({ nal: e.target.value })}>
              {styles.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 flex-1 basis-[45%] sm:basis-auto sm:flex-none">
            <span className="block text-[11px] text-muted-foreground">Стороны</span>
            <select className={field} value={fr.sides ?? 2} onChange={e => set({ sides: Number(e.target.value) as 0 | 1 | 2 })}>
              <option value={2}>с двух сторон</option>
              <option value={1}>с одной стороны</option>
              <option value={0}>без наличников</option>
            </select>
          </label>
        </>)}
      </div>

      {/* Что получилось */}
      {shown.length > 0 && (
        <div className="divide-y rounded-lg border">
          {shown.map(l => {
            const edited = fr.over?.[l.role] !== undefined;
            return (
              <div key={l.role} className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-sm" title={[l.item?.name, l.item?.spec, l.hint].filter(Boolean).join(' — ')}>
                <div className="basis-full sm:basis-auto sm:flex-1 min-w-0">
                  <span className="font-medium">{l.label}</span>
                  <span className="text-muted-foreground"> · {l.item ? shortSpec(l) : <span className="text-destructive">нет в прайсе</span>}</span>
                  {l.warn && <span className="block text-xs text-amber-600"><AlertTriangle size={11} className="inline mr-1 -mt-0.5" />{l.warn}</span>}
                </div>
                <div className="flex items-center shrink-0 ml-auto sm:ml-0">
                  <button type="button" className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" onClick={() => step(l, -(l.qty % 1 ? 0.5 : 1))} aria-label="Меньше"><Minus size={13} /></button>
                  <span className={`w-14 text-center tabular-nums ${edited ? 'text-amber-600 font-medium' : ''}`}>{String(l.qty).replace('.', ',')} <span className="text-xs text-muted-foreground">{l.item?.unit === 'компл' ? 'к-т' : 'шт'}</span></span>
                  <button type="button" className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" onClick={() => step(l, l.qty % 1 ? 0.5 : 1)} aria-label="Больше"><Plus size={13} /></button>
                </div>
                <span className="w-24 text-right tabular-nums shrink-0">{fmt(frameLineSum(l) * o.qty)}</span>
                {edited
                  ? <button type="button" className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0" title={`Вернуть авто: ${l.autoQty}`} onClick={() => setOver(l.role, undefined)}><RotateCcw size={13} /></button>
                  : <button type="button" className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0" title="Убрать" onClick={() => setOver(l.role, 0)}><X size={13} /></button>}
              </div>
            );
          })}
        </div>
      )}
      {removed.length > 0 && (
        <p className="text-xs text-muted-foreground">Убрано: {removed.map((l, i) => <span key={l.role}>{i > 0 && ', '}<button type="button" className="text-primary hover:underline" onClick={() => setOver(l.role, undefined)}>{l.label}</button></span>)} — нажмите, чтобы вернуть</p>
      )}

      {/* Дополнительно */}
      <LinesTable lines={o.lines} mult={o.qty} onChange={l => onChange({ ...o, lines: l })} />
      {picker
        ? <CatalogPicker kp="door" seriesId={sid} perl={!!o.door?.perl} onClose={() => setPicker(false)} onPick={c => onChange({ ...o, lines: [...o.lines, lineFromCatalog(c)] })} />
        : (
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setPicker(true)}><Plus size={14} className="mr-1" />Добавить из прайса</Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => onChange({ ...o, lines: [...o.lines, { id: Math.random().toString(36).slice(2), kind: 'Другое', name: '', unit: 'шт', price: 0, qty: 1 }] })}>Своя позиция</Button>
          </div>
        )}
    </div>
  );
}
