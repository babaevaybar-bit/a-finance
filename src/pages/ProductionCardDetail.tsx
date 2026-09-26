import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Calendar, ExternalLink, TrendingUp, MessageSquare, ListChecks, MapPin, Phone,
  ChevronDown, Banknote, Ruler, Plus, Package,
} from 'lucide-react';
import { getDealByPhone, getManagers, createDealAndGetId } from '@/lib/api';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal, Manager } from '@/types/types';
import { PAYMENT_METHODS } from '@/types/types';
import DealPayments from '@/components/sales/DealPayments';
import ProductionChecklist from '@/components/production/ProductionChecklist';
import { parseCardName } from './ProductionPage';

interface TrelloLabel { name: string; color: string; }
interface CardLike {
  id: string; name: string; desc: string; due: string | null; url: string; labels: TrelloLabel[];
}
interface TrelloComment { text: string; date: string; by: string | null; }

// Комментарии про оплату обычно содержат «Оплата: 1 200 000(нал)» или
// «Предоплата 100.000тг ... Остаток: ...» — узнаём их отдельно от
// технических (замеры, переписка), чтобы не искать нужное в общей ленте.
const PAYMENT_RE = /(предоплата|оплата|остаток)[:\s]*(?:\d+%\s*)?([\d\s.]{4,})\s*тг/i;
function isPaymentComment(text: string): boolean {
  return PAYMENT_RE.test(text);
}
function extractPaymentSuggestion(comments: TrelloComment[] | null): { amount: number; channel: string } | null {
  if (!comments) return null;
  for (const c of comments) {
    const m = c.text.match(/(?:предоплата|оплата)[:\s]*(?:\d+%\s*)?([\d\s.]{4,})\s*тг?\.?\s*\(?(нал|безнал|kaspi|каспи|перечисл|удал[её]нка)?/i);
    if (m) {
      const amount = Number(m[1].replace(/[\s.]/g, ''));
      if (!amount) continue;
      const hint = (m[2] ?? '').toLowerCase();
      const channel = hint.includes('нал') ? 'Наличные'
        : hint.includes('kaspi') || hint.includes('каспи') ? 'Kaspi Bank'
        : hint.includes('перечисл') || hint.includes('удал') ? 'Перечисление'
        : 'Kaspi Bank';
      return { amount, channel };
    }
  }
  return null;
}

const LABEL_COLOR_MAP: Record<string, string> = {
  green: 'bg-green-100 text-green-800', yellow: 'bg-yellow-100 text-yellow-800',
  orange: 'bg-orange-100 text-orange-800', red: 'bg-red-100 text-red-800',
  purple: 'bg-purple-100 text-purple-800', blue: 'bg-blue-100 text-blue-800',
  sky: 'bg-sky-100 text-sky-800', lime: 'bg-lime-100 text-lime-800',
  pink: 'bg-pink-100 text-pink-800', black: 'bg-slate-200 text-slate-800',
};
function labelClass(color: string) {
  return LABEL_COLOR_MAP[color] ?? 'bg-muted text-muted-foreground';
}

const STATUS_LABELS: Record<string, string> = { pending: 'на проверке', approved: 'подтверждена', rejected: 'отклонена' };
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

// Свёрнутая по умолчанию секция — заголовок кликается, стрелка крутится
function CollapsibleSection({ title, icon, defaultOpen, children }: {
  title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground py-1"
      >
        <span className="flex items-center gap-1.5">{icon}{title}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </section>
  );
}

function CreateDealInline({ card, parsed, onCreated }: {
  card: CardLike; parsed: ReturnType<typeof parseCardName>; onCreated: (deal: Deal) => void;
}) {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [managerId, setManagerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Kaspi Bank');
  const [amount, setAmount] = useState(parsed.amount ?? 0);
  const [creating, setCreating] = useState(false);

  useEffect(() => { getManagers().then(setManagers).catch(() => {}); }, []);

  async function handleCreate() {
    if (!managerId || amount <= 0) return;
    setCreating(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const dealId = await createDealAndGetId({
        manager_id: managerId,
        month_year: today.slice(0, 7),
        deal_date: today,
        client_phone: parsed.phone,
        address: parsed.address,
        client_name: parsed.client,
        door_model: parsed.product,
        contract_number: null,
        payment_method: paymentMethod,
        total_amount: amount,
        paid_amount: 0,
        prepayment_date: null,
        comment: `Создано из карточки производства «${card.name}»`,
        salary_amount: null,
        vat_gross_amount: null,
        status: 'pending',
        stage: 'new',
      });
      const created = await getDealByPhone(parsed.phone ?? '');
      if (created) onCreated(created);
      void dealId;
    } catch { /* silent */ }
    finally { setCreating(false); }
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-3 space-y-2.5">
      <p className="text-xs text-muted-foreground">
        Клиент, телефон и адрес уже подставлены из карточки — проверьте сумму и выберите менеджера.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Менеджер</Label>
          <Select value={managerId} onValueChange={setManagerId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Выберите" /></SelectTrigger>
            <SelectContent>
              {managers.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Способ оплаты</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Сумма</Label>
          <Input type="number" className="h-8 text-xs" value={amount} onChange={e => setAmount(Number(e.target.value))} />
        </div>
      </div>
      <Button size="sm" className="h-7 text-xs w-full" disabled={creating || !managerId || amount <= 0} onClick={handleCreate}>
        Создать сделку
      </Button>
    </div>
  );
}

export default function ProductionCardDetail({
  card, effectiveStage, allStages, onStageChange, open, onClose,
}: {
  card: CardLike | null;
  effectiveStage: string;
  allStages: string[];
  onStageChange: (cardId: string, stage: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [deal, setDeal] = useState<Deal | null | 'loading'>('loading');
  const [comments, setComments] = useState<TrelloComment[] | null>(null);
  const [extractedPhone, setExtractedPhone] = useState<string | null>(null);
  const [showCreateDeal, setShowCreateDeal] = useState(false);

  useEffect(() => {
    if (!card || !open) return;
    setDeal('loading');
    setComments(null);
    setShowCreateDeal(false);

    const phoneMatch = card.name.match(/(\+?7|8)[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/);
    if (phoneMatch) {
      setExtractedPhone(phoneMatch[0]);
      getDealByPhone(phoneMatch[0]).then(setDeal).catch(() => setDeal(null));
    } else {
      setExtractedPhone(null);
      setDeal(null);
    }

    supabase.auth.getSession().then(({ data: { session } }) =>
      supabase.functions.invoke(`trello-card-comments?cardId=${card.id}`, {
        method: 'GET',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
    ).then(res => setComments(res.data?.comments ?? []))
      .catch(() => setComments([]));
  }, [card?.id, open]);

  if (!card) return null;
  const parsed = parseCardName(card.name);
  const lastPaymentComment = comments?.find(c => isPaymentComment(c.text)) ?? null;
  const lastTechComment = comments?.find(c => !isPaymentComment(c.text)) ?? null;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left space-y-0">
          <div className="flex items-start justify-between gap-3">
            <SheetTitle className="text-lg leading-snug">{parsed.client}</SheetTitle>
            {parsed.amount != null && (
              <span className="text-lg font-semibold whitespace-nowrap shrink-0">{formatCurrency(parsed.amount)}</span>
            )}
          </div>

          {(parsed.address || parsed.product || parsed.phone) && (
            <dl className="mt-3 grid grid-cols-[16px_1fr] gap-x-2 gap-y-1.5 text-sm">
              {parsed.address && (
                <>
                  <MapPin size={14} className="mt-0.5 text-muted-foreground" />
                  <dd className="text-muted-foreground">{parsed.address}</dd>
                </>
              )}
              {parsed.product && (
                <>
                  <Package size={14} className="mt-0.5 text-muted-foreground" />
                  <dd className="text-muted-foreground">{parsed.product}</dd>
                </>
              )}
              {parsed.phone && (
                <>
                  <Phone size={14} className="mt-0.5 text-muted-foreground" />
                  <dd className="text-muted-foreground">{parsed.phone}</dd>
                </>
              )}
            </dl>
          )}

          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2 flex-wrap">
            <Select value={effectiveStage} onValueChange={v => onStageChange(card.id, v)}>
              <SelectTrigger className="h-8 text-xs w-auto"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allStages.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <a href={card.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
              Открыть в Trello<ExternalLink size={11} />
            </a>
          </div>

          {(card.labels.length > 0 || card.due) && (
            <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
              {card.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {card.labels.map((lb, i) => (
                    <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${labelClass(lb.color)}`}>{lb.name}</span>
                  ))}
                </div>
              ) : <span />}
              {card.due && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                  <Calendar size={12} />{formatDate(card.due)}
                </p>
              )}
            </div>
          )}
        </SheetHeader>

        {/* Краткая сводка — не нужно листать вниз, чтобы узнать последнее состояние */}
        {(lastPaymentComment || lastTechComment) && (
          <div className="mt-4 rounded-lg bg-muted/40 p-3 space-y-1.5">
            {lastPaymentComment && (
              <p className="text-xs flex items-start gap-1.5">
                <Banknote size={12} className="mt-0.5 shrink-0 text-green-700" />
                <span className="line-clamp-1">{lastPaymentComment.text}</span>
              </p>
            )}
            {lastTechComment && (
              <p className="text-xs flex items-start gap-1.5 text-muted-foreground">
                <Ruler size={12} className="mt-0.5 shrink-0" />
                <span className="line-clamp-1">{lastTechComment.text}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-4 space-y-4 text-sm">
          {/* Связанная сделка в «Продажи» */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp size={13} />Сделка в «Продажи»
            </p>
            {deal === 'loading' ? (
              <p className="text-xs text-muted-foreground">Ищу по телефону...</p>
            ) : deal === null ? (
              showCreateDeal ? (
                <CreateDealInline card={card} parsed={parsed} onCreated={d => { setDeal(d); setShowCreateDeal(false); }} />
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Сделка ещё не подтверждена в «Продажи» (или пока не заведена).
                  </p>
                  {parsed.phone && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowCreateDeal(true)}>
                      <Plus size={12} className="mr-1" />Создать сделку
                    </Button>
                  )}
                </div>
              )
            ) : (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{formatCurrency(deal.total_amount)}</span>
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[deal.status]}`}>{STATUS_LABELS[deal.status]}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Оплачено: {formatCurrency(deal.paid_amount)}</span>
                  <span>Остаток: {formatCurrency(Math.max(0, deal.total_amount - deal.paid_amount))}</span>
                </div>
                <DealPayments
                  deal={deal}
                  onChanged={() => extractedPhone && getDealByPhone(extractedPhone).then(setDeal)}
                  suggestedAmount={extractPaymentSuggestion(comments)?.amount}
                  suggestedChannel={extractPaymentSuggestion(comments)?.channel}
                />
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs w-full mt-1"
                  onClick={() => navigate(`/sales?manager=${deal.manager_id}&month=${deal.month_year}`)}
                >
                  Открыть сделку в «Продажи» →
                </Button>
              </div>
            )}
          </section>

          <CollapsibleSection title="Чек-лист (только у нас)" icon={<ListChecks size={13} />}>
            <ProductionChecklist trelloCardId={card.id} />
          </CollapsibleSection>

          {card.desc && (
            <CollapsibleSection title="Описание" icon={<MessageSquare size={13} />}>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{card.desc}</p>
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Комментарии из Trello" icon={<MessageSquare size={13} />} defaultOpen>
            {comments === null ? (
              <p className="text-xs text-muted-foreground">Загрузка...</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Пока нет комментариев</p>
            ) : (
              <div className="space-y-1.5">
                {comments.map((c, i) => {
                  const isPayment = isPaymentComment(c.text);
                  return (
                    <div
                      key={i}
                      className={`rounded-lg px-3 py-2 text-xs ${
                        isPayment ? 'bg-green-50 border-l-2 border-green-500' : 'bg-muted/40'
                      }`}
                    >
                      <p className="flex items-start gap-1.5">
                        {isPayment && <Banknote size={11} className="mt-0.5 shrink-0 text-green-700" />}
                        <span>{c.text}</span>
                      </p>
                      <p className="text-muted-foreground mt-0.5">{c.by ? `${c.by} · ` : ''}{formatDate(c.date)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}
