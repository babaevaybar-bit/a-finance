import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Search, X } from 'lucide-react';
import { CATALOG, type CatalogItem } from '@/lib/estimate/accessories';
import { fmt } from '@/lib/estimate/doors';

/** Поиск позиции в прайсе комплектующих / фурнитуры */
const CODES = ['PD.O', 'P.O', 'ND.O', 'N.O', 'PE.O', 'NE.O', 'PD', 'PM', 'PE'];
const SERIES_CODE: Record<string, string> = {
  PD: 'PD', PM: 'PM', PDO_IE: 'PD.O', PDO_UN: 'PD.O', PO_IE: 'P.O', PO_UN: 'P.O', NDO: 'ND.O', NO_T: 'N.O', NO_NT: 'N.O',
  PE: 'PE', PEO_IE: 'PE.O', PEO_UN: 'PE.O', NEO_T: 'NE.O', NEO_NT: 'NE.O', PAINT: 'PE.O',
};
const UNILACK = new Set(['PDO_UN', 'PO_UN', 'NO_NT', 'PEO_UN', 'NEO_NT']);
const hasCode = (name: string, code: string) => new RegExp(`(^|[\\s,(])${code.replace('.', '\\.')}(?![.\\w])`).test(name);
const isPerl = (c: CatalogItem) => /Перламутр/.test(c.spec ?? '');
const baseSpec = (c: CatalogItem) => (c.spec ?? '').replace(/,?\s*Перламутр(\/Элегант)?/, '');

/** Подходит ли позиция к серии и цвету полотна */
function fits(c: CatalogItem, seriesId: string, perl: boolean, all: CatalogItem[]) {
  const code = SERIES_CODE[seriesId];
  if (code && CODES.some(k => hasCode(c.name, k)) && !hasCode(c.name, code)) return false;
  if (code && /Unilack|без Текстур|Ин\.Эм\.|Текстура/.test(c.name)) {
    const un = /Unilack|без Текстур/.test(c.name), ie = /Ин\.Эм\.|Текстура/.test(c.name);
    if (UNILACK.has(seriesId) ? !un : !ie) return false;
  }
  if (perl) return isPerl(c) || !all.some(z => z !== c && z.name === c.name && isPerl(z) && baseSpec(z) === baseSpec(c));
  return !isPerl(c);
}

export default function CatalogPicker({ kp, onPick, onClose, hint, seriesId, perl }: {
  kp: 'door' | 'hw'; onPick: (c: CatalogItem) => void; onClose: () => void; hint?: string; seriesId?: string; perl?: boolean;
}) {
  const [onlyFit, setOnlyFit] = useState(!!seriesId);
  const pool = useMemo(() => {
    const base = CATALOG.filter(c => c.kp === kp && !(kp === 'door' && ['Короб', 'Наличник', 'Добор', 'Скрытый короб', 'Моноблок'].includes(c.section) && seriesId));
    return onlyFit && seriesId ? base.filter(c => fits(c, seriesId, !!perl, base)) : base;
  }, [kp, onlyFit, seriesId, perl]);
  const sections = useMemo(() => [...new Set(pool.map(c => c.section))], [pool]);
  const [section, setSection] = useState<string>('');
  // Подсказка (серия полотна) подставляется, только если по ней что-то находится
  const [q, setQ] = useState(() => hint && pool.some(c => c.name.includes(hint)) ? hint : '');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const found = pool.filter(c => (!section || c.section === section) &&
    words.every(w => `${c.name} ${c.spec ?? ''} ${c.maker ?? ''}`.toLowerCase().includes(w))).slice(0, 60);

  return (
    <div className="rounded-xl border bg-card p-3 space-y-2 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus type="search" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск: «наличник 2440», «Invisible», «GOCCIA»…" className="pl-8 h-9" />
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onClose} aria-label="Закрыть"><X size={16} /></Button>
      </div>
      <div className="flex flex-wrap gap-1 items-center">
        {seriesId && <label className="flex items-center gap-1.5 text-xs mr-2 cursor-pointer"><input type="checkbox" checked={onlyFit} onChange={e => setOnlyFit(e.target.checked)} />только к этой серии{perl ? ' (перламутр)' : ''}</label>}
        <button type="button" onClick={() => setSection('')} className={`h-7 px-2.5 rounded-full text-xs border ${!section ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted/50'}`}>Все</button>
        {sections.map(s => (
          <button key={s} type="button" onClick={() => setSection(s === section ? '' : s)}
            className={`h-7 px-2.5 rounded-full text-xs border ${section === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted/50'}`}>{s}</button>
        ))}
      </div>
      <div className="max-h-72 overflow-y-auto divide-y rounded-lg border">
        {found.length === 0 && <div className="p-3 text-sm text-muted-foreground">Ничего не найдено</div>}
        {found.map(c => (
          <button key={c.id} type="button" onClick={() => onPick(c)} className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-start gap-2">
            <Plus size={14} className="mt-0.5 text-primary shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="text-sm block">{c.name}</span>
              <span className="text-xs text-muted-foreground block">{[c.spec, c.maker].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="text-sm font-medium tabular-nums shrink-0">{fmt(c.price)}<span className="text-xs text-muted-foreground font-normal"> / {c.unit}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}
