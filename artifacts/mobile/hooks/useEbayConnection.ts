// hooks/useEbayConnection.ts
import { useCallback, useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_BASE } from '@/utils/api';
import { supabase } from '@/utils/supabase';

WebBrowser.maybeCompleteAuthSession();

export interface EbayConnectionState {
  connected: boolean | null;
  checking: boolean;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useEbayConnection(): EbayConnectionState {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/ebay/status`, { cache: 'no-store', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { connected: boolean };
      setConnected(data.connected);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    const redirectTo = Linking.createURL('ebay-callback');
    const loginUrl = `${API_BASE}/ebay/login?token=${encodeURIComponent(token)}&redirectTo=${encodeURIComponent(redirectTo)}`;

    await WebBrowser.openAuthSessionAsync(loginUrl, redirectTo);
    // Whether it succeeded, errored, or was dismissed, re-check status —
    // this is the simplest way to reflect the real outcome in the UI.
    await refresh();
  }, [refresh]);

  const disconnect = useCallback(async () => {
    try {
      const headers = await getAuthHeader();
      await fetch(`${API_BASE}/ebay/disconnect`, { method: 'POST', headers });
    } catch {
      // Ignore network errors on disconnect
    }
    setConnected(false);
  }, []);

  return { connected, checking, refresh, connect, disconnect };
}