import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { Manager } from '@/types/types';
import { waStatus, waSetup, getCrmSettings, type CrmSettings } from '@/lib/crm';

const field = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

/** Главный админ: подключение WhatsApp (Wazzup) к CRM — номер и кому отдавать новые лиды */
export default function WhatsAppSetup({ open, onOpenChange, managers }: { open: boolean; onOpenChange: (v: boolean) => void; managers: Manager[] }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof waStatus>> | null>(null);
  const [settings, setSettings] = useState<CrmSettings | null>(null);
  const [channel, setChannel] = useState('');
  const [manager, setManager] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSt(null);
    getCrmSettings().then(s => { setSettings(s); setChannel(s?.wa_channel_id ?? ''); setManager(s?.new_lead_manager_id ?? ''); });
    waStatus().then(r => { setSt(r); if (!channel && r.channels?.[0]) setChannel(r.channels[0].id); })
      .catch(e => setSt({ connected: false, reason: e instanceof Error ? e.message : 'error' }));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const lidorub = managers.find(m => m.role === 'Лидоруб');
  const connected = !!settings?.wa_channel_id && !!st?.webhook?.includes('crm-whatsapp');

  async function save() {
    setBusy(true);
    try {
      await waSetup(channel, manager || null);
      toast.success('WhatsApp подключён к CRM');
      setSettings(await getCrmSettings());
      setSt(await waStatus());
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Не удалось подключить'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>WhatsApp в CRM</DialogTitle>
          <DialogDescription>Переписка с клиентами прямо в карточке лида. Сообщение с нового номера само создаёт лида.</DialogDescription>
        </DialogHeader>
        {st === null ? (
          <div className="h-24 rounded-lg bg-muted animate-pulse" />
        ) : !st.connected ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1.5">
            <div className="font-medium flex items-center gap-1.5"><AlertTriangle size={15} />Нет ключа Wazzup</div>
            <p>В Wazzup: Настройки → Интеграция с CRM → amoCRM → скопируйте ключ API (Sidecar). Ключ хранится в защищённых настройках сайта, на этой странице его не вводят.</p>
            {st.reason && st.reason !== 'no_key' && <p className="text-xs">Ошибка: {st.reason}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {connected && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-sm text-emerald-900 flex items-center gap-1.5"><CheckCircle2 size={15} />Подключено{settings?.wa_phone ? ` · номер ${settings.wa_phone}` : ''}</div>}
            {!st.keyOk && <p className="text-sm text-destructive">Wazzup не принял ключ — проверьте его.</p>}
            <label className="block space-y-1">
              <span className="text-sm font-medium">Номер WhatsApp</span>
              <select value={channel} onChange={e => setChannel(e.target.value)} className={field}>
                {(st.channels ?? []).length === 0 && <option value="">В Wazzup нет WhatsApp</option>}
                {(st.channels ?? []).map(c => <option key={c.id} value={c.id}>{c.phone ?? c.id}{c.state && c.state !== 'active' ? ` (${c.state})` : ''}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Новые лиды из WhatsApp получает</span>
              <select value={manager} onChange={e => setManager(e.target.value)} className={field}>
                <option value="">{lidorub ? `Лидоруб (${lidorub.name})` : 'Лидоруб'}</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <Button className="w-full h-11" onClick={save} disabled={busy || !channel}>{busy ? 'Подключаю…' : connected ? 'Сохранить' : 'Подключить'}</Button>
            <p className="text-xs text-muted-foreground">amoCRM продолжает работать как раньше — сообщения идут и туда, и сюда.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
