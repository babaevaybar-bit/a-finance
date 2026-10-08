import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Paperclip, Upload, Trash2, FileText, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/db/supabase';

interface DealFile { id: string; path: string; name: string; size: number | null; uploaded_by_name: string | null; created_at: string; }

/** Файлы сделки: скан договора, чеки, фото замера. Хранятся закрыто — открываются по временной ссылке. */
export default function DealFiles({ dealId }: { dealId: string }) {
  const [files, setFiles] = useState<DealFile[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from('deal_files').select('*').eq('deal_id', dealId).order('created_at', { ascending: false });
    setFiles((data as DealFile[]) ?? []);
  }
  useEffect(() => { load(); }, [dealId]);

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let who: string | null = null;
      if (user) { const { data: p } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle(); who = p?.name ?? null; }
      for (const f of Array.from(list)) {
        if (f.size > 20 * 1024 * 1024) { toast.error(`«${f.name}» больше 20 МБ`); continue; }
        const safe = f.name.replace(/[^\w.\-а-яА-ЯёЁ ]/g, '_');
        const path = `${dealId}/${Date.now()}_${safe}`;
        const { error } = await supabase.storage.from('deal-files').upload(path, f, { contentType: f.type || undefined });
        if (error) { toast.error(`Не загрузился «${f.name}»: ${error.message}`); continue; }
        await supabase.from('deal_files').insert({ deal_id: dealId, path, name: f.name, size: f.size, uploaded_by_name: who });
      }
      await load();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function open(f: DealFile) {
    const { data, error } = await supabase.storage.from('deal-files').createSignedUrl(f.path, 300);
    if (error || !data) { toast.error('Не удалось открыть файл'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function remove(f: DealFile) {
    if (!window.confirm(`Удалить файл «${f.name}»?`)) return;
    await supabase.storage.from('deal-files').remove([f.path]);
    await supabase.from('deal_files').delete().eq('id', f.id);
    await load();
  }

  const isImage = (n: string) => /\.(jpe?g|png|webp|heic|gif)$/i.test(n);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-1.5"><Paperclip size={14} />Файлы{files && files.length ? ` (${files.length})` : ''}</p>
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <Upload size={13} className="mr-1" />{uploading ? 'Загрузка…' : 'Прикрепить'}
        </Button>
        <input ref={inputRef} type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={e => upload(e.target.files)} />
      </div>
      {files === null ? (
        <p className="text-xs text-muted-foreground">Загрузка…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">Договор, чеки, фото замера — до 20 МБ на файл</p>
      ) : (
        <div className="space-y-1">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-xs">
              {isImage(f.name) ? <ImageIcon size={13} className="shrink-0" /> : <FileText size={13} className="shrink-0" />}
              <button type="button" className="flex-1 min-w-0 text-left truncate hover:underline" onClick={() => open(f)}>{f.name}</button>
              <span className="text-muted-foreground shrink-0">{new Date(f.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>
              <button type="button" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => remove(f)}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
