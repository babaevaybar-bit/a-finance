import { supabase } from '@/db/supabase';
import type { EstimateData } from '@/lib/price';

export interface EstimateRow {
  id: string;
  number: number;
  manager_id: string | null;
  created_by: string | null;
  client_name: string | null;
  client_phone: string | null;
  title: string | null;
  data: EstimateData;
  total: number;
  price_title: string | null;
  created_at: string;
  updated_at: string;
}

export async function listEstimates(): Promise<EstimateRow[]> {
  const { data, error } = await supabase.from('price_estimates')
    .select('id, number, manager_id, created_by, client_name, client_phone, title, total, price_title, created_at, updated_at, data')
    .order('updated_at', { ascending: false }).limit(300);
  if (error) throw error;
  return (data ?? []) as EstimateRow[];
}

export async function saveEstimate(row: { id?: string | null; client_name: string; client_phone: string; title: string; data: EstimateData; total: number; price_title: string }): Promise<EstimateRow> {
  const body = {
    client_name: row.client_name.trim() || null,
    client_phone: row.client_phone.trim() || null,
    title: row.title.trim() || null,
    data: row.data, total: Math.round(row.total), price_title: row.price_title,
    updated_at: new Date().toISOString(),
  };
  const q = row.id
    ? supabase.from('price_estimates').update(body).eq('id', row.id).select().single()
    : supabase.from('price_estimates').insert(body).select().single();
  const { data, error } = await q;
  if (error) throw error;
  return data as EstimateRow;
}

export async function deleteEstimate(id: string) {
  const { error } = await supabase.from('price_estimates').delete().eq('id', id);
  if (error) throw error;
}
