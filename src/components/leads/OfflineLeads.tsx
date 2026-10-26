import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Store, Plus, Trash2, Phone, Check, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getManagers } from '@/lib/api';
import { supabase } from '@/db/supabase';
import type { Manager } from '@/types/types';

export interface OfflineLead {
  id: string; manager_id: string; client_name: string; client_phone: string | null;
  qualified: boolean; comment: string | null; created_at: string;
}

const KZ = 5 * 3600 * 1000, SHIFT = 4 * 3600 * 1000;
/** Начало текущего рабочего дня (20:00 вчера по Шымкенту) — как в ежедневном отчёте */
export function workDayStart(now = Date.now()) {
  return new Date(Math.floor((now + KZ + SHIFT) / 86400000) * 86400000 - KZ - SHIFT);
}

/** +7 (701) 555-74-65 */
function formatPhone(raw: string) {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('8') || d.startsWith('7')) d = d.slice(1);
  d = d.slice(0, 10);
  if (!d) return '';
  let s = '+7 (' + d.slice(0, 3);
  if (d.length >= 3) s += ')';
  if (d.length > 3) s += ' ' + d.slice(3, 6);
  if (d.length > 6) s += '-' + d.slice(6, 8);
  if (d.length > 8) s += '-' + d.slice(8, 10);
  return s;
}
/** Сохранённые 10 цифр (7071234567) → +7 (707) 123-45-67 */
const showPhone = (d: string) => formatPhone('7' + d);
const phoneDigits = (s: string) => s.replace(/\D/g, '').replace(/^[78]/, '').slice(0, 10);
const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qyzylorda' });

/** Блок на главной: кнопка «Добавить офлайн‑лида» и лиды салона за сегодняшний рабочий день */
export default function OfflineLeadsCard() {
  const { profile, canViewAllLeads: canViewAllManagers, canEditAllLeads } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<OfflineLead[] | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const myId = profile?.manager_id ?? null;

  const load = useCallback(async () => {
    let q = supabase.from('offline_leads').select('*').gte('created_at', workDayStart().toISOString()).order('created_at', { ascending: false });
    if (!canViewAllManagers && myId) q = q.eq('manager_id', myId);
    const { data } = await q;
    setRows((data as OfflineLead[]) ?? []);
  }, [canViewAllManagers, myId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (canViewAllManagers) getManagers().then(m => setManagers(m.filter(x => x.is_active !== false))).catch(() => {});
  }, [canViewAllManagers]);

  if (!myId && !canViewAllManagers) return null;

  const list = rows ?? [];
  const q = list.filter(r => r.qualified).length;
  const mName = (id: string) => managers.find(m => m.id === id)?.name;

  async function remove(r: OfflineLead) {
    if (!confirm(`Удалить «${r.client_name}»?`)) return;
    const { error } = await supabase.from('offline_leads').delete().eq('id', r.id);
    if (error) { toast.error('Не удалось удалить'); return; }
    setRows(p => (p ?? []).filter(x => x.id !== r.id));
  }

  return (
    <section className="wl-up rounded-2xl border border-border bg-card p-4 md:p-5" style={{ animationDelay: '.08s' }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0"><Store size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">Офлайн‑лиды (салон)</div>
          <div className="text-xs text-muted-foreground">
            {rows == null ? '…' : list.length
              ? <>сегодня {list.length}: квал {q} · не квал {list.length - q}</>
              : 'сегодня пока никого — добавьте каждого, кто зашёл в салон'}
          </div>
        </div>
        <Button className="h-12 w-full sm:w-auto px-5 text-base rounded-xl" onClick={() => setOpen(true)}>
          <Plus size={18} className="mr-1.5" />Добавить офлайн‑лида
        </Button>
      </div>

      {list.length > 0 && (
        <div className="mt-3 divide-y rounded-xl border">
          {list.map(r => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${r.qualified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-muted text-muted-foreground border'}`}>
                {r.qualified ? 'квал' : 'не квал'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.client_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[time(r.created_at), r.client_phone ? showPhone(r.client_phone) : null, canViewAllManagers ? mName(r.manager_id) : null, r.comment].filter(Boolean).join(' · ')}
                </div>
              </div>
              {r.client_phone && (
                <a href={`tel:+7${r.client_phone}`} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0" aria-label="Позвонить"><Phone size={14} /></a>
              )}
              {(canEditAllLeads || r.manager_id === myId) && (
                <button type="button" onClick={() => remove(r)} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0" aria-label="Удалить"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      <OfflineLeadDialog open={open} onOpenChange={setOpen} managers={canEditAllLeads ? managers : []} defaultManager={myId}
        onSaved={r => setRows(p => [r, ...(p ?? [])])} />
    </section>
  );
}

export function OfflineLeadDialog({ open, onOpenChange, managers, defaultManager, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; managers: Manager[]; defaultManager: string | null; onSaved: (r: OfflineLead) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [qual, setQual] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [manager, setManager] = useState<string>(defaultManager ?? '');
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState<string | null>(null);

  useEffect(() => { if (open) { setName(''); setPhone(''); setQual(null); setComment(''); setDup(null); setManager(defaultManager ?? ''); } }, [open, defaultManager]);

  // Уже был в салоне за последние 60 дней?
  const digits = phoneDigits(phone);
  useEffect(() => {
    setDup(null);
    if (digits.length !== 10) return;
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    supabase.from('offline_leads').select('client_name, created_at').eq('client_phone', digits).gte('created_at', since).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        const r = (data as { client_name: string; created_at: string }[] | null)?.[0];
        if (r) setDup(`${r.client_name} уже был в салоне ${new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`);
      });
  }, [digits]);

  const phoneOk = digits.length === 0 || digits.length === 10;
  const ready = name.trim().length > 0 && qual !== null && phoneOk && !!manager;

  async function save() {
    if (!ready) return;
    setSaving(true);
    const { data, error } = await supabase.from('offline_leads').insert({
      manager_id: manager, client_name: name.trim(), client_phone: digits || null, qualified: qual, comment: comment.trim() || null,
    }).select('*').single();
    setSaving(false);
    if (error || !data) { toast.error('Не удалось сохранить'); return; }
    toast.success('Офлайн‑лид добавлен');
    onSaved(data as OfflineLead);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Офлайн‑лид</DialogTitle>
          <DialogDescription>Клиент, который пришёл в салон. Попадёт в вечерний отчёт.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); save(); }}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Имя</span>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Как зовут клиента" maxLength={120} autoComplete="off" className="h-11" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Номер телефона</span>
            <Input value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="+7 (___) ___-__-__" inputMode="tel" autoComplete="off" className="h-11 tabular-nums" />
            {!phoneOk && <span className="block text-xs text-destructive">Номер неполный — 10 цифр после +7</span>}
            {dup && <span className="block text-xs text-amber-700">{dup}</span>}
          </label>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Лид</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setQual(true)}
                className={`h-12 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${qual === true ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-muted'}`}>
                <Check size={16} />Квал
              </button>
              <button type="button" onClick={() => setQual(false)}
                className={`h-12 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${qual === false ? 'bg-slate-700 text-white border-slate-700' : 'hover:bg-muted'}`}>
                <X size={16} />Не квал
              </button>
            </div>
          </div>
          {managers.length > 0 && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Менеджер</span>
              <select value={manager} onChange={e => setManager(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— выберите —</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Комментарий <span className="text-muted-foreground font-normal">— необязательно</span></span>
            <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Что интересует, откуда узнал" maxLength={500} className="h-11" />
          </label>
          <Button type="submit" className="w-full h-12 text-base" disabled={!ready || saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
