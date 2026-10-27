/** Боевая (продовая) версия сайта. Всё остальное, кроме локальной разработки, — тестовая среда. */
export const PROD_HOST = 'a-finance-five.vercel.app';
export const isTestEnv = typeof window !== 'undefined'
  && window.location.hostname !== PROD_HOST
  && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
