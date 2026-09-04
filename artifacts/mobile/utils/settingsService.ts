// utils/settingsService.ts
import { supabase } from './supabase';
import type { TaxHubConfig } from '@/context/AppContext';

export interface RemoteUserSettings {
  taxYear: number;
  homeOfficeSqFt: number;
  totalHomeSqFt: number;
  deductionMethod: 'simplified' | 'actual';
  monthlyInternetBill: number;
  internetBusinessPct: number;
  monthlyCellBill: number;
  cellBusinessPct: number;
  annualRentMortgage: number;
  mileageRateMode: 'irs' | 'custom';
  customMileageRate: number;
  syncedYears: number[];
}

// Row shape as it actually comes back from Postgres (snake_case)
interface SettingsRow {
  user_id: string;
  tax_year: number;
  home_office_sq_ft: number;
  total_home_sq_ft: number;
  deduction_method: 'simplified' | 'actual';
  monthly_internet_bill: number;
  internet_business_pct: number;
  monthly_cell_bill: number;
  cell_business_pct: number;
  annual_rent_mortgage: number;
  mileage_rate_mode: 'irs' | 'custom';
  custom_mileage_rate: number;
  synced_years: number[];
}

function rowToSettings(row: SettingsRow): RemoteUserSettings {
  return {
    taxYear: row.tax_year,
    homeOfficeSqFt: row.home_office_sq_ft,
    totalHomeSqFt: row.total_home_sq_ft,
    deductionMethod: row.deduction_method,
    monthlyInternetBill: row.monthly_internet_bill,
    internetBusinessPct: row.internet_business_pct,
    monthlyCellBill: row.monthly_cell_bill,
    cellBusinessPct: row.cell_business_pct,
    annualRentMortgage: row.annual_rent_mortgage,
    mileageRateMode: row.mileage_rate_mode,
    customMileageRate: row.custom_mileage_rate,
    syncedYears: row.synced_years ?? [],
  };
}

/** Fetch the current user's settings row, creating a default one if it doesn't exist yet. */
export async function fetchOrCreateSettings(userId: string): Promise<RemoteUserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return rowToSettings(data as SettingsRow);
  }

  // No row yet for this user — insert one with defaults (table's DEFAULT values apply)
  const { data: inserted, error: insertError } = await supabase
    .from('user_settings')
    .insert({ user_id: userId })
    .select('*')
    .single();

  if (insertError) throw insertError;
  return rowToSettings(inserted as SettingsRow);
}

/** Partial update — only send the fields that changed. */
export async function updateSettings(
  userId: string,
  patch: Partial<RemoteUserSettings>
): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.taxYear !== undefined) dbPatch.tax_year = patch.taxYear;
  if (patch.homeOfficeSqFt !== undefined) dbPatch.home_office_sq_ft = patch.homeOfficeSqFt;
  if (patch.totalHomeSqFt !== undefined) dbPatch.total_home_sq_ft = patch.totalHomeSqFt;
  if (patch.deductionMethod !== undefined) dbPatch.deduction_method = patch.deductionMethod;
  if (patch.monthlyInternetBill !== undefined) dbPatch.monthly_internet_bill = patch.monthlyInternetBill;
  if (patch.internetBusinessPct !== undefined) dbPatch.internet_business_pct = patch.internetBusinessPct;
  if (patch.monthlyCellBill !== undefined) dbPatch.monthly_cell_bill = patch.monthlyCellBill;
  if (patch.cellBusinessPct !== undefined) dbPatch.cell_business_pct = patch.cellBusinessPct;
  if (patch.annualRentMortgage !== undefined) dbPatch.annual_rent_mortgage = patch.annualRentMortgage;
  if (patch.mileageRateMode !== undefined) dbPatch.mileage_rate_mode = patch.mileageRateMode;
  if (patch.customMileageRate !== undefined) dbPatch.custom_mileage_rate = patch.customMileageRate;
  if (patch.syncedYears !== undefined) dbPatch.synced_years = patch.syncedYears;
  dbPatch.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('user_settings')
    .update(dbPatch)
    .eq('user_id', userId);

  if (error) throw error;
}