import { useEffect, useState } from 'react';
import { isTestEnv } from '@/lib/env';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RotateCcw } from 'lucide-react';

/** Метка «Тестовая версия» и (для Главного админа) кнопка «Сбросить к боевой» */
export default function TestEnvBadge() {
  const { isDirector, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastReset, setLastReset] = useState<string | null>(null);

  useEffect(() => {
    if (isTestEnv && !document.title.startsWith('[ТЕСТ]')) document.title = `[ТЕСТ] ${document.title}`;
  }, []);
  useEffect(() => {
    if (!isTestEnv || !isDirector) return;
    supabase.rpc('test_reset_info').then(({ data }) => setLastReset((data as string | null) ?? null));
  }, [isDirector, user?.id]);

  if (!isTestEnv) return null;

  async function reset() {
    setBusy(true);
    const t = toast.loading('Копирую данные с боевой базы…');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('reset-from-prod', {
        body: {}, headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (res.error) {
        let msg = res.error.message;
        try { const b = await (res.error as { context?: Response }).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
        throw new Error(msg);
      }
      toast.success('Тестовая база теперь как боевая. Войдите заново.', { id: t });
      // все сессии в тестовой базе сброшены — входим заново
      await supabase.auth.signOut().catch(() => {});
      setTimeout(() => { window.location.href = '/login'; }, 800);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сбросить', { id: t });
    } finally { setBusy(false); setOpen(false); }
  }

  const when = lastReset ? new Date(lastReset).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <>
      {/* тонкая полоса сверху + маленький ярлычок «ТЕСТ»: не закрывает кнопки и низ экрана на телефоне */}
      <div className="fixed top-0 inset-x-0 h-[3px] bg-amber-500 z-[100] pointer-events-none" />
      <div className="fixed top-0 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 z-[100]">
        <button type="button" onClick={() => setExpanded(v => !v)} title="Тестовая версия сайта"
          className="rounded-b-md bg-amber-500 text-white text-[10px] leading-none font-semibold px-2 pt-0.5 pb-1 shadow">
          ТЕСТ
        </button>
        {expanded && (
          <div className="absolute top-full right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 mt-1 w-max max-w-[90vw] rounded-lg bg-amber-500 text-white text-xs shadow-lg p-2 space-y-1.5">
            <p className="font-semibold">Тестовая версия — изменения здесь не попадают на основной сайт</p>
            <div className="flex items-center gap-1.5">
              {isDirector && (
                <button type="button" onClick={() => { setExpanded(false); setOpen(true); }} disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full bg-white/20 hover:bg-white/30 px-2 py-0.5 font-medium">
                  <RotateCcw size={12} />Сбросить к боевой
                </button>
              )}
              <button type="button" onClick={() => setExpanded(false)} className="rounded-full bg-white/20 hover:bg-white/30 px-2 py-0.5">Скрыть</button>
            </div>
          </div>
        )}
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить тестовую базу к боевой?</AlertDialogTitle>
            <AlertDialogDescription>
              Всё, что меняли в тесте, удалится, и сюда скопируются текущие данные с боевого сайта: сделки, оплаты, сотрудники, логины и пароли.
              Боевой сайт не меняется. После сброса нужно войти заново.
              {when && <> Последний сброс: {when}.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); reset(); }}>{busy ? 'Сбрасываю…' : 'Сбросить'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
