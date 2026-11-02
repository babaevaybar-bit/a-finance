import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { compressImage } from '@/lib/image';
import { FileText, IdCard, Loader2, Lock, Trash2, Upload } from 'lucide-react';

const BUCKET = 'id-docs';
const MAX = 10 * 1024 * 1024;

interface Doc { path: string; name: string; isPdf: boolean; url: string | null; created_at: string | null }

/**
 * Удостоверение личности сотрудника (лицевая и оборотная сторона, фото или PDF).
 * Хранится в закрытом хранилище: видят только сам сотрудник и Главный админ.
 * Файлы лежат в папке id-docs/<id сотрудника>/.
 */
export function IdDocuments({ managerId, compact = false }: { managerId: string | null | undefined; compact?: boolean }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!managerId) { setDocs([]); return; }
    const { data, error } = await supabase.storage.from(BUCKET).list(managerId, { sortBy: { column: 'created_at', order: 'asc' } });
    if (error) { setDocs([]); return; }
    const files = (data ?? []).filter(f => f.id && !f.name.startsWith('.'));
    const out = await Promise.all(files.map(async f => {
      const path = `${managerId}/${f.name}`;
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
      return { path, name: f.name, isPdf: f.name.toLowerCase().endsWith('.pdf'), url: s?.signedUrl ?? null, created_at: f.created_at ?? null };
    }));
    setDocs(out);
  }, [managerId]);

  useEffect(() => { load(); }, [load]);

  async function upload(list: FileList) {
    if (!managerId) return;
    setBusy(true);
    let ok = 0;
    try {
      for (const file of Array.from(list)) {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        let body: Blob = file, ext = 'pdf', type = 'application/pdf';
        if (!isPdf) {
          if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) { toast.error(`«${file.name}»: нужен фото или PDF`); continue; }
          const small = await compressImage(file, 2000, 0.88);   // документ — чуть крупнее, чтобы читались цифры
          if (!small) { toast.error(`«${file.name}»: не удалось открыть фото, сохраните его как JPG`); continue; }
          body = small; ext = 'jpg'; type = 'image/jpeg';
        }
        if (body.size > MAX) { toast.error(`«${file.name}» больше 10 МБ`); continue; }
        const path = `${managerId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: type });
        if (error) { toast.error(`Не удалось загрузить: ${error.message}`); continue; }
        ok++;
      }
      if (ok) toast.success(ok === 1 ? 'Документ загружен' : `Загружено документов: ${ok}`);
    } finally {
      setBusy(false);
      load();
    }
  }

  async function remove(d: Doc) {
    if (!window.confirm('Удалить этот файл удостоверения?')) return;
    const { error } = await supabase.storage.from(BUCKET).remove([d.path]);
    if (error) { toast.error('Не удалось удалить'); return; }
    toast.success('Удалено');
    load();
  }

  if (!managerId) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-medium flex items-center gap-1.5 ${compact ? 'text-sm' : 'text-base'}`}><IdCard size={16} />Удостоверение личности</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Lock size={11} />Видят только сотрудник и Главный админ</p>
        </div>
        <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Загрузить
        </Button>
        <input ref={fileRef} type="file" accept="image/*,.heic,.heif,application/pdf" multiple className="hidden"
          onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
      </div>

      {docs === null ? (
        <div className="text-xs text-muted-foreground">Загрузка…</div>
      ) : docs.length === 0 ? (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="w-full rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground hover:bg-muted/40 text-left">
          Не загружено. Сфотографируйте лицевую и оборотную сторону или выберите PDF.
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {docs.map(d => (
            <div key={d.path} className="group relative rounded-xl border border-border overflow-hidden bg-muted/30">
              <a href={d.url ?? '#'} target="_blank" rel="noreferrer" className="block aspect-[1.58] bg-muted/40">
                {d.isPdf || !d.url ? (
                  <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground"><FileText size={22} />PDF</span>
                ) : (
                  <img src={d.url} alt="Удостоверение" className="w-full h-full object-cover" />
                )}
              </a>
              <button type="button" onClick={() => remove(d)} title="Удалить"
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-background/90 shadow flex items-center justify-center text-muted-foreground hover:text-destructive">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
