// utils/drivesService.ts
import { supabase } from './supabase';
import type { Drive, DriveCategory } from '@/context/AppContext';

interface DriveRow {
  id: string;
  date: string;
  start_address: string;
  end_address: string;
  miles: number;
  category: DriveCategory;
  start_time: string;
  end_time: string;
}

function rowToDrive(row: DriveRow): Drive {
  return {
    id: row.id,
    date: row.date,
    startAddress: row.start_address,
    endAddress: row.end_address,
    miles: row.miles,
    category: row.category,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

export async function fetchDrives(userId: string): Promise<Drive[]> {
  const { data, error } = await supabase
    .from('drives')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return (data as DriveRow[]).map(rowToDrive);
}

export async function insertDrive(
  userId: string,
  drive: Omit<Drive, 'id'>
): Promise<Drive> {
  const { data, error } = await supabase
    .from('drives')
    .insert({
      user_id: userId,
      date: drive.date,
      start_address: drive.startAddress,
      end_address: drive.endAddress,
      miles: drive.miles,
      category: drive.category,
      start_time: drive.startTime,
      end_time: drive.endTime,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToDrive(data as DriveRow);
}

export async function updateDriveCategory(
  id: string,
  category: DriveCategory
): Promise<void> {
  const { error } = await supabase.from('drives').update({ category }).eq('id', id);
  if (error) throw error;
}

export async function deleteDriveRemote(id: string): Promise<void> {
  const { error } = await supabase.from('drives').delete().eq('id', id);
  if (error) throw error;
}