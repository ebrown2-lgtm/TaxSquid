import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import {
  configureRevenueCat,
  attachRevenueCatUser,
  detachRevenueCatUser,
  hasPremiumEntitlement,
} from '@/utils/revenueCat';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchOrCreateSettings, updateSettings } from '@/utils/settingsService';


import { supabase } from '@/utils/supabase';
import type { Session } from '@supabase/supabase-js';
import { fetchDrives, insertDrive, updateDriveCategory, deleteDriveRemote } from '@/utils/drivesService';

import {
  fetchTransactions,
  insertTransaction,
  insertTransactionsBulk,
  updateTransactionLinkedInventory,
  deleteTransactionRemote,
} from '@/utils/transactionsService';
import { fetchInventory, insertInventoryItem, markInventoryItemSold, deleteInventoryItemRemote } from '@/utils/inventoryService';


export type DriveCategory = 'business' | 'personal' | 'unclassified';

export interface Drive {
  id: string;
  date: string;
  startAddress: string;
  endAddress: string;
  miles: number;
  category: DriveCategory;
  startTime: string;
  endTime: string;
}

export type TransactionType = 'sale' | 'cogs' | 'fee' | 'expense';

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  description: string;
  amount: number;
  platform?: string;
  linkedInventoryId?: string;
  /** Stable external identifier (e.g. "ebay-sale-{transactionId}") used to
   *  deduplicate eBay sync results — any transaction with a matching externalId
   *  already in storage is silently skipped by addTransactions. */
  externalId?: string;
}

export interface InventoryItem {
  id: string;
  title: string;
  purchaseDate: string;
  purchasePrice: number;
  sourcingLocation: string;
  quantity: number;
  status: 'unsold' | 'sold';
  linkedSaleId?: string;
}

export interface TaxHubConfig {
  taxYear: number;
  homeOfficeSqFt: number;
  totalHomeSqFt: number;
  deductionMethod: 'simplified' | 'actual';
  monthlyInternetBill: number;
  internetBusinessPct: number;
  monthlyCellBill: number;
  cellBusinessPct: number;
  annualRentMortgage: number;
}

const DEFAULT_TAX_HUB: TaxHubConfig = {
  taxYear: 2026,
  homeOfficeSqFt: 150,
  totalHomeSqFt: 1200,
  deductionMethod: 'simplified',
  monthlyInternetBill: 79.99,
  internetBusinessPct: 80,
  monthlyCellBill: 65,
  cellBusinessPct: 60,
  annualRentMortgage: 14400,
};

const IRS_STANDARD_MILEAGE_RATE = 0.70; // 2025–2026 IRS rate

const SEED_DRIVES: Drive[] = [
  {
    id: 'drive-1',
    date: '2024-07-20',
    startAddress: 'Home – 4521 Birch St',
    endAddress: 'Goodwill Industries',
    miles: 4.2,
    category: 'unclassified',
    startTime: '9:15 AM',
    endTime: '9:32 AM',
  },
  {
    id: 'drive-2',
    date: '2024-07-22',
    startAddress: 'Home – 4521 Birch St',
    endAddress: 'Riverside Estate Sale',
    miles: 12.8,
    category: 'unclassified',
    startTime: '7:45 AM',
    endTime: '8:14 AM',
  },
  {
    id: 'drive-3',
    date: '2024-07-15',
    startAddress: 'Post Office',
    endAddress: 'Home – 4521 Birch St',
    miles: 2.1,
    category: 'business',
    startTime: '11:20 AM',
    endTime: '11:28 AM',
  },
];

const SEED_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-1',
    date: '2024-07-21',
    type: 'sale',
    description: 'Vintage Polaroid Camera',
    amount: 185.0,
    platform: 'eBay',
  },
  {
    id: 'tx-2',
    date: '2024-07-21',
    type: 'cogs',
    description: 'Shipping + Packaging (Polaroid)',
    amount: -12.5,
    platform: 'eBay',
  },
  {
    id: 'tx-3',
    date: '2024-07-21',
    type: 'fee',
    description: 'eBay Final Value Fee (Polaroid)',
    amount: -18.5,
    platform: 'eBay',
  },
  {
    id: 'tx-4',
    date: '2024-07-19',
    type: 'sale',
    description: 'Vinyl Records (Lot of 8)',
    amount: 67.0,
    platform: 'eBay',
  },
  {
    id: 'tx-5',
    date: '2024-07-19',
    type: 'fee',
    description: 'eBay Final Value Fee (Vinyl)',
    amount: -6.7,
    platform: 'eBay',
  },
  {
    id: 'tx-6',
    date: '2024-07-15',
    type: 'expense',
    description: 'Bubble Wrap & Poly Mailers',
    amount: -24.99,
  },
  {
    id: 'tx-7',
    date: '2024-07-10',
    type: 'sale',
    description: "Vintage Levi's 501 Jeans",
    amount: 94.0,
    platform: 'eBay',
  },
  {
    id: 'tx-8',
    date: '2024-07-10',
    type: 'fee',
    description: "eBay Final Value Fee (Jeans)",
    amount: -9.4,
    platform: 'eBay',
  },
];

const SEED_INVENTORY: InventoryItem[] = [
  {
    id: 'inv-1',
    title: 'Super Nintendo Console',
    purchaseDate: '2024-07-18',
    purchasePrice: 5.0,
    sourcingLocation: 'Yard Sale',
    quantity: 1,
    status: 'unsold',
  },
  {
    id: 'inv-2',
    title: 'Vintage Wool Sweater',
    purchaseDate: '2024-07-20',
    purchasePrice: 8.0,
    sourcingLocation: 'Goodwill',
    quantity: 1,
    status: 'unsold',
  },
];

export interface Metrics {
  grossRevenue: number;
  cogs: number;
  platformFees: number;
  generalExpenses: number;   // sum of all 'expense' type transactions
  businessMiles: number;
  mileageWriteOff: number;
  homeOfficeDeduction: number;
  internetDeduction: number;
  cellDeduction: number;
  netTaxableIncome: number;
  unsoldInventoryValue: number;
}

interface AppContextValue {
  mileageRate: number;
  mileageRateMode: 'irs' | 'custom';
  customMileageRate: number;
  irsStandardMileageRate: number;
  setMileageRateMode: (mode: 'irs' | 'custom') => void;
  setCustomMileageRate: (rate: number) => void;
  drives: Drive[];
  transactions: Transaction[];
  inventoryItems: InventoryItem[];
  taxHub: TaxHubConfig;
  isTracking: boolean;
  metrics: Metrics;
  syncedYears: number[];
  classifyDrive: (id: string, category: DriveCategory) => void;
  deleteDrive: (id: string) => void;
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  addTransactions: (txs: Omit<Transaction, 'id'>[]) => void;
  deleteTransaction: (id: string) => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'status'>) => void;
  deleteInventoryItem: (id: string) => void;
  linkCogsToSale: (saleId: string, inventoryItemId: string) => void;
  updateTaxHub: (patch: Partial<TaxHubConfig>) => void;
  toggleTracking: () => void;
  addDrive: (drive: Omit<Drive, 'id'>) => void;
  markYearSynced: (year: number) => void;
  isYearSyncable: (year: number) => boolean;
  session: Session | null;
  authLoading: boolean;
  signOut: () => Promise<void>;
  hasPremium: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

function computeUtilityDeductions(taxHub: TaxHubConfig) {
  const businessPct =
    taxHub.totalHomeSqFt > 0
      ? taxHub.homeOfficeSqFt / taxHub.totalHomeSqFt
      : 0;

  let homeOfficeDeduction = 0;
  if (taxHub.deductionMethod === 'simplified') {
    homeOfficeDeduction = Math.min(taxHub.homeOfficeSqFt, 300) * 5;
  } else {
    homeOfficeDeduction = taxHub.annualRentMortgage * businessPct;
  }

  const internetDeduction =
    taxHub.monthlyInternetBill * 12 * (taxHub.internetBusinessPct / 100);
  const cellDeduction =
    taxHub.monthlyCellBill * 12 * (taxHub.cellBusinessPct / 100);

  return { homeOfficeDeduction, internetDeduction, cellDeduction };
}

function computeMetrics(
  transactions: Transaction[],
  drives: Drive[],
  inventoryItems: InventoryItem[],
  taxHub: TaxHubConfig,
  mileageRate: number
): Metrics {
  const yearTransactions = transactions.filter(
    (t) => new Date(t.date).getFullYear() === taxHub.taxYear
  );

  const grossRevenue = yearTransactions
    .filter((t) => t.type === 'sale')
    .reduce((sum, t) => sum + t.amount, 0);

  const cogs = yearTransactions
    .filter((t) => t.type === 'cogs')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const platformFees = yearTransactions
    .filter((t) => t.type === 'fee')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const generalExpenses = yearTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const businessMiles = drives
    .filter((d) => d.category === 'business')
    .reduce((sum, d) => sum + d.miles, 0);

  const mileageWriteOff = businessMiles * mileageRate;

  const { homeOfficeDeduction, internetDeduction, cellDeduction } =
    computeUtilityDeductions(taxHub);

  const netTaxableIncome =
    grossRevenue -
    cogs -
    platformFees -
    generalExpenses -
    mileageWriteOff -
    homeOfficeDeduction -
    internetDeduction -
    cellDeduction;

  const unsoldInventoryValue = inventoryItems
    .filter((i) => i.status === 'unsold')
    .reduce((sum, i) => sum + i.purchasePrice * i.quantity, 0);

  return {
    grossRevenue,
    cogs,
    platformFees,
    generalExpenses,
    businessMiles,
    mileageWriteOff,
    homeOfficeDeduction,
    internetDeduction,
    cellDeduction,
    netTaxableIncome,
    unsoldInventoryValue,
  };
}

function genId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/**
 * Coerce any date string to "YYYY-MM-DD" ISO format so the entire
 * transactions array sorts cleanly by date regardless of source
 * (seed data, manual entry, CSV import, AsyncStorage rehydration).
 */
function normalizeDate(date: string): string {
  if (!date) return new Date().toISOString().split('T')[0];
  // Already "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  // Month-name formats: "Jul 22, 2026" or "Jul 22 2026"
  const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const abbr = /^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/.exec(date);
  if (abbr) {
    const mm = MONTHS[abbr[1].toLowerCase()];
    if (mm) return `${abbr[3]}-${mm}-${abbr[2].padStart(2, '0')}`;
  }
  // "MM/DD/YYYY"
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(date);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  // Native parse fallback
  const d = new Date(date);
  return isNaN(d.getTime())
    ? new Date().toISOString().split('T')[0]
    : d.toISOString().split('T')[0];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [mileageRateMode, setMileageRateModeState] = useState<'irs' | 'custom'>('irs');
  const [customMileageRate, setCustomMileageRateState] = 
  useState<number>(IRS_STANDARD_MILEAGE_RATE);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [taxHub, setTaxHub] = useState<TaxHubConfig>(DEFAULT_TAX_HUB);
  const [isTracking, setIsTracking] = useState(false);
  const [syncedYears, setSyncedYears] = useState<number[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    configureRevenueCat();
  }, []);
  
  useEffect(() => {
    if (session?.user?.id) {
      attachRevenueCatUser(session.user.id);
    } else {
      detachRevenueCatUser();
      setHasPremium(false);
    }

    const listener = (info: CustomerInfo) => {
      setHasPremium(hasPremiumEntitlement(info));
    };
    Purchases.addCustomerInfoUpdateListener(listener);

    // Also check current status immediately (the listener only fires on change)
    Purchases.getCustomerInfo()
      .then((info) => setHasPremium(hasPremiumEntitlement(info)))
      .catch(() => {});

    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [session?.user?.id]);
  
  useEffect(() => {
    (async () => {
      try {
        const rawTracking = await AsyncStorage.getItem('taxsquid_tracking');
        setIsTracking(rawTracking === 'true');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const [dataLoaded, setDataLoaded] = useState(false);
  const [hasPremium, setHasPremium] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      setDataLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [remoteDrives, remoteTx, remoteInventory] = await Promise.all([
          fetchDrives(session.user.id),
          fetchTransactions(session.user.id),
          fetchInventory(session.user.id),
        ]);
        if (cancelled) return;
        setDrives(remoteDrives);
        setTransactions(remoteTx);
        setInventoryItems(remoteInventory);
      } catch (err) {
        console.warn('Failed to load remote data', err);
      } finally {
        if (!cancelled) setDataLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Fetch (or create) this user's settings row from Supabase whenever they sign in
  useEffect(() => {
    if (!session?.user?.id) {
      setSettingsLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchOrCreateSettings(session.user.id);
        if (cancelled) return;
        setTaxHub({
          taxYear: remote.taxYear,
          homeOfficeSqFt: remote.homeOfficeSqFt,
          totalHomeSqFt: remote.totalHomeSqFt,
          deductionMethod: remote.deductionMethod,
          monthlyInternetBill: remote.monthlyInternetBill,
          internetBusinessPct: remote.internetBusinessPct,
          monthlyCellBill: remote.monthlyCellBill,
          cellBusinessPct: remote.cellBusinessPct,
          annualRentMortgage: remote.annualRentMortgage,
        });
        setMileageRateModeState(remote.mileageRateMode);
        setCustomMileageRateState(remote.customMileageRate);
        setSyncedYears(remote.syncedYears);
      } catch (err) {
        console.warn('Failed to load remote settings', err);
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Push settings changes to Supabase — skipped until the initial fetch above
  // completes, so we never overwrite the server with stale local defaults.
  useEffect(() => {
    if (!settingsLoaded || !session?.user?.id) return;
    updateSettings(session.user.id, {
      taxYear: taxHub.taxYear,
      homeOfficeSqFt: taxHub.homeOfficeSqFt,
      totalHomeSqFt: taxHub.totalHomeSqFt,
      deductionMethod: taxHub.deductionMethod,
      monthlyInternetBill: taxHub.monthlyInternetBill,
      internetBusinessPct: taxHub.internetBusinessPct,
      monthlyCellBill: taxHub.monthlyCellBill,
      cellBusinessPct: taxHub.cellBusinessPct,
      annualRentMortgage: taxHub.annualRentMortgage,
      mileageRateMode,
      customMileageRate,
      syncedYears,
    }).catch((err) => console.warn('Failed to save settings', err));
  }, [taxHub, mileageRateMode, customMileageRate, syncedYears, settingsLoaded, session?.user?.id]);
  
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem('taxsquid_drives', JSON.stringify(drives)).catch(() => {});
  }, [drives, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem('taxsquid_transactions', JSON.stringify(transactions)).catch(() => {});
  }, [transactions, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem('taxsquid_inventory', JSON.stringify(inventoryItems)).catch(() => {});
  }, [inventoryItems, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem('taxsquid_tracking', String(isTracking)).catch(() => {});
  }, [isTracking, loaded]);

  const classifyDrive = useCallback(
    (id: string, category: DriveCategory) => {
      setDrives((prev) => prev.map((d) => (d.id === id ? { ...d, category } : d)));
      updateDriveCategory(id, category).catch((err) => console.warn('Failed to update drive', err));
    },
    []
  );

  const signOut = useCallback(async () => {
    await detachRevenueCatUser();
    await supabase.auth.signOut();
  }, []);
  
  const deleteDrive = useCallback((id: string) => {
    setDrives((prev) => prev.filter((d) => d.id !== id));
    deleteDriveRemote(id).catch((err) => console.warn('Failed to delete drive', err));
  }, []);

  const addTransactions = useCallback(
    (txs: Omit<Transaction, 'id'>[]) => {
      if (!session?.user?.id) return;
      const normalized = txs.map((tx) => ({ ...tx, date: normalizeDate(tx.date) }));
      insertTransactionsBulk(session.user.id, normalized)
        .then((inserted) => {
          if (inserted.length) setTransactions((prev) => [...inserted, ...prev]);
        })
        .catch((err) => console.warn('Failed to import transactions', err));
    },
    [session?.user?.id]
  );
  
  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    deleteTransactionRemote(id).catch((err) => console.warn('Failed to delete transaction', err));
  }, []);
  
  const addTransaction = useCallback(
    (tx: Omit<Transaction, 'id'>) => {
      if (!session?.user?.id) return;
      const normalized = { ...tx, date: normalizeDate(tx.date) };
      insertTransaction(session.user.id, normalized)
        .then((inserted) => setTransactions((prev) => [inserted, ...prev]))
        .catch((err) => console.warn('Failed to add transaction', err));
    },
    [session?.user?.id]
  );
  
  const addInventoryItem = useCallback(
    (item: Omit<InventoryItem, 'id' | 'status'>) => {
      if (!session?.user?.id) return;
      insertInventoryItem(session.user.id, item)
        .then((inserted) => setInventoryItems((prev) => [inserted, ...prev]))
        .catch((err) => console.warn('Failed to add inventory item', err));
    },
    [session?.user?.id]
  );

  const deleteInventoryItem = useCallback((id: string) => {
    setInventoryItems((prev) => prev.filter((i) => i.id !== id));
    deleteInventoryItemRemote(id).catch((err) => console.warn('Failed to delete inventory item', err));
  }, []);

  const linkCogsToSale = useCallback(
    (saleId: string, inventoryItemId: string) => {
      setInventoryItems((prevItems) => {
        const item = prevItems.find((i) => i.id === inventoryItemId);
        if (!item || !session?.user?.id) return prevItems;

        const updatedItems = prevItems.map((i) =>
          i.id === inventoryItemId
            ? { ...i, status: 'sold' as const, linkedSaleId: saleId }
            : i
        );

        markInventoryItemSold(inventoryItemId, saleId).catch((err) =>
          console.warn('Failed to mark inventory item sold', err)
        );

        setTransactions((prevTx) => {
          const saleTx = prevTx.find((t) => t.id === saleId);
          const cogsTxData = {
            date: saleTx?.date ?? new Date().toISOString().split('T')[0],
            type: 'cogs' as const,
            description: `COGS – ${item.title}`,
            amount: -(item.purchasePrice * item.quantity),
          };

          insertTransaction(session.user!.id, cogsTxData)
            .then((insertedCogs) => {
              setTransactions((cur) => [insertedCogs, ...cur]);
            })
            .catch((err) => console.warn('Failed to add COGS transaction', err));

          updateTransactionLinkedInventory(saleId, inventoryItemId).catch((err) =>
            console.warn('Failed to link sale transaction', err)
          );

          return prevTx.map((t) =>
            t.id === saleId ? { ...t, linkedInventoryId: inventoryItemId } : t
          );
        });

        return updatedItems;
      });
    },
    [session?.user?.id]
  );
  
  const updateTaxHub = useCallback((patch: Partial<TaxHubConfig>) => {
    setTaxHub((prev) => ({ ...prev, ...patch }));
  }, []);
  const setMileageRateMode = useCallback((mode: 'irs' | 'custom') => {
    setMileageRateModeState(mode);
  }, []);

  const setCustomMileageRate = useCallback((rate: number) => {
    setCustomMileageRateState(rate);
  }, []);
  
  const addDrive = useCallback(
    (drive: Omit<Drive, 'id'>) => {
      if (!session?.user?.id) return;
      insertDrive(session.user.id, drive)
        .then((inserted) => setDrives((prev) => [inserted, ...prev]))
        .catch((err) => console.warn('Failed to add drive', err));
    },
    [session?.user?.id]
  );

  const toggleTracking = useCallback(() => {
    setIsTracking((prev) => !prev);
  }, []);

  const markYearSynced = useCallback((year: number) => {
    setSyncedYears((prev) => (prev.includes(year) ? prev : [...prev, year]));
  }, []);

  // Only current year and the immediately preceding year are ever syncable
  const isYearSyncable = useCallback((year: number) => {
    const currentYear = new Date().getFullYear();
    return year === currentYear || year === currentYear - 1;
  }, []);

  const mileageRate = mileageRateMode === 'irs' ? IRS_STANDARD_MILEAGE_RATE : customMileageRate;
  const metrics = computeMetrics(transactions, drives, inventoryItems, taxHub, mileageRate);

  return (
    <AppContext.Provider
      value={{
        mileageRate,
        mileageRateMode,
        customMileageRate,
        irsStandardMileageRate: IRS_STANDARD_MILEAGE_RATE,
        setMileageRateMode,
        setCustomMileageRate,
        drives,
        transactions,
        inventoryItems,
        taxHub,
        isTracking,
        metrics,
        syncedYears,
        classifyDrive,
        deleteDrive,
        addTransaction,
        addTransactions,
        deleteTransaction,
        addInventoryItem,
        deleteInventoryItem,
        linkCogsToSale,
        updateTaxHub,
        toggleTracking,
        addDrive,
        markYearSynced,
        isYearSyncable,
        session,
          authLoading,
          signOut,
        hasPremium,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}


