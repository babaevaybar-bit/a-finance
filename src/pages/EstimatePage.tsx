import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Calculator, Plus, ChevronLeft, Save, FileText, Trash2, Search } from 'lucide-react';
import { fmt } from '@/lib/estimate/doors';
import { newOpening, totals, uid, lineFromCatalog, type EstimateData, type Opening } from '@/lib/estimate/model';
import OpeningCard, { LinesTable } from '@/components/estimate/OpeningCard';
import CatalogPicker from '@/components/estimate/CatalogPicker';
import { openKp } from '@/components/estimate/kpPrint';
import usePhotoCatalog from '@/lib/estimate/usePhotoCatalog';
import { doorPhoto, doorModelName } from '@/lib/estimate/photos';
import { seriesById } from '@/lib/estimate/model';

interface EstimateRow {
  id: string; created_by: string; author_name: string | null; client_name: string | null; client_phone: string | null;
  client_address: string | null; data: EstimateData; total: number; created_at: string; updated_at: string;
}

const today = () => new Date().toLocaleDateString('ru-RU', { timeZone: 'Asia/Qyzylorda' });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Asia/Qyzylorda' });

// ─── Список просчётов ────────────────────────────────────────────────────────
function EstimateList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [rows, setRows] = useState<EstimateRow[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase.from('estimates').select('id, created_by, author_name, client_name, client_phone, client_address, total, created_at, updated_at, data')
      .order('updated_at', { ascending: false }).limit(200)
      .then(({ data, error }) => { if (error) toast.error('Не удалось загрузить просчёты'); setRows((data ?? []) as EstimateRow[]); });
  }, []);
  const shown = (rows ?? []).filter(r => !q || `${r.client_name ?? ''} ${r.client_phone ?? ''} ${r.author_name ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Calculator size={22} className="text-primary" />Просчёт</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Расчёт дверей PROFILDOORS ORANGE по прайсу и коммерческое предложение для клиента</p>
        </div>
        <Button onClick={onNew}><Plus size={16} className="mr-1.5" />Новый просчёт</Button>
      </div>
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} placeholder="Клиент, телефон, менеджер" className="pl-8" />
      </div>
      <div className="rounded-2xl border divide-y overflow-hidden bg-card">
        {rows === null && <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>}
        {rows && shown.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">{rows.length ? 'Ничего не найдено' : 'Просчётов пока нет — нажмите «Новый просчёт»'}</div>}
        {shown.map(r => (
          <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="w-full text-left px-4 py-3 hover:bg-muted/40 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{r.client_name || 'Без имени клиента'}</p>
              <p className="text-xs text-muted-foreground truncate">
                {[r.client_phone, `${r.data?.openings?.length ?? 0} проём.`, r.author_name, fmtDate(r.updated_at)].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="text-sm font-semibold tabular-nums">{fmt(Number(r.total))}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Новый проём с теми же дверью и коробом, что у последнего (без доп. позиций и своих размеров полотен) */
function likeLast(list: Opening[]): Opening {
  const n = newOpening(list.length + 1);
  const last = list[list.length - 1];
  if (!last?.door) return n;
  return { ...n, openType: last.openType, leaves: last.leaves, door: { ...last.door }, frame: last.frame ? { ...last.frame, over: {} } : n.frame };
}

// ─── Редактор ────────────────────────────────────────────────────────────────
function EstimateEditor({ id, onBack, onSaved }: { id: string | null; onBack: () => void; onSaved: (id: string) => void }) {
  const { profile } = useAuth();
  const [loaded, setLoaded] = useState(!id);
  const [client, setClient] = useState({ name: '', phone: '', address: '' });
  const [data, setData] = useState<EstimateData>({ openings: [newOpening(1)], hardware: [], date: today() });
  const [author, setAuthor] = useState<string>(profile?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hwPicker, setHwPicker] = useState(false);
  const photoCat = usePhotoCatalog();

  useEffect(() => {
    if (!id) return;
    supabase.from('estimates').select('*').eq('id', id).maybeSingle().then(({ data: r, error }) => {
      if (error || !r) { toast.error('Просчёт не найден'); onBack(); return; }
      setClient({ name: r.client_name ?? '', phone: r.client_phone ?? '', address: r.client_address ?? '' });
      { const dd = (r.data ?? {}) as Partial<EstimateData>; setData({ ...dd, openings: dd.openings ?? [], hardware: dd.hardware ?? [] }); }
      setAuthor(r.author_name ?? '');
      setLoaded(true);
    });
  }, [id, onBack]);

  const upd = (p: Partial<EstimateData>) => { setData(d => ({ ...d, ...p })); setDirty(true); };
  const setOpening = (o: Opening) => upd({ openings: data.openings.map(x => x.id === o.id ? o : x) });
  const t = useMemo(() => totals(data), [data]);

  const save = useCallback(async (): Promise<string | null> => {
    setSaving(true);
    const row = {
      client_name: client.name.trim() || null, client_phone: client.phone.trim() || null, client_address: client.address.trim() || null,
      data, total: t.total, updated_at: new Date().toISOString(),
    };
    const res = id
      ? await supabase.from('estimates').update(row).eq('id', id).select('id').single()
      : await supabase.from('estimates').insert({ ...row, author_name: profile?.name ?? null }).select('id').single();
    setSaving(false);
    if (res.error || !res.data) { toast.error('Не удалось сохранить просчёт'); return null; }
    setDirty(false);
    toast.success('Просчёт сохранён');
    if (!id) onSaved(res.data.id);
    return res.data.id;
  }, [client, data, t.total, id, profile?.name, onSaved]);

  async function remove() {
    if (!id || !confirm('Удалить этот просчёт?')) return;
    const { error } = await supabase.from('estimates').delete().eq('id', id);
    if (error) { toast.error('Не удалось удалить'); return; }
    toast.success('Просчёт удалён'); onBack();
  }

  function kp() {
    const ok = openKp(data, {
      managerName: author || profile?.name || '', managerPhone: profile?.phone || '+7 701 073 2022',
      clientName: client.name, clientPhone: client.phone, clientAddress: client.address, date: data.date || today(),
    }, o => doorPhoto(photoCat, seriesById(o.door?.seriesId), o.door), o => doorModelName(photoCat, seriesById(o.door?.seriesId), o.door));
    if (!ok) toast.error('Браузер заблокировал новое окно — разрешите всплывающие окна для сайта');
  }

  if (!loaded) return <div className="h-40 rounded-xl bg-muted animate-pulse" />;

  return (
    <div className="space-y-5 w-full max-w-[2000px] pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { if (!dirty || confirm('Есть несохранённые изменения. Выйти без сохранения?')) onBack(); }}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"><ChevronLeft size={16} />Все просчёты</button>
        <div className="ml-auto flex flex-wrap gap-2">
          {id && <Button variant="ghost" size="sm" onClick={remove} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} className="mr-1.5" />Удалить</Button>}
          <Button variant="outline" size="sm" onClick={kp}><FileText size={14} className="mr-1.5" />КП / PDF</Button>
          <Button size="sm" onClick={save} disabled={saving}><Save size={14} className="mr-1.5" />{saving ? 'Сохраняю…' : 'Сохранить'}</Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 grid gap-3 md:grid-cols-4">
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Клиент</span>
          <Input value={client.name} onChange={e => { setClient(c => ({ ...c, name: e.target.value })); setDirty(true); }} placeholder="Имя клиента" autoComplete="off" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Телефон клиента</span>
          <Input value={client.phone} onChange={e => { setClient(c => ({ ...c, phone: e.target.value })); setDirty(true); }} placeholder="+7 …" inputMode="tel" autoComplete="off" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Адрес</span>
          <Input value={client.address} onChange={e => { setClient(c => ({ ...c, address: e.target.value })); setDirty(true); }} placeholder="Город, ЖК, улица" autoComplete="off" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Дата КП</span>
          <Input value={data.date ?? ''} onChange={e => upd({ date: e.target.value })} /></label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Двери и комплектующие</h2>
          <span className="text-sm text-muted-foreground">Итого: <b className="text-foreground tabular-nums">{fmt(t.doors)}</b></span>
        </div>
        {data.openings.map((o, i) => (
          <OpeningCard key={o.id} o={o} n={i + 1} onChange={setOpening}
            onCopy={() => { const c = JSON.parse(JSON.stringify(o)) as Opening; c.id = uid(); c.lines = c.lines.map(l => ({ ...l, id: uid() })); const arr = [...data.openings]; arr.splice(i + 1, 0, c); upd({ openings: arr }); }}
            onRemove={() => { if (o.door && !confirm('Удалить проём?')) return; upd({ openings: data.openings.filter(x => x.id !== o.id) }); }} />
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => upd({ openings: [...data.openings, likeLast(data.openings)] })}><Plus size={15} className="mr-1.5" />Добавить проём</Button>
          {data.openings.length > 0 && <span className="text-xs text-muted-foreground">новый проём берёт серию, модель, цвет и короб из предыдущего — останется поменять размер</span>}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold flex-1">Фурнитура</h2>
          <span className="text-sm text-muted-foreground mr-2">Итого: <b className="text-foreground tabular-nums">{fmt(t.hardware)}</b></span>
          <Button variant="outline" size="sm" onClick={() => setHwPicker(x => !x)}><Plus size={14} className="mr-1" />Из прайса</Button>
          <Button variant="ghost" size="sm" onClick={() => upd({ hardware: [...data.hardware, { id: uid(), kind: 'Другое', name: '', unit: 'компл', price: 0, qty: 1 }] })}>Своя позиция</Button>
        </div>
        {hwPicker && <CatalogPicker kp="hw" onClose={() => setHwPicker(false)} onPick={c => upd({ hardware: [...data.hardware, lineFromCatalog(c)] })} />}
        {data.hardware.length === 0 && !hwPicker && <p className="text-sm text-muted-foreground">Ручки, замки, петли, цилиндры — нажмите «Из прайса».</p>}
        <LinesTable lines={data.hardware} onChange={hardware => upd({ hardware })} />
      </div>

      <div className="rounded-2xl border bg-card p-4 grid gap-3 md:grid-cols-3">
        <label className="space-y-1 md:col-span-2"><span className="text-xs text-muted-foreground">Примечание в КП</span>
          <Input value={data.note ?? ''} onChange={e => upd({ note: e.target.value })} placeholder="Сроки, условия, замер…" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Скидка, %</span>
          <Input type="number" min={0} max={100} value={data.discountPct ?? ''} onChange={e => upd({ discountPct: Number(e.target.value) || 0 })} placeholder="0" /></label>
      </div>

      {/* Итог — закреплён внизу */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-56 z-30 border-t bg-background/95 backdrop-blur px-4 py-3">
        <div className="max-w-[2000px] flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="text-sm text-muted-foreground">Двери и комплектующие <b className="text-foreground tabular-nums">{fmt(t.doors)}</b></span>
          <span className="text-sm text-muted-foreground">Фурнитура <b className="text-foreground tabular-nums">{fmt(t.hardware)}</b></span>
          {t.discount > 0 && <span className="text-sm text-muted-foreground">Скидка <b className="text-foreground tabular-nums">−{fmt(t.discount)}</b></span>}
          <span className="ml-auto text-lg font-semibold tabular-nums">Общая сумма: {fmt(t.total)}</span>
          {dirty && <Button size="sm" onClick={save} disabled={saving}><Save size={14} className="mr-1.5" />Сохранить</Button>}
          {!dirty && id && <Button size="sm" variant="outline" onClick={kp}><FileText size={14} className="mr-1.5" />КП</Button>}
        </div>
      </div>
    </div>
  );
}

export default function EstimatePage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('id'); // null — список; 'new' — новый; uuid — редактирование
  return (
    <AppLayout>
      {view === null
        ? <EstimateList onOpen={id => setParams({ id })} onNew={() => setParams({ id: 'new' })} />
        : <EstimateEditor key={view} id={view === 'new' ? null : view} onBack={() => setParams({})} onSaved={id => setParams({ id }, { replace: true })} />}
    </AppLayout>
  );
}
