import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, CheckCircle, XCircle, Factory } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal } from '@/types/types';

const STATUS = {
  pending:  { label: 'На проверке',  cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock },
  approved: { label: 'Подтверждена', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle },
  rejected: { label: 'Отклонена',    cls: 'bg-red-50 text-red-700 border-red-200', Icon: XCircle },
} as const;

/** Для менеджера: статусы его сделок (без кнопок подтверждения). Свои сделки отдаёт RLS. */
export default function MyDealStatuses() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [filter, setFilter] = useState<'all' | Deal['status']>('all');

  useEffect(() => {
    const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    supabase.from('deals').select('id, client_name, contract_number, total_amount, paid_amount, deal_date, status, production_stage, created_at')
      .gte('deal_date', since).order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => setDeals((data as Deal[]) ?? []));
  }, []);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    for (const d of deals ?? []) c[d.status] += 1;
    return c;
  }, [deals]);
  const list = (deals ?? []).filter(d => filter === 'all' || d.status === filter);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Подтверждение сделок</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Статусы ваших сделок за 90 дней. Подтверждает руководитель.</p>
      </div>

      <div className="tabs-scroll flex gap-1.5 overflow-x-auto">
        {([['all', `Все ${deals?.length ?? ''}`], ['pending', `На проверке ${counts.pending}`], ['approved', `Подтверждены ${counts.approved}`], ['rejected', `Отклонены ${counts.rejected}`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`h-8 px-3 rounded-full text-sm whitespace-nowrap border transition-colors ${filter === k ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>{l}</button>
        ))}
      </div>

      {deals === null ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Сделок нет</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {list.map(d => {
              const st = STATUS[d.status];
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1 basis-[60%]">
                    <div className="font-medium truncate">{d.client_name || 'Без имени'}</div>
                    <div className="text-xs text-muted-foreground">
                      {[formatDate(d.deal_date), d.contract_number ? `№${d.contract_number}` : null, formatCurrency(Number(d.total_amount))].filter(Boolean).join(' · ')}
                    </div>
                    {d.status === 'approved' && d.production_stage && (
                      <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1"><Factory size={11} />{d.production_stage}</div>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border shrink-0 ${st.cls}`}>
                    <st.Icon size={12} />{st.label}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
