import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Phone, MessageCircle, ChevronDown, ChevronRight, ShoppingBag, Users, FileText, Calculator, Hammer, Loader2 } from 'lucide-react';
import TrelloLookup from '@/components/trello/TrelloLookup';
import { loadClientHistory, type ClientHistory, type HDeal } from '@/lib/clientHistory';
import { fmtPhoneKey, phoneKeys } from '@/lib/phone';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DEAL_STAGE_LABELS, CLIENT_QUALITY_LABELS } from '@/types/types';

const STATUS: Record<string, [string, string]> = {
  pending: ['на проверке', 'bg-amber-50 text-amber-700 border-amber-200'],
  approved: ['подтверждена', 'bg-green-50 text-green-700 border-green-200'],
  rejected: ['отклонена', 'bg-red-50 text-red-700 border-red-200'],
};

/**
 * Карточка клиента по телефону: вся история — покупки с датами и оплатами, лиды CRM, ежедневный отчёт,
 * офлайн-лиды, просчёты, производство. Связывает записи без договора: номер в любом виде (8 777…, +7 777…, 7771…).
 */
export default function ClientHistorySheet({ phone, name, open, onClose }: { phone: string | null; name?: string | null; open: boolean; onClose: () => void }) {
  const [h, setH] = useState<ClientHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const keys = phoneKeys(phone);
  const keyStr = keys.join(',');
  useEffect(() => {
    if (!open) return;
    if (!keys.length) { setH(null); return; }
    setLoading(true); setErr(null);
    loadClientHistory(keys).then(setH).catch(e => setErr(e instanceof Error ? e.message : 'Не удалось загрузить')).finally(() => setLoading(false));
  }, [open, keyStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const real = (h?.deals ?? []).filter(d => d.status !== 'rejected');
  const sum = real.reduce((a, d) => a + d.total_amount, 0);
  const paid = real.reduce((a, d) => a + d.paid_amount, 0);
  const title = h?.names[0] || name || 'Клиент';
  const wa = keys[0] ? `https://wa.me/7${keys[0]}` : null;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-2 space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {keys.map(k => (
              <a key={k} href={`tel:+7${k}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"><Phone size={12} />{fmtPhoneKey(k)}</a>
            ))}
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"><MessageCircle size={12} />WhatsApp</a>}
            {(h?.names.length ?? 0) > 1 && <span className="text-xs text-muted-foreground">также записан как: {h!.names.slice(1, 4).join(', ')}</span>}
          </div>
          {!keys.length && <p className="text-muted-foreground">У этой записи нет телефона — связать не по чему. Добавьте номер клиента.</p>}
          {loading && <p className="text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Собираю историю клиента…</p>}
          {err && <p className="text-destructive">{err}</p>}
          {h && !loading && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat l="Покупок" v={String(real.length)} />
                <Stat l="На сумму" v={formatCurrency(sum)} />
                <Stat l={sum - paid > 0 ? 'Остаток' : 'Оплачено'} v={formatCurrency(sum - paid > 0 ? sum - paid : paid)} warn={sum - paid > 0} />
              </div>

              <Section icon={<ShoppingBag size={15} />} title="История покупок" count={h.deals.length}>
                {h.deals.length === 0 && <p className="text-xs text-muted-foreground">Сделок по этому номеру нет</p>}
                {h.deals.map(d => <DealItem key={d.id} d={d} manager={h.managers.get(d.manager_id ?? '')} />)}
              </Section>

              <Section icon={<Hammer size={15} />} title="Производство (Trello)">
                <TrelloLookup phone={`+7${keys[0]}`} contractNumber={h.deals.find(d => d.contract_number)?.contract_number ?? null} />
              </Section>

              {h.leads.length > 0 && (
                <Section icon={<Users size={15} />} title="Лиды CRM" count={h.leads.length}>
                  {h.leads.map(l => (
                    <Line key={l.id} left={<>{l.client_name}<span className="block text-[11px] text-muted-foreground">{l.pipeline} · {l.stage}{l.lost_reason ? ` · отказ: ${l.lost_reason}` : ''}{l.manager_id ? ` · ${h.managers.get(l.manager_id) ?? ''}` : ''}</span></>}
                      right={<>{l.amount > 0 && <span className="block">{formatCurrency(l.amount)}</span>}<span className="text-[11px] text-muted-foreground">{formatDate(l.created_at)}</span></>} />
                  ))}
                </Section>
              )}

              {h.reports.length > 0 && (
                <Section icon={<FileText size={15} />} title="Ежедневный отчёт" count={h.reports.length}>
                  {h.reports.map(r => (
                    <Line key={r.id} left={<>{r.client_name}<span className="block text-[11px] text-muted-foreground">{DEAL_STAGE_LABELS[r.deal_stage as keyof typeof DEAL_STAGE_LABELS] ?? r.deal_stage} · {CLIENT_QUALITY_LABELS[r.client_quality as keyof typeof CLIENT_QUALITY_LABELS] ?? r.client_quality}{r.manager_id ? ` · ${h.managers.get(r.manager_id) ?? ''}` : ''}{r.comment ? ` · ${r.comment}` : ''}</span></>}
                      right={<>{r.budget ? <span className="block">{formatCurrency(r.budget)}</span> : null}<span className="text-[11px] text-muted-foreground">{formatDate(r.report_date)}</span></>} />
                  ))}
                </Section>
              )}

              {h.offline.length > 0 && (
                <Section icon={<Users size={15} />} title="Офлайн-лиды (салон)" count={h.offline.length}>
                  {h.offline.map(o => <Line key={o.id} left={o.client_name || 'без имени'} right={<span className="text-[11px] text-muted-foreground">{formatDate(o.created_at)}</span>} />)}
                </Section>
              )}

              {h.estimates.length > 0 && (
                <Section icon={<Calculator size={15} />} title="Просчёты" count={h.estimates.length}>
                  {h.estimates.map(e => <EstimateLine key={e.id} e={e} />)}
                </Section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EstimateLine({ e }: { e: ClientHistory['estimates'][number] }) {
  const navigate = useNavigate();
  return (
    <button type="button" className="w-full text-left" onClick={() => navigate(`/estimate?id=${e.id}`)}>
      <Line left={<>Просчёт №{e.number}{e.title ? ` · ${e.title}` : ''}<span className="block text-[11px] text-primary">открыть</span></>}
        right={<><span className="block">{formatCurrency(Number(e.total) || 0)}</span><span className="text-[11px] text-muted-foreground">{formatDate(e.updated_at)}</span></>} />
    </button>
  );
}

function DealItem({ d, manager }: { d: HDeal; manager?: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const st = STATUS[d.status] ?? [d.status, ''];
  const rest = Math.max(0, d.total_amount - d.paid_amount);
  return (
    <div className="rounded-lg border border-border">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-muted/40">
        {open ? <ChevronDown size={15} className="mt-0.5 shrink-0" /> : <ChevronRight size={15} className="mt-0.5 shrink-0" />}
        <span className="flex-1 min-w-0">
          <span className="font-medium">{formatDate(d.deal_date)}</span>
          <span className="text-muted-foreground"> · {d.door_model || 'двери'}{d.contract_number ? ` · дог. ${d.contract_number}` : ' · без договора'}</span>
          <span className="flex flex-wrap gap-1 mt-1">
            <Badge variant="outline" className={`text-[10px] ${st[1]}`}>{st[0]}</Badge>
            {d.stage && <Badge variant="outline" className="text-[10px]">{d.stage}</Badge>}
            {manager && <span className="text-[11px] text-muted-foreground">{manager}</span>}
          </span>
        </span>
        <span className="text-right whitespace-nowrap">
          <span className="block font-medium">{formatCurrency(d.total_amount)}</span>
          <span className={`text-[11px] ${rest > 0 ? 'text-amber-700' : 'text-green-700'}`}>{rest > 0 ? `ост. ${formatCurrency(rest)}` : 'оплачено'}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 space-y-1.5 text-xs">
          {d.address && <p className="text-muted-foreground">Адрес: {d.address}</p>}
          {d.client_name && <p className="text-muted-foreground">Записан как: {d.client_name}{d.client_phone ? ` · ${d.client_phone}` : ''}</p>}
          <p className="font-medium pt-1">Оплаты</p>
          {d.payments.length === 0 && <p className="text-muted-foreground">Оплат пока нет{d.paid_amount > 0 ? ` (в сделке указано ${formatCurrency(d.paid_amount)})` : ''}</p>}
          {d.payments.map(p => (
            <div key={p.id} className="flex justify-between gap-2"><span>{formatDate(p.payment_date)} · {p.channel}{p.comment ? ` · ${p.comment}` : ''}</span><span className="whitespace-nowrap">{formatCurrency(p.amount)}</span></div>
          ))}
          {d.cards.length > 0 && <p className="font-medium pt-1">Производство</p>}
          {d.cards.map(c => (
            <button key={c.id} type="button" className="block text-primary hover:underline text-left" onClick={() => navigate(`/boards/${c.board_id}?card=${c.id}`)}>
              {c.title}{c.list ? ` · ${c.list}` : ''}{c.archived ? ' (в архиве)' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const Stat = ({ l, v, warn }: { l: string; v: string; warn?: boolean }) => (
  <div className="rounded-lg border border-border p-2"><p className="text-[11px] text-muted-foreground">{l}</p><p className={`font-semibold ${warn ? 'text-amber-700' : ''}`}>{v}</p></div>
);
const Section = ({ icon, title, count, children }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <p className="flex items-center gap-1.5 font-semibold">{icon}{title}{count != null && <span className="text-xs font-normal text-muted-foreground">· {count}</span>}</p>
    {children}
  </div>
);
const Line = ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-2 rounded-md border border-border/70 px-2.5 py-1.5 text-xs"><span className="min-w-0">{left}</span><span className="text-right whitespace-nowrap">{right}</span></div>
);
