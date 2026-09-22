import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Layers, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';

interface AmoLead {
  id: number;
  name: string;
  price: number;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  status_id: number;
  status_name: string | null;
  pipeline_name: string | null;
  status_color: string | null;
  responsible_user_id: number;
  responsible_user_name: string | null;
  is_lost: boolean;
}

function unixToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export default function AmoCrmPage() {
  const [leads, setLeads] = useState<AmoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('amocrm-leads', {
        method: 'GET',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (res.error || res.data?.error) {
        setError(res.data?.error ?? res.error?.message ?? 'Ошибка загрузки');
        setLeads([]);
      } else {
        setLeads(res.data?.leads ?? []);
      }
    } catch {
      setError('Не удалось связаться с amoCRM');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q ? leads.filter(l => (l.name || '').toLowerCase().includes(q)) : leads;

  const totalAmount = filtered.reduce((s, l) => s + Number(l.price || 0), 0);
  const wonCount = filtered.filter(l => l.status_name === 'Успешно реализовано').length;
  const lostCount = filtered.filter(l => l.is_lost).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Layers size={20} className="text-primary" />
              amoCRM
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Сделки, подтянутые из amoCRM, для отчёта</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию" className="h-9 pl-7 w-56" />
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {!error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Всего сделок</p>
              <p className="text-sm font-semibold mt-0.5">{filtered.length}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Сумма</p>
              <p className="text-sm font-semibold mt-0.5">{formatCurrency(totalAmount)}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Успешно реализовано</p>
              <p className="text-sm font-semibold mt-0.5 text-emerald-600">{wonCount}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Не реализовано</p>
              <p className="text-sm font-semibold mt-0.5 text-destructive">{lostCount}</p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Сделки</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {loading ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">Загрузка...</div>
            ) : filtered.length === 0 && !error ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">Сделок не найдено</div>
            ) : !error && (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Дата создания</TableHead>
                      <TableHead className="whitespace-nowrap">Название</TableHead>
                      <TableHead className="whitespace-nowrap">Воронка / статус</TableHead>
                      <TableHead className="whitespace-nowrap">Ответственный</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Сумма</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(unixToDate(l.created_at))}</TableCell>
                        <TableCell className="text-sm max-w-[240px] truncate">{l.name || `Сделка #${l.id}`}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-muted-foreground">{l.pipeline_name || '—'}</span>
                            <Badge variant="secondary" className="text-[11px] font-normal w-fit">
                              {l.status_name || '—'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{l.responsible_user_name || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-right">{formatCurrency(l.price || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
