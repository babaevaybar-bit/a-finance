import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import "./index.css";

// Sentry (сбор ошибок) — грузится отдельно и только если задан ключ,
// чтобы не утяжелять первую загрузку сайта
const SENTRY_DSN = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;
if (SENTRY_DSN) {
  import("@sentry/react").then(Sentry => Sentry.init({ dsn: SENTRY_DSN, environment: import.meta.env.MODE })).catch(() => {});
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean; updating: boolean }> {
  state = { failed: false, updating: false };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, updating: isChunkLoadError((error as Error)?.message) };
  }
  componentDidCatch(error: unknown) {
    if (isChunkLoadError((error as Error)?.message)) reloadForStaleChunk();
  }
  render() {
    if (this.state.failed) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', textAlign: 'center', marginTop: '20vh' }}>
          <p style={{ fontSize: 16 }}>{this.state.updating ? 'Сайт обновился — загружаем новую версию…' : 'Произошла ошибка приложения.'}</p>
          <button type="button" onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// После каждого нового деплоя старые файлы разделов (chunks) пропадают с
// сервера. Если вкладка была открыта ДО деплоя и пользователь кликает по
// разделу, браузер пытается загрузить уже несуществующий старый файл.
// Ловим именно такую ошибку и перезагружаем страницу, чтобы подтянулась
// актуальная версия. В момент переключения версий (несколько секунд) первая
// перезагрузка может снова попасть на старые файлы — поэтому даём до 3
// попыток с паузой, а не одну.
const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Loading chunk',
];
function isChunkLoadError(message: unknown): boolean {
  const text = String(message ?? '');
  return CHUNK_ERROR_PATTERNS.some(p => text.includes(p));
}
let reloadScheduled = false;
function reloadForStaleChunk() {
  if (reloadScheduled) return;
  const key = 'chunk-error-reloads';
  let st: { n: number; t: number } = { n: 0, t: 0 };
  try { st = JSON.parse(sessionStorage.getItem(key) ?? '') ?? st; } catch { /* пусто */ }
  if (Date.now() - st.t > 60000) st = { n: 0, t: Date.now() };   // новая серия попыток
  if (st.n >= 3) return;                                           // не зацикливаемся
  st.n += 1;
  try { sessionStorage.setItem(key, JSON.stringify(st)); } catch { /* пусто */ }
  reloadScheduled = true;
  setTimeout(() => window.location.reload(), st.n === 1 ? 0 : 2500);
}
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  reloadForStaleChunk();
});
window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason?.message ?? event.reason)) reloadForStaleChunk();
});
window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.message)) reloadForStaleChunk();
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AppWrapper>
      <App />
    </AppWrapper>
  </ErrorBoundary>
);
