import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Calendar, ExternalLink, TrendingUp, MessageSquare, ListChecks } from 'lucide-react';
import { getDealByPhone } from '@/lib/api';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Deal } from '@/types/types';
import DealPayments from '@/components/sales/DealPayments';
import ProductionChecklist from '@/components/production/ProductionChecklist';

// Комментарии обычно содержат «Оплата: 1 200 000(нал)» — вытаскиваем сумму
// и подсказку канала, чтобы предзаполнить форму «Добавить оплату», а не
// перепечатывать вручную.
function extractPaymentSuggestion(comments: TrelloComment[] | null): { amount: number; channel: string } | null {
  if (!comments) return null;
  for (const c of comments) {
    const m = c.text.match(/оплата[:\s]*(?:\d+%\s*)?([\d\s]{4,})\s*тг?\.?\s*\(?(нал|безнал|kaspi|каспи|перечисл)?/i);
    if (m) {
      const amount = Number(m[1].replace(/\s/g, ''));
      if (!amount) continue;
      const hint = (m[2] ?? '').toLowerCase();
      const channel = hint.includes('нал') ? 'Наличные'
        : hint.includes('kaspi') || hint.includes('каспи') ? 'Kaspi Bank'
        : hint.includes('перечисл') ? 'Перечисление'
        : 'Kaspi Bank';
      return { amount, channel };
    }
  }
  return null;
}

interface TrelloLabel { name: string; color: string; }
interface CardLike {
  id: string; name: string; desc: string; due: string | null; url: string; labels: TrelloLabel[];
}
interface TrelloComment { text: string; date: string; by: string | null; }

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

  useEffect(() => {
    if (!card || !open) return;
    setDeal('loading');
    setComments(null);

    // Телефон встроен прямо в название карточки (у вас так принято) —
    // вытаскиваем и ищем совпадение среди сделок в «Продажи»
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

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left space-y-3">
          <SheetTitle className="text-base leading-snug">{card.name}</SheetTitle>
          <div className="flex items-center gap-2">
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
          {card.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.labels.map((lb, i) => (
                <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${labelClass(lb.color)}`}>{lb.name}</span>
              ))}
            </div>
          )}
          {card.due && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar size={12} />Срок: {formatDate(card.due)}
            </p>
          )}
        </SheetHeader>

        <div className="mt-5 space-y-5 text-sm">
          {/* Связанная сделка в «Продажи» */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp size={13} />Сделка в «Продажи»
            </p>
            {deal === 'loading' ? (
              <p className="text-xs text-muted-foreground">Ищу по телефону...</p>
            ) : deal === null ? (
              <p className="text-xs text-muted-foreground">Не найдена — либо телефон в названии не распознан, либо сделки пока нет в «Продажи».</p>
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

          {/* Свой чек-лист — не зависит от Trello */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ListChecks size={13} />Чек-лист (только у нас)
            </p>
            <ProductionChecklist trelloCardId={card.id} />
          </section>

          {/* Описание из Trello */}
          {card.desc && (
            <section className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Описание</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{card.desc}</p>
            </section>
          )}

          {/* Комментарии из Trello */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <MessageSquare size={13} />Комментарии из Trello
            </p>
            {comments === null ? (
              <p className="text-xs text-muted-foreground">Загрузка...</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Пока нет комментариев</p>
            ) : (
              <div className="space-y-1.5">
                {comments.map((c, i) => (
                  <div key={i} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                    <p>{c.text}</p>
                    <p className="text-muted-foreground mt-0.5">{c.by ? `${c.by} · ` : ''}{formatDate(c.date)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
