import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import "./index.css";

Sentry.init({
  dsn: import.meta.env['VITE_SENTRY_DSN'] as string | undefined,
  environment: import.meta.env.MODE,
});

// После каждого нового деплоя старые файлы разделов (chunks) пропадают с
// сервера. Если вкладка была открыта ДО деплоя и пользователь кликает по
// разделу, браузер пытается загрузить уже несуществующий старый файл — это
// и вызывало ошибку. Ловим именно такую ошибку и один раз молча
// перезагружаем страницу, чтобы подтянулась актуальная версия — без
// показа пользователю какого-либо сообщения об ошибке.
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
function reloadOnceForStaleChunk() {
  // Храним время последней такой перезагрузки — если она была только что
  // (страница ещё не успела толком открыться), не зацикливаемся. Но при
  // следующем деплое, который случится позже (даже в этой же вкладке),
  // перезагрузка снова сработает как надо.
  const key = 'chunk-error-reload-at';
  const last = Number(sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last < 10000) return;
  sessionStorage.setItem(key, String(Date.now()));
  window.location.reload();
}
window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason?.message ?? event.reason)) reloadOnceForStaleChunk();
});
window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.message)) reloadOnceForStaleChunk();
});

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <p>Произошла ошибка приложения. Пожалуйста, обновите страницу.</p>
    </div>
  }>
    <AppWrapper>
      <App />
    </AppWrapper>
  </Sentry.ErrorBoundary>
);
