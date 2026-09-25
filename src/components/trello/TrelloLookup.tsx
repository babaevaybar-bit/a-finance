import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ChevronDown } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { supabase } from '@/db/supabase';

export interface TrelloMatch {
  id: string; name: string; desc: string; due: string | null; url: string;
  stage: string; labels: { name: string; color: string }[]; matchedBy: 'phone' | 'contract';
}
export interface TrelloComment { text: string; date: string; by: string | null; }

/**
 * Раскрывающийся блок «Данные из Trello» — по клику ищет карточку на доске
 * производства по телефону клиента (и/или номеру договора) и показывает
 * текущий этап, метки, описание и комментарии. Используется на страницах
 * «Подтверждения», «Продажи», «Ежедневный отчёт» и в «Поиске» — везде, где
 * есть телефон клиента, чтобы не заходить в саму Trello.
 */
export default function TrelloLookup({ phone, contractNumber }: { phone: string | null; contractNumber?: string | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<TrelloMatch[] | null>(null);
  const [comments, setComments] = useState<TrelloComment[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setOpen(true);
    if (matches !== null) return; // уже загружено — не запрашиваем повторно
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams();
      if (phone) params.set('phone', phone);
      if (contractNumber) params.set('contract', contractNumber);
      const res = await supabase.functions.invoke(`trello-deal-lookup?${params.toString()}`, {
        method: 'GET',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (res.error || res.data?.error) {
        setError(res.data?.error ?? res.error?.message ?? 'Ошибка');
      } else {
        setMatches(res.data?.matches ?? []);
        setComments(res.data?.comments ?? []);
      }
    } catch { setError('Не удалось связаться с Trello'); }
    finally { setLoading(false); }
  }

  if (!phone && !contractNumber) return null;

  return (
    <div>
      <button
        type="button"
        className="text-xs text-primary flex items-center gap-1 hover:underline"
        onClick={() => (open ? setOpen(false) : handleOpen())}
      >
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        Данные из Trello
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-2">
          {loading && <p className="text-xs text-muted-foreground">Загрузка...</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {matches && matches.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground">Карточка не найдена (по телефону/договору)</p>
          )}
          {matches?.map(m => (
            <div key={m.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="secondary" className="text-xs">{m.stage}</Badge>
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                  Открыть в Trello<ExternalLink size={10} />
                </a>
              </div>
              {m.labels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.labels.map((lb, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border">{lb.name}</span>
                  ))}
                </div>
              )}
              {m.desc && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{m.desc}</p>}
              {m.due && <p className="text-xs text-muted-foreground">Срок: {formatDate(m.due)}</p>}
              {comments.length > 0 && (
                <div className="pt-1.5 border-t border-border/60 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Заметки/комментарии:</p>
                  {comments.map((c, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {c.by ? `${c.by}: ` : ''}{c.text} <span className="opacity-60">({formatDate(c.date)})</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
