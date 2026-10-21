import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2, ZoomIn, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export const HANDBOOK_PATH = 'handbook.pdf';

// Документ грузим один раз за сессию и переиспользуем во всех уроках
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any> };
let docPromise: Promise<PdfDoc | null> | null = null;

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

export function resetHandbook() { docPromise = null; }

export function getHandbook(): Promise<PdfDoc | null> {
  if (!docPromise) {
    docPromise = (async () => {
      const { data, error } = await supabase.storage.from('training').createSignedUrl(HANDBOOK_PATH, 3600);
      if (error || !data?.signedUrl) return null;
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ url: data.signedUrl }).promise;
      return doc as unknown as PdfDoc;
    })().catch(() => { docPromise = null; return null; });
  }
  return docPromise;
}

function PdfPage({ doc, n, onZoom }: { doc: PdfDoc; n: number; onZoom?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let task: any;
    (async () => {
      const page = await doc.getPage(n);
      if (cancelled || !ref.current || !wrap.current) return;
      const base = page.getViewport({ scale: 1 });
      const cssW = wrap.current.clientWidth || 600;
      const scale = (cssW / base.width) * Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale });
      const c = ref.current;
      c.width = vp.width; c.height = vp.height;
      task = page.render({ canvasContext: c.getContext('2d')!, viewport: vp });
      await task.promise.catch(() => {});
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; task?.cancel?.(); };
  }, [doc, n]);
  return (
    <div ref={wrap} className="relative rounded-lg overflow-hidden border bg-muted/30 group">
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><Loader2 className="animate-spin" size={20} /></div>}
      <canvas ref={ref} className="w-full h-auto block" style={{ aspectRatio: ready ? undefined : '744 / 1028' }} />
      {onZoom && ready && (
        <button type="button" onClick={onZoom} className="absolute top-2 right-2 h-8 w-8 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center" aria-label="Увеличить">
          <ZoomIn size={16} />
        </button>
      )}
      <div className="absolute bottom-1.5 left-2 text-[10px] text-white/80 bg-black/40 rounded px-1.5">стр. {n}</div>
    </div>
  );
}

/** Загрузка памятки директором (один раз) */
export function HandbookUpload({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function upload(f: File) {
    if (f.type !== 'application/pdf') { toast.error('Нужен PDF-файл'); return; }
    setBusy(true);
    const { error } = await supabase.storage.from('training').upload(HANDBOOK_PATH, f, { upsert: true, contentType: 'application/pdf' });
    setBusy(false);
    if (error) { toast.error('Не удалось загрузить: ' + error.message); return; }
    resetHandbook();
    toast.success('Памятка загружена');
    onDone();
  }
  return (
    <label className="inline-flex">
      <input type="file" accept="application/pdf" className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      <span className={`inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 ${busy ? 'opacity-60' : ''}`}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}Загрузить «Памятку для менеджеров» (PDF)
      </span>
    </label>
  );
}

export default function HandbookPages({ from, to }: { from: number; to: number }) {
  const { isDirector } = useAuth();
  const [doc, setDoc] = useState<PdfDoc | null | undefined>(undefined);
  const [zoom, setZoom] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => { let a = true; getHandbook().then(d => { if (a) setDoc(d); }); return () => { a = false; }; }, [reload]);

  if (doc === undefined) {
    return <div className="h-40 rounded-lg bg-muted animate-pulse" />;
  }
  if (doc === null) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
        <FileText className="mx-auto text-muted-foreground" size={28} />
        <p className="text-sm text-muted-foreground">Страницы памятки ещё не загружены.{!isDirector && ' Попросите директора загрузить файл.'}</p>
        {isDirector && <HandbookUpload onDone={() => setReload(x => x + 1)} />}
      </div>
    );
  }
  const pages: number[] = [];
  for (let i = from; i <= Math.min(to, doc.numPages); i++) pages.push(i);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {pages.map(n => <PdfPage key={n} doc={doc} n={n} onZoom={() => setZoom(n)} />)}
      </div>
      {zoom !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 overflow-auto p-4" onClick={() => setZoom(null)}>
          <button type="button" className="fixed top-3 right-3 h-9 w-9 rounded-full bg-white/15 text-white flex items-center justify-center" aria-label="Закрыть"><X size={18} /></button>
          <div className="max-w-3xl mx-auto" onClick={e => e.stopPropagation()}>
            <PdfPage doc={doc} n={zoom} />
            <div className="flex justify-between mt-3">
              <Button variant="secondary" size="sm" disabled={zoom <= from} onClick={() => setZoom(z => (z ?? from) - 1)}>← Назад</Button>
              <Button variant="secondary" size="sm" disabled={zoom >= to} onClick={() => setZoom(z => (z ?? from) + 1)}>Вперёд →</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
