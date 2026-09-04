// hooks/useEbaySync.ts
import { useCallback, useState } from 'react';
import { API_BASE } from '@/utils/api';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/utils/supabase';

export interface EbaySyncCounts {
  sales: number;
  fees: number;
  expenses: number;
  total: number;
}

export interface EbaySyncState {
  syncing: boolean;
  lastSynced: string | null;   // ISO timestamp or null
  lastCounts: EbaySyncCounts | null;
  syncError: string | null;
  /** Manually trigger a full year sync and save results to AppContext */
  sync: (year: number) => Promise<void>;
  /** Fetch cached metadata from the last server-side sync (no eBay API call) */
  fetchLastSync: () => Promise<void>;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useEbaySync(): EbaySyncState {
  const { addTransactions, markYearSynced } = useApp();
  const [syncing, setSyncing]         = useState(false);
  const [lastSynced, setLastSynced]   = useState<string | null>(null);
  const [lastCounts, setLastCounts]   = useState<EbaySyncCounts | null>(null);
  const [syncError, setSyncError]     = useState<string | null>(null);

  /** Pull cached last-sync metadata — lightweight, no eBay API call */
  const fetchLastSync = useCallback(async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/ebay/last-sync`, { cache: 'no-store', headers });
      if (!res.ok) return;
      const data = (await res.json()) as {
        synced: boolean;
        timestamp: string | null;
        counts: EbaySyncCounts | null;
      };
      if (data.synced && data.timestamp) {
        setLastSynced(data.timestamp);
        setLastCounts(data.counts);
      }
    } catch {
      // Non-blocking — ignore network errors
    }
  }, []);

  /** Full sync: call /api/ebay/sync?year=YYYY, receive transactions, save to AppContext */
  const sync = useCallback(async (year: number) => {
    setSyncing(true);
    setSyncError(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/ebay/sync?year=${year}`, { cache: 'no-store', headers });
      const data = (await res.json()) as {
        success: boolean;
        count: number;
        timestamp: string;
        transactions: Array<Record<string, unknown>>;
        counts: EbaySyncCounts;
        error?: string;
      };
      // Server always returns 200; check the success flag for partial failures
      if (!res.ok || data.success === false) {
        throw new Error(
          data.error ?? `Sync failed (HTTP ${res.status})`
        );
      }
      if (data.transactions?.length) {
        // addTransactions deduplicates by externalId — safe to call on every sync
        addTransactions(data.transactions as Parameters<typeof addTransactions>[0]);
        }
        markYearSynced(year);
        setLastSynced(data.timestamp);
        setLastCounts(data.counts);
        } catch (err: any) {
        setSyncError(err?.message ?? 'Sync failed. Please try again.');
        } finally {
        setSyncing(false);
        }
        }, [addTransactions, markYearSynced]);

        return { syncing, lastSynced, lastCounts, syncError, sync, fetchLastSync };
        }