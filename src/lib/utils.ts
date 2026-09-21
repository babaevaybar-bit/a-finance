import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + ' ₸';
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function getCurrentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthYearToLabel(monthYear: string): string {
  const [year, month] = monthYear.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

export function getAvailableMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  // 3 года назад и полгода вперёд — с запасом, чтобы не упираться в старые данные
  for (let i = 36; i >= -6; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

// Диапазон месяцев для графиков на Дашборде: с января 2026 по текущий месяц.
// Отдельно от getAvailableMonths(), чтобы графики не начинались от пустых лет
// до того, как компания вообще начала вести учёт.
export function getDashboardMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  const startYear = 2026, startMonth = 1; // январь 2026
  let y = startYear, m = startMonth;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}
