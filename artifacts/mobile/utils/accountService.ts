// utils/accountService.ts
import { API_BASE } from './api';
import { supabase } from './supabase';

export async function deleteAccount(): Promise<{ error: string | null }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: 'Not signed in.' };

  try {
    const res = await fetch(`${API_BASE}/account/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (!res.ok || !body.success) {
      return { error: body.error ?? `Deletion failed (HTTP ${res.status})` };
    }
    return { error: null };
  } catch (err: any) {
    return { error: err?.message ?? 'Network error during account deletion.' };
  }
}