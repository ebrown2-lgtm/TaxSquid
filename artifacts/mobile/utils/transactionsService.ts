// utils/transactionsService.ts
import { supabase } from './supabase';
import type { Transaction, TransactionType } from '@/context/AppContext';

interface TransactionRow {
  id: string;
  date: string;
  type: TransactionType;
  description: string;
  amount: number;
  platform: string | null;
  linked_inventory_id: string | null;
  external_id: string | null;
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    description: row.description,
    amount: row.amount,
    platform: row.platform ?? undefined,
    linkedInventoryId: row.linked_inventory_id ?? undefined,
    externalId: row.external_id ?? undefined,
  };
}

export async function fetchTransactions(userId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data as TransactionRow[]).map(rowToTransaction);
}

export async function insertTransaction(
  userId: string,
  tx: Omit<Transaction, 'id'>
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      date: tx.date,
      type: tx.type,
      description: tx.description,
      amount: tx.amount,
      platform: tx.platform ?? null,
      linked_inventory_id: tx.linkedInventoryId ?? null,
      external_id: tx.externalId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToTransaction(data as TransactionRow);
}

/**
 * Bulk insert with dedupe handled entirely by the database's partial unique
 * index on (user_id, external_id). ignoreDuplicates means rows that already
 * exist (matching externalId) are silently skipped — only genuinely new rows
 * come back, which replaces the old manual knownExtIds filtering logic.
 */
export async function insertTransactionsBulk(
  userId: string,
  txs: Omit<Transaction, 'id'>[]
): Promise<Transaction[]> {
  if (!txs.length) return [];
  const { data, error } = await supabase
    .from('transactions')
    .upsert(
      txs.map((tx) => ({
        user_id: userId,
        date: tx.date,
        type: tx.type,
        description: tx.description,
        amount: tx.amount,
        platform: tx.platform ?? null,
        linked_inventory_id: tx.linkedInventoryId ?? null,
        external_id: tx.externalId ?? null,
      })),
      { onConflict: 'user_id,external_id', ignoreDuplicates: true }
    )
    .select('*');
  if (error) throw error;
  return (data as TransactionRow[]).map(rowToTransaction);
}

export async function updateTransactionLinkedInventory(
  id: string,
  linkedInventoryId: string
): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ linked_inventory_id: linkedInventoryId })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTransactionRemote(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}