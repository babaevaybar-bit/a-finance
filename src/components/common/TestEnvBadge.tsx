import { useEffect } from 'react';
import { isTestEnv } from '@/lib/env';

/** Метка «Тестовая версия» — чтобы не перепутать тест с боевым сайтом */
export default function TestEnvBadge() {
  useEffect(() => {
    if (isTestEnv && !document.title.startsWith('[ТЕСТ]')) document.title = `[ТЕСТ] ${document.title}`;
  }, []);
  if (!isTestEnv) return null;
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[100] pointer-events-none rounded-full bg-amber-500 text-white text-xs font-semibold px-3 py-1 shadow-lg">
      ТЕСТОВАЯ ВЕРСИЯ
    </div>
  );
}
