import { useState } from 'react';
import { History } from 'lucide-react';
import ClientHistorySheet from '@/components/client/ClientHistorySheet';
import { phoneKeys } from '@/lib/phone';

/** Кнопка «История клиента» — открывает карточку клиента по телефону (все покупки, лиды, просчёты) */
export default function ClientHistoryButton({ phone, name, label = false, className = '' }: { phone: string | null | undefined; name?: string | null; label?: boolean | string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!phoneKeys(phone).length) return null;
  return (
    <>
      <button type="button" title="Карточка клиента: все сделки, оплаты, заявки" onClick={e => { e.stopPropagation(); setOpen(true); }}
        className={`inline-flex items-center gap-1 rounded-md text-primary hover:bg-primary/10 px-1 py-0.5 text-xs shrink-0 ${className}`}>
        <History size={13} />{label && (typeof label === 'string' ? label : 'История клиента')}
      </button>
      {open && <ClientHistorySheet open phone={phone ?? null} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}
