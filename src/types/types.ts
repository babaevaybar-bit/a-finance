export interface Manager {
  id: string;
  name: string;
  role: string;
  user_id: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  username: string;
  role: 'admin' | 'employee';
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalesPlan {
  id: string;
  manager_id: string;
  month_year: string; // YYYY-MM
  plan_amount: number;
  net_profit_plan: number | null;
  dividends_plan: number | null;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  manager_id: string;
  month_year: string; // YYYY-MM
  deal_date: string; // date
  client_phone: string | null;
  address: string | null;
  client_name: string | null;
  payment_method: string;
  door_model: string | null;
  total_amount: number;
  paid_amount: number;
  prepayment_date: string | null;
  comment: string | null;
  salary_amount: number | null; // base for commission calc; null = use total_amount
  status: 'pending' | 'approved' | 'rejected'; // pending = awaiting admin approval
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  channel: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Income {
  id: string;
  manager_id: string | null;
  income_date: string;
  from_whom: string;
  total_amount: number;
  quantity: number | null;
  channel: string;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transfer {
  id: string;
  transfer_date: string;
  from_channel: string;
  to_channel: string;
  amount: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalarySetting {
  id: string;
  manager_id: string;
  base_salary: number;
  commission_pct: number;
  use_personal_revenue: boolean; // true = личные сделки, false = общая выручка
  created_at: string;
  updated_at: string;
}

export const PAYMENT_METHODS = ['Kaspi Bank', 'Halyk Bank', 'Freedom Bank', 'Наличные', 'Kaspi Bank и нал', 'Другое'] as const;
export const CHANNELS = ['Kaspi Bank', 'Halyk Bank', 'Freedom Bank', 'Наличные'] as const;

export const ROLES = [
  'Менеджер по продажам',
  'Лидоруб',
  'Технолог',
  'Установщик',
  'Монтажник',
  'Замерщик',
  'Дизайнер',
  'Маркетолог',
  'Бренд-менеджер',
  'Бухгалтер',
  'Управляющий',
  'Администратор',
  'Кладовщик',
  'Логист',
  'Снабженец',
  'Сервисный инженер',
  'Водитель',
  'HR-менеджер',
] as const;

// Roles that earn commission from their OWN deals
export const SALES_ROLES: string[] = ['Менеджер по продажам'];
// Roles shown on Sales page
export const SALES_PAGE_ROLES: string[] = ['Менеджер по продажам'];

// ─── Employee Permission ───────────────────────────────────────────────────────
export interface EmployeePermission {
  id: string;
  manager_id: string;
  page: string;
  can_view: boolean;
  can_edit: boolean;
  can_approve: boolean;   // право подтверждать/отклонять сделки
  created_at: string;
  updated_at: string;
}

// Pages that can be toggled per-employee
export const PERMISSION_PAGES = [
  { key: 'dashboard',     label: 'Дашборд' },
  { key: 'sales',         label: 'Продажи' },
  { key: 'approvals',     label: 'Подтверждения' },
  { key: 'finance',       label: 'Финансы' },
  { key: 'reports',       label: 'Отчёты' },
  { key: 'salary',        label: 'Зарплаты' },
  { key: 'profit',        label: 'Чистая прибыль' },
  { key: 'managers',      label: 'Сотрудники' },
  { key: 'permissions',   label: 'Доступ' },
  { key: 'daily-report',  label: 'Ежедневный отчёт' },
] as const;

// ─── Profit Row ────────────────────────────────────────────────────────────────
export interface ProfitRow {
  id: string;
  sort_order: number;
  label: string;
  formula: string;
  value: number;
  is_auto: boolean;
  row_type: 'manual' | 'revenue' | 'expenses' | 'salary';
  row_type_v2: string | null; // 'percentage_of_revenue' | row_type value
  percent: number;            // используется для percentage_of_revenue
  month_year: string;
  created_at: string;
  updated_at: string;
}

// ─── Daily Report ──────────────────────────────────────────────────────────────
export interface DailyReport {
  id: string;
  report_date: string;
  channel: string;
  new_clients: number;
  leads: number;
  closed_deals: number;
  sales_amount: number;
  ad_cost: number;
  comment: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Client Report (по каждому клиенту) ──────────────────────────────────────
export type ClientQuality = 'cold' | 'warm' | 'hot';
export type DealStage = 'new' | 'negotiation' | 'viewing' | 'offer' | 'closed' | 'rejected';
export type ContactType = 'call' | 'meeting' | 'online';

export const CLIENT_QUALITY_LABELS: Record<ClientQuality, string> = {
  cold: 'Холодный',
  warm: 'Тёплый',
  hot:  'Горячий',
};

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  new:         'Новый',
  negotiation: 'Переговоры',
  viewing:     'Просмотр',
  offer:       'Предложение',
  closed:      'Закрыт',
  rejected:    'Отказ',
};

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  call:    'Звонок',
  meeting: 'Встреча',
  online:  'Онлайн',
};

export interface ClientReport {
  id: string;
  report_date: string;
  manager_id: string | null;
  client_name: string;
  client_phone: string | null;
  client_quality: ClientQuality;
  address: string | null;
  property_type: string | null;
  area_sqm: number | null;
  budget: number | null;
  source: string | null;
  contact_type: ContactType | null;
  deal_stage: DealStage;
  next_action: string | null;
  next_action_date: string | null;
  is_deal_closed: boolean;
  deal_amount: number;
  comment: string | null;
  tags: string[];
  lead_source: string;
  created_at: string;
  updated_at: string;
}

// ─── CRM: История взаимодействий ─────────────────────────────────────────────
export type InteractionType = 'call' | 'meeting' | 'message' | 'comment';
export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  call:    'Звонок',
  meeting: 'Встреча',
  message: 'Сообщение',
  comment: 'Комментарий',
};

export interface ClientInteraction {
  id: string;
  client_id: string;
  author_id: string | null;
  interaction_type: InteractionType;
  content: string;
  interacted_at: string;
  created_at: string;
}

// ─── CRM: Задачи/напоминания ─────────────────────────────────────────────────
export interface ClientTask {
  id: string;
  client_id: string;
  assigned_to: string | null;
  title: string;
  due_date: string | null;
  is_done: boolean;
  created_at: string;
  updated_at: string;
}

// ─── CRM: Лог изменений ──────────────────────────────────────────────────────
export interface ClientChangeLog {
  id: string;
  client_id: string;
  changed_by: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

// ─── Источники лидов ─────────────────────────────────────────────────────────
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  ads:       'Реклама',
  social:    'Соцсети',
  referral:  'Рекомендация',
  website:   'Сайт',
  cold_call: 'Холодный звонок',
  other:     'Другое',
};
