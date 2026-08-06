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
  'Маркетолог',
  'Бренд-менеджер',
  'Бухгалтер',
  'Управляющий',
] as const;

// Roles that earn commission from their OWN deals
export const SALES_ROLES: string[] = ['Менеджер по продажам'];
// Roles shown on Sales page by default
export const SALES_PAGE_ROLES: string[] = ['Менеджер по продажам'];
