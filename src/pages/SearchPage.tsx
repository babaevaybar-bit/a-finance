import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, MapPin, TrendingUp, ClipboardList } from 'lucide-react';
import { searchDealsByQuery, searchClientReportsByQuery, getManagers } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, ClientReport, Manager } from '@/types/types';
import { CLIENT_QUALITY_LABELS, DEAL_STAGE_LABELS } from '@/types/types';
import TrelloLookup from '@/components/trello/TrelloLookup';

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
  const [clients, setClients] = useState<ClientReport[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(false);

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

  const nothingFound = q.trim().length >= 2 && !loading && deals.length === 0 && clients.length === 0;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold">Поиск клиента</h1>
          <p className="text-sm text-muted-foreground mt-0.5">По имени или телефону — сразу по «Продажам» и «Ежедневному отчёту»</p>
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
                  onClick={() => navigate(`/sales?manager=${d.manager_id}&month=${d.month_year}`)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm">{d.client_name || 'Без имени'}</span>
                    <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLORS[d.status]}`}>
                      {STATUS_LABELS[d.status] ?? d.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    {d.client_phone && <span className="flex items-center gap-1"><Phone size={11} />{d.client_phone}</span>}
                    {d.address && <span className="flex items-center gap-1"><MapPin size={11} />{d.address}</span>}
                    <span>{formatDate(d.deal_date)}</span>
                    <span>{managerName(d.manager_id)}</span>
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
    </AppLayout>
  );
}
