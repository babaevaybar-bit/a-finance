import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Check, X, CheckCheck, RefreshCw } from 'lucide-react';
import { getPendingChanges, decideChange, notifyCountersChanged, CHANGE_FIELD_LABEL, type DealChange } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const money = (f: string) => f === 'total_amount' || f === 'paid_amount';
const show = (f: string, v: string | null) => (v == null || v === '' ? '—' : money(f) ? formatCurrency(Number(v)) : v);
const ago = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qyzylorda' });

/** Изменения данных клиента из amoCRM / Trello — применяются к сделке только после подтверждения */
export default function ChangeRequests({ managerName, onCount, onOpenDeal, refreshKey = 0 }: {
  managerName: (id: string) => string; onCount?: (n: number) => void; onOpenDeal?: (dealId: string) => void; refreshKey?: number;
}) {
  const [rows, setRows] = useState<DealChange[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await getPendingChanges(); setRows(r); onCount?.(r.length); }
    catch { toast.error('Не удалось загрузить изменения'); setRows([]); }
  }, [onCount]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const groups = useMemo(() => {
    const m = new Map<string, DealChange[]>();
    for (const r of rows ?? []) m.set(r.deal_id, [...(m.get(r.deal_id) ?? []), r]);
    return [...m.values()];
  }, [rows]);

  async function decide(list: DealChange[], approve: boolean) {
    const key = list.map(x => x.id).join(',');
    setBusy(key);
    try {
      for (const c of list) await decideChange(c.id, approve);
      toast.success(approve ? (list.length > 1 ? 'Изменения приняты' : 'Изменение принято') : (list.length > 1 ? 'Изменения отклонены' : 'Изменение отклонено'));
      const ids = new Set(list.map(x => x.id));
      setRows(prev => { const next = (prev ?? []).filter(x => !ids.has(x.id)); onCount?.(next.length); return next; });
      notifyCountersChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Ошибка'); load(); }
    finally { setBusy(null); }
  }

  if (rows === null) return <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>;
  if (!rows.length) return (
    <Card><CardContent className="py-14 text-center text-muted-foreground">
      <CheckCheck size={34} className="mx-auto mb-3 opacity-40" />
      <p>Новых изменений из amoCRM и Trello нет</p>
      <p className="text-xs mt-1">Когда менеджер поменяет данные клиента в amoCRM или Trello, изменение появится здесь и попадёт в A-Finance только после вашего подтверждения.</p>
    </CardContent></Card>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw size={12} />Изменения применяются к сделке только после нажатия «Принять». Отклонённое значение больше не предлагается.
      </div>
      {groups.map(list => {
        const d = list[0].deal;
        const key = list.map(x => x.id).join(',');
        return (
          <Card key={list[0].deal_id} className={`border ${busy === key ? 'opacity-60 pointer-events-none' : ''}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="font-medium text-primary hover:underline text-left min-w-0 truncate" onClick={() => onOpenDeal?.(list[0].deal_id)}>
                  {d?.client_name || 'Сделка'}
                </button>
                <span className="text-xs text-muted-foreground">{[d ? managerName(d.manager_id) : null, d?.contract_number ? `договор №${d.contract_number}` : null, d?.status === 'pending' ? 'ждёт подтверждения' : null].filter(Boolean).join(' · ')}</span>
                {list.length > 1 && (
                  <div className="ml-auto flex gap-1.5 w-full sm:w-auto">
                    <Button size="sm" variant="ghost" className="h-8 flex-1 sm:flex-none text-muted-foreground" onClick={() => decide(list, false)}><X size={14} className="mr-1" />Отклонить все</Button>
                    <Button size="sm" className="h-8 flex-1 sm:flex-none" onClick={() => decide(list, true)}><CheckCheck size={14} className="mr-1" />Принять все</Button>
                  </div>
                )}
              </div>
              <div className="divide-y rounded-lg border">
                {list.map(c => (
                  <div key={c.id} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                    <div className="flex-1 min-w-[220px]">
                      <span className="text-xs text-muted-foreground mr-2">{CHANGE_FIELD_LABEL[c.field] ?? c.field}</span>
                      <span className="line-through text-muted-foreground break-words">{show(c.field, c.old_value)}</span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className="font-medium break-words">{show(c.field, c.new_value)}</span>
                      <span className="block text-[11px] text-muted-foreground">изменено в {c.source} · {ago(c.created_at)}</span>
                    </div>
                    <div className="flex gap-1.5 ml-auto">
                      <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/30 hover:text-destructive" onClick={() => decide([c], false)}><X size={14} className="mr-1" />Отклонить</Button>
                      <Button size="sm" className="h-8" onClick={() => decide([c], true)}><Check size={14} className="mr-1" />Принять</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
