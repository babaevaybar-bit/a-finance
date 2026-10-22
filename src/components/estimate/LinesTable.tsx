import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { fmt } from '@/lib/estimate/doors';
import type { Line } from '@/lib/estimate/model';

export default function LinesTable({ lines, onChange, mult = 1 }: { lines: Line[]; onChange: (l: Line[]) => void; mult?: number }) {
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
          <div className="flex items-center gap-1 sm:gap-1.5 ml-auto">
            {l.itemId ? <span className="text-sm tabular-nums w-[4.5rem] sm:w-24 text-right text-xs sm:text-sm">{fmt(l.price)}</span>
              : <Input type="number" inputMode="decimal" value={l.price || ''} onChange={e => upd(l.id, { price: Number(e.target.value) || 0 })} className="h-8 w-20 sm:w-28 text-right" placeholder="Цена" />}
            <span className="text-xs text-muted-foreground">×</span>
            <Input type="number" inputMode="decimal" min={0} step="any" value={l.qty} onChange={e => upd(l.id, { qty: Number(e.target.value) || 0 })} className="h-8 w-12 sm:w-16 text-right px-1.5 sm:px-3" />
            <span className="text-xs text-muted-foreground w-7 sm:w-8">{l.unit}</span>
            <span className="text-sm font-medium tabular-nums w-[5.5rem] sm:w-28 text-right">{fmt(l.price * l.qty * mult)}</span>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onChange(lines.filter(x => x.id !== l.id))} aria-label="Удалить"><Trash2 size={14} /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

