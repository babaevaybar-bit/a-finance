import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Search, X } from 'lucide-react';
import { CATALOG, type CatalogItem } from '@/lib/estimate/accessories';
import { fmt } from '@/lib/estimate/doors';

/** Поиск позиции в прайсе комплектующих / фурнитуры */
export default function CatalogPicker({ kp, onPick, onClose, hint }: {
  kp: 'door' | 'hw'; onPick: (c: CatalogItem) => void; onClose: () => void; hint?: string;
}) {
  const pool = useMemo(() => CATALOG.filter(c => c.kp === kp), [kp]);
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
      <div className="flex flex-wrap gap-1">
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
