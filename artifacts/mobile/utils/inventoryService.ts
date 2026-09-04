// utils/inventoryService.ts
import { supabase } from './supabase';
import type { InventoryItem } from '@/context/AppContext';

interface InventoryRow {
  id: string;
  title: string;
  purchase_date: string;
  purchase_price: number;
  sourcing_location: string;
  quantity: number;
  status: 'unsold' | 'sold';
  linked_sale_id: string | null;
}

function rowToItem(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    title: row.title,
    purchaseDate: row.purchase_date,
    purchasePrice: row.purchase_price,
    sourcingLocation: row.sourcing_location,
    quantity: row.quantity,
    status: row.status,
    linkedSaleId: row.linked_sale_id ?? undefined,
  };
}

export async function fetchInventory(userId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('user_id', userId)
    .order('purchase_date', { ascending: false });
  if (error) throw error;
  return (data as InventoryRow[]).map(rowToItem);
}

export async function deleteInventoryItemRemote(id: string): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id);
  if (error) throw error;
}

export async function insertInventoryItem(
  userId: string,
  item: Omit<InventoryItem, 'id' | 'status'>
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      user_id: userId,
      title: item.title,
      purchase_date: item.purchaseDate,
      purchase_price: item.purchasePrice,
      sourcing_location: item.sourcingLocation,
      quantity: item.quantity,
      status: 'unsold',
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToItem(data as InventoryRow);
}

export async function markInventoryItemSold(
  id: string,
  linkedSaleId: string
): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .update({ status: 'sold', linked_sale_id: linkedSaleId })
    .eq('id', id);
  if (error) throw error;
}