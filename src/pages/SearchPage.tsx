import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, MapPin, TrendingUp, ClipboardList, Users } from 'lucide-react';
import { searchDealsByQuery, searchClientReportsByQuery, getManagers } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, ClientReport, Manager } from '@/types/types';
import { CLIENT_QUALITY_LABELS, DEAL_STAGE_LABELS } from '@/types/types';
import TrelloLookup from '@/components/trello/TrelloLookup';
import DealFormDialog from '@/components/sales/DealFormDialog';
import DealCompleteness from '@/components/sales/DealCompleteness';
import ClientHistorySheet from '@/components/client/ClientHistorySheet';
import { phoneKeys, fmtPhoneKey } from '@/lib/phone';

const STATUS_LABELS: Record<string, string> = { pending: 'на проверке', approved: 'подтверждена', rejected: 'отклонена' };
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = searchParams.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [clients, setClients] = useState<ClientReport[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<{ phone: string; name?: string | null } | null>(null);

  useEffect(() => { setInput(q); }, [q]);

  useEffect(() => {
    if (q.trim().length < 2) { setDeals([]); setClients([]); return; }
    setLoading(true);
    Promise.all([searchDealsByQuery(q.trim()), searchClientReportsByQuery(q.trim()), getManagers()])
      .then(([d, c, m]) => { setDeals(d); setClients(c); setManagers(m); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q]);

  function managerName(id: string | null) {
    return managers.find(m => m.id === id)?.name ?? '—';
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSearchParams(input.trim() ? { q: input.trim() } : {});
  }

  // Найденные клиенты: записи с одним номером (в любом написании) — один клиент
  const people = (() => {
    const m = new Map<string, { key: string; names: Set<string>; deals: number; sum: number; reports: number }>();
    const add = (phone: string | null, name: string | null, deal?: number) => {
      for (const k of phoneKeys(phone)) {
        if (!m.has(k)) m.set(k, { key: k, names: new Set(), deals: 0, sum: 0, reports: 0 });
        const x = m.get(k)!;
        if (name?.trim()) x.names.add(name.trim());
        if (deal != null) { x.deals++; x.sum += deal; } else x.reports++;
      }
    };
    deals.forEach(d => add(d.client_phone, d.client_name, d.status === 'rejected' ? 0 : Number(d.total_amount) || 0));
    clients.forEach(c => add(c.client_phone, c.client_name));
    return [...m.values()].sort((a, b) => b.deals - a.deals || b.reports - a.reports);
  })();

  const nothingFound = q.trim().length >= 2 && !loading && deals.length === 0 && clients.length === 0;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold">Поиск клиента</h1>
          <p className="text-sm text-muted-foreground mt-0.5">По имени, договору или телефону в любом виде (8 777…, +7 777…, 777…) — с карточкой клиента и историей покупок</p>
        </div>

        <form onSubmit={submit}>
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Имя или номер телефона..."
            className="w-full h-11 rounded-lg border border-border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </form>

        {q.trim().length > 0 && q.trim().length < 2 && (
          <p className="text-sm text-muted-foreground">Введите хотя бы 2 символа</p>
        )}

        {loading && <p className="text-sm text-muted-foreground">Ищу...</p>}

        {nothingFound && (
          <p className="text-sm text-muted-foreground">Ничего не найдено по запросу «{q}»</p>
        )}

        {people.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2"><Users size={14} />Карточки клиентов ({people.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border">
              {people.map(p => (
                <button key={p.key} type="button" onClick={() => setCard({ phone: p.key, name: [...p.names][0] })}
                  className="w-full px-4 py-3 text-left hover:bg-muted/40 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-sm">{[...p.names][0] || 'Без имени'}</span>
                    {p.names.size > 1 && <span className="text-xs text-muted-foreground"> · также: {[...p.names].slice(1, 3).join(', ')}</span>}
                    <span className="block text-xs text-muted-foreground">{fmtPhoneKey(p.key)} · покупок: {p.deals}{p.reports ? ` · в отчёте: ${p.reports}` : ''}</span>
                  </span>
                  <span className="text-right whitespace-nowrap text-sm font-medium">{p.sum > 0 ? formatCurrency(p.sum) : ''}<span className="block text-xs text-primary font-normal">история →</span></span>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {deals.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp size={14} />Сделки в «Продажах» ({deals.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border">
              {deals.map(d => (
                <div
                  key={d.id}
                  className="px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setEditDeal(d)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm flex items-center gap-1.5"><DealCompleteness deal={d} />{d.client_name || 'Без имени'}</span>
                    <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLORS[d.status]}`}>
                      {STATUS_LABELS[d.status] ?? d.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    {d.client_phone && <span className="flex items-center gap-1"><Phone size={11} />{d.client_phone}</span>}
                    {d.address && <span className="flex items-center gap-1"><MapPin size={11} />{d.address}</span>}
                    <span>{formatDate(d.deal_date)}</span>
                    <span>{managerName(d.manager_id)}</span>
                    {d.contract_number && <span>Договор №{d.contract_number}</span>}
                  </div>
                  <div className="text-sm font-medium mt-1">{formatCurrency(d.total_amount)}</div>
                  {d.client_phone && (
                    <div className="mt-1.5" onClick={e => e.stopPropagation()}>
                      <TrelloLookup phone={d.client_phone} contractNumber={d.contract_number} />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {clients.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ClipboardList size={14} />Клиенты в «Ежедневном отчёте» ({clients.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border">
              {clients.map(c => (
                <div
                  key={c.id}
                  className="px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => navigate('/daily-report')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm">{c.client_name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{DEAL_STAGE_LABELS[c.deal_stage]}</Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    {c.client_phone && <span className="flex items-center gap-1"><Phone size={11} />{c.client_phone}</span>}
                    {c.address && <span className="flex items-center gap-1"><MapPin size={11} />{c.address}</span>}
                    <span>{formatDate(c.report_date)}</span>
                    <span>{CLIENT_QUALITY_LABELS[c.client_quality]}</span>
                  </div>
                  {c.deal_id && (
                    <div className="text-xs text-green-700 mt-1">✓ Привязана к сделке в «Продажи»</div>
                  )}
                  {c.client_phone && (
                    <div className="mt-1.5" onClick={e => e.stopPropagation()}>
                      <TrelloLookup phone={c.client_phone} />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
      <ClientHistorySheet open={!!card} phone={card?.phone ?? null} name={card?.name} onClose={() => setCard(null)} />
      {editDeal && (
        <DealFormDialog
          open={!!editDeal}
          deal={editDeal}
          managerId={editDeal.manager_id}
          monthYear={editDeal.month_year}
          onClose={() => setEditDeal(null)}
          onSaved={() => { setEditDeal(null); searchDealsByQuery(q.trim()).then(setDeals).catch(() => {}); }}
        />
      )}
    </AppLayout>
  );
}
