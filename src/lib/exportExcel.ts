import * as XLSX from 'xlsx';
import type { Deal, Expense, Income, Manager, SalesPlan } from '@/types/types';
import { monthYearToLabel } from '@/lib/utils';

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined): string {
  if (v == null) return '';
  return v.toLocaleString('ru-RU');
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru-RU');
}

// ─── column styles helper ─────────────────────────────────────────────────────
function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map(w => ({ wch: w }));
}

// ─── Sheet 1: Summary per manager ─────────────────────────────────────────────
function buildSummarySheet(
  deals: Deal[],
  managers: Manager[],
  plans: SalesPlan[],
  monthYear: string
): XLSX.WorkSheet {
  const title = monthYearToLabel(monthYear);
  const rows: (string | number)[][] = [
    [`Сводка за ${title}`],
    [],
    ['Менеджер', 'Сделок', 'Выручка (₸)', 'Оплачено (₸)', 'Предоплата 70% (₸)', 'Остатки (₸)', 'План (₸)', '% плана'],
  ];

  for (const m of managers) {
    const mDeals = deals.filter(d => d.manager_id === m.id);
    const revenue = mDeals.reduce((s, d) => s + Number(d.total_amount), 0);
    const paid = mDeals.reduce((s, d) => s + Number(d.paid_amount), 0);
    const prepay70 = revenue * 0.7;
    const remainder = mDeals.reduce((s, d) => s + Math.max(0, Number(d.total_amount) - Number(d.paid_amount)), 0);
    const plan = plans.find(p => p.manager_id === m.id);
    const planAmt = Number(plan?.plan_amount || 0);
    const pct = planAmt > 0 ? Number(((revenue / planAmt) * 100).toFixed(1)) : '';
    rows.push([m.name, mDeals.length, revenue, paid, prepay70, remainder, planAmt || '', pct]);
  }

  // Totals row
  const totalRevenue = deals.reduce((s, d) => s + Number(d.total_amount), 0);
  const totalPaid = deals.reduce((s, d) => s + Number(d.paid_amount), 0);
  const totalRemainder = deals.reduce((s, d) => s + Math.max(0, Number(d.total_amount) - Number(d.paid_amount)), 0);
  const totalPlan = plans.reduce((s, p) => s + Number(p.plan_amount), 0);
  rows.push([]);
  rows.push([
    'ИТОГО', deals.length, totalRevenue, totalPaid, totalRevenue * 0.7, totalRemainder,
    totalPlan || '', totalPlan > 0 ? Number(((totalRevenue / totalPlan) * 100).toFixed(1)) : '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [22, 9, 18, 18, 20, 18, 18, 10]);
  return ws;
}

// ─── Sheet 2+: Deals per manager ─────────────────────────────────────────────
function buildManagerDealsSheet(deals: Deal[], managerName: string): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    [`Сделки — ${managerName}`],
    [],
    ['Дата', 'ФИО клиента', 'Телефон', 'Адрес', 'Способ оплаты', 'Модель', 'Сумма (₸)', 'Оплачено (₸)', 'Предоплата 70% (₸)', 'Остаток (₸)', 'Дата предоплаты'],
  ];

  for (const d of deals) {
    rows.push([
      fmtDate(d.deal_date),
      d.client_name || '',
      d.client_phone || '',
      d.address || '',
      d.payment_method,
      d.door_model || '',
      Number(d.total_amount),
      Number(d.paid_amount),
      Number(d.total_amount) * 0.7,
      Math.max(0, Number(d.total_amount) - Number(d.paid_amount)),
      fmtDate(d.prepayment_date),
    ]);
  }

  // Totals
  if (deals.length > 0) {
    rows.push([]);
    const totalAmt = deals.reduce((s, d) => s + Number(d.total_amount), 0);
    const totalPaid = deals.reduce((s, d) => s + Number(d.paid_amount), 0);
    rows.push(['ИТОГО', '', '', '', '', '', totalAmt, totalPaid, totalAmt * 0.7, totalAmt - totalPaid, '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [12, 22, 16, 26, 14, 16, 16, 16, 18, 16, 14]);
  return ws;
}

// ─── Sheet: Expenses ─────────────────────────────────────────────────────────
function buildExpensesSheet(expenses: Expense[]): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ['Расходы'],
    [],
    ['Дата', 'Описание', 'Канал', 'Сумма (₸)'],
  ];

  for (const e of expenses) {
    rows.push([fmtDate(e.expense_date), e.description, e.channel, Number(e.amount)]);
  }

  if (expenses.length > 0) {
    const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
    rows.push([]);
    rows.push(['ИТОГО', '', '', total]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [12, 36, 14, 16]);
  return ws;
}

// ─── Sheet: Income ────────────────────────────────────────────────────────────
function buildIncomeSheet(income: Income[], managers: Manager[]): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ['Поступления'],
    [],
    ['Дата', 'От кого', 'Менеджер', 'Канал', 'Кол-во', 'Сумма (₸)', 'Комментарий'],
  ];

  for (const i of income) {
    const mName = managers.find(m => m.id === i.manager_id)?.name || '';
    rows.push([
      fmtDate(i.income_date),
      i.from_whom,
      mName,
      i.channel,
      i.quantity ?? '',
      Number(i.total_amount),
      i.comment || '',
    ]);
  }

  if (income.length > 0) {
    const total = income.reduce((s, i) => s + Number(i.total_amount), 0);
    rows.push([]);
    rows.push(['ИТОГО', '', '', '', '', total, '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [12, 26, 18, 12, 9, 16, 28]);
  return ws;
}

// ─── Sheet: Balance by channel ────────────────────────────────────────────────
function buildBalanceSheet(expenses: Expense[], income: Income[]): XLSX.WorkSheet {
  const channels = ['Каспи', 'Халык', 'Фридом', 'Наличные'];
  const rows: (string | number)[][] = [
    ['Баланс по каналам'],
    [],
    ['Канал', 'Поступления (₸)', 'Расходы (₸)', 'Баланс (₸)'],
  ];

  let sumInc = 0, sumExp = 0;
  for (const ch of channels) {
    const inc = income.filter(i => i.channel === ch).reduce((s, i) => s + Number(i.total_amount), 0);
    const exp = expenses.filter(e => e.channel === ch).reduce((s, e) => s + Number(e.amount), 0);
    sumInc += inc; sumExp += exp;
    rows.push([ch, inc, exp, inc - exp]);
  }
  rows.push([]);
  rows.push(['ИТОГО', sumInc, sumExp, sumInc - sumExp]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [14, 20, 18, 18]);
  return ws;
}

// ─── Main export function ─────────────────────────────────────────────────────
export function exportMonthlyReport(params: {
  monthYear: string;
  deals: Deal[];
  managers: Manager[];
  plans: SalesPlan[];
  expenses: Expense[];
  income: Income[];
}) {
  const { monthYear, deals, managers, plans, expenses, income } = params;
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(deals, managers, plans, monthYear), 'Сводка');

  // Sheet per manager (deals)
  for (const m of managers) {
    const mDeals = deals.filter(d => d.manager_id === m.id);
    // Truncate sheet name to 31 chars (Excel limit)
    const sheetName = m.name.slice(0, 28);
    XLSX.utils.book_append_sheet(wb, buildManagerDealsSheet(mDeals, m.name), sheetName);
  }

  // Sheet: All deals combined
  XLSX.utils.book_append_sheet(wb, buildManagerDealsSheet(deals, 'Все менеджеры'), 'Все сделки');

  // Sheet: Expenses
  XLSX.utils.book_append_sheet(wb, buildExpensesSheet(expenses), 'Расходы');

  // Sheet: Income
  XLSX.utils.book_append_sheet(wb, buildIncomeSheet(income, managers), 'Поступления');

  // Sheet: Balance
  XLSX.utils.book_append_sheet(wb, buildBalanceSheet(expenses, income), 'Балансы');

  // Download
  const label = monthYearToLabel(monthYear).replace(' ', '_');
  XLSX.writeFile(wb, `Отчёт_${label}.xlsx`);
}
