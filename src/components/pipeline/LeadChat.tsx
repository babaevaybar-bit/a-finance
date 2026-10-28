import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Send, Check, CheckCheck, AlertCircle, FileText, Image as ImageIcon, PhoneMissed, Mic } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { type CrmMessage, getMessages, sendWhatsApp, markRead } from '@/lib/crm';

const KZ = 'Asia/Qyzylorda';
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: KZ });
const dayLabel = (iso: string) => {
  const k = dayKey(iso);
  const today = dayKey(new Date().toISOString()), yest = dayKey(new Date(Date.now() - 86400000).toISOString());
  if (k === today) return 'Сегодня';
  if (k === yest) return 'Вчера';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: KZ });
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: KZ });

function Body({ m }: { m: CrmMessage }) {
  if (m.type === 'image' && m.content_uri) return <a href={m.content_uri} target="_blank" rel="noopener noreferrer"><img src={m.content_uri} alt="Фото" className="rounded-lg max-h-60 object-cover" /></a>;
  if (m.type === 'audio' && m.content_uri) return <audio controls src={m.content_uri} className="max-w-[240px]" />;
  if (m.type === 'video' && m.content_uri) return <video controls src={m.content_uri} className="rounded-lg max-h-60" />;
  if ((m.type === 'document' || m.type === 'video' || m.type === 'image') && m.content_uri)
    return <a href={m.content_uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline"><FileText size={14} />Открыть файл</a>;
  if (m.type === 'missing_call') return <span className="inline-flex items-center gap-1.5"><PhoneMissed size={14} />Пропущенный звонок</span>;
  if (!m.text && m.type === 'audio') return <span className="inline-flex items-center gap-1.5"><Mic size={14} />Голосовое</span>;
  if (!m.text && m.type === 'image') return <span className="inline-flex items-center gap-1.5"><ImageIcon size={14} />Фото</span>;
  return <span className="whitespace-pre-wrap break-words">{m.text ?? 'Сообщение'}</span>;
}

function Tick({ s }: { s: string | null }) {
  if (s === 'error') return <AlertCircle size={13} className="text-red-200" />;
  if (s === 'read') return <CheckCheck size={13} className="text-sky-200" />;
  if (s === 'delivered') return <CheckCheck size={13} className="opacity-70" />;
  return <Check size={13} className="opacity-70" />;
}

/** Переписка WhatsApp с клиентом прямо в карточке лида. Новые сообщения приходят сами (realtime). */
export default function LeadChat({ leadId, hasPhone, onSent }: { leadId: string; hasPhone: boolean; onSent?: (text: string) => void }) {
  const [msgs, setMsgs] = useState<CrmMessage[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getMessages(leadId).then(m => { if (alive) setMsgs(m); }).catch(() => setMsgs([]));
    markRead(leadId).catch(() => {});
    const ch = supabase.channel(`crm-msg-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_messages', filter: `lead_id=eq.${leadId}` }, p => {
        const row = p.new as CrmMessage;
        if (!row?.id) return;
        setMsgs(prev => {
          const list = prev ?? [];
          const i = list.findIndex(x => x.id === row.id);
          if (i >= 0) { const n = [...list]; n[i] = row; return n; }
          return [...list, row];
        });
        if (row.direction === 'in') markRead(leadId).catch(() => {});
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [leadId]);

  useLayoutEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length]);

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const { message } = await sendWhatsApp(leadId, t);
      setText('');
      if (message) setMsgs(prev => (prev ?? []).some(x => x.id === message.id) ? prev : [...(prev ?? []), message]);
      onSent?.(t);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отправить');
    } finally { setSending(false); }
  }

  let lastDay = '';
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-1.5 bg-[#efeae2] dark:bg-muted/30">
        {msgs === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className={`h-10 w-2/3 rounded-xl bg-background/70 animate-pulse ${i % 2 ? '' : 'ml-auto'}`} />)}</div>
        ) : msgs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">{hasPhone ? 'Переписки пока нет. Напишите клиенту первым.' : 'У лида нет номера телефона.'}</p>
        ) : msgs.map(m => {
          const k = dayKey(m.created_at);
          const sep = k !== lastDay ? (lastDay = k, <div key={`d-${k}`} className="text-center py-1"><span className="text-[11px] bg-background/80 rounded-full px-2.5 py-0.5 text-muted-foreground">{dayLabel(m.created_at)}</span></div>) : null;
          const out = m.direction === 'out';
          return (
            <div key={m.id}>
              {sep}
              <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-sm shadow-sm ${out ? 'bg-emerald-600 text-white rounded-br-md' : 'bg-background rounded-bl-md'}`}>
                  {out && m.author_name && <div className="text-[10px] opacity-75 mb-0.5">{m.author_name}</div>}
                  <Body m={m} />
                  <div className={`flex items-center justify-end gap-1 text-[10px] mt-0.5 ${out ? 'text-white/75' : 'text-muted-foreground'}`}>
                    {hhmm(m.created_at)}{out && <Tick s={m.status} />}
                  </div>
                  {m.status === 'error' && m.error && <div className="text-[11px] text-red-100 mt-0.5">{m.error}</div>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t p-3 flex gap-2 items-end bg-background">
        <Textarea value={text} onChange={e => setText(e.target.value)} disabled={!hasPhone}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          placeholder={hasPhone ? 'Сообщение в WhatsApp…' : 'Добавьте номер телефона в карточке'} rows={1} className="min-h-[42px] max-h-32 resize-none" />
        <Button onClick={send} disabled={!text.trim() || sending || !hasPhone} size="icon" className="h-[42px] w-[42px] shrink-0 bg-emerald-600 hover:bg-emerald-700" aria-label="Отправить">
          <Send size={17} />
        </Button>
      </div>
    </div>
  );
}
