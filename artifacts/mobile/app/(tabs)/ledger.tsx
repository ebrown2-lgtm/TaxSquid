import React, { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, TransactionType, Transaction } from '@/context/AppContext';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AddTransactionModal } from '@/components/AddTransactionModal';
import { LinkCogsModal } from '@/components/LinkCogsModal';
import { EbayImportModal } from '@/components/EbayImportModal';
import { ParseResult } from '@/utils/ebayCSVParser';
import * as Haptics from 'expo-haptics';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
}

const TYPE_CONFIG: Record<
  TransactionType,
  { label: string; icon: string; colorKey: 'success' | 'warning' | 'teal' | 'destructive' }
> = {
  sale:    { label: 'Sale',    icon: 'trending-up',  colorKey: 'success'     },
  cogs:    { label: 'COGS',   icon: 'shopping-bag', colorKey: 'warning'     },
  fee:     { label: 'Fee',    icon: 'percent',      colorKey: 'teal'        },
  expense: { label: 'Expense',icon: 'credit-card',  colorKey: 'destructive' },
};

type FilterKey = 'all' | TransactionType;
const FILTERS: FilterKey[] = ['all', 'sale', 'cogs', 'fee', 'expense'];


type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
  { key: 'date-desc',   label: 'Date: Newest First',    icon: 'arrow-down' },
  { key: 'date-asc',    label: 'Date: Oldest First',    icon: 'arrow-up'   },
  { key: 'amount-desc', label: 'Amount: Highest First',  icon: 'arrow-down' },
  { key: 'amount-asc',  label: 'Amount: Lowest First',   icon: 'arrow-up'   },
];

function dateToMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12).getTime();
}

function applySortFilter(
  txs: ReturnType<typeof useApp>['transactions'],
  filter: FilterKey,
  sort: SortKey,
  yearFilter: number | 'all',
) {
  let base = filter === 'all' ? txs : txs.filter(t => t.type === filter);
  if (yearFilter !== 'all') {
    base = base.filter(t => new Date(t.date).getFullYear() === yearFilter);
  }
  return [...base].sort((a, b) => {
    switch (sort) {
      case 'date-desc':   return dateToMs(b.date) - dateToMs(a.date);
      case 'date-asc':    return dateToMs(a.date) - dateToMs(b.date);
      case 'amount-desc': return b.amount - a.amount;
      case 'amount-asc':  return a.amount - b.amount;
    }
  });
}

// ── Import success toast ───────────────────────────────────────────────────────
function ImportToast({
  salesCount,
  revenue,
  fees,
  onDismiss,
  colors,
}: {
  salesCount: number;
  revenue: number;
  fees: number;
  onDismiss: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        toastStyles.wrap,
        { backgroundColor: colors.success + '18', borderColor: colors.success + '50' },
      ]}
    >
      <View style={[toastStyles.iconWrap, { backgroundColor: colors.success + '30' }]}>
        <Ionicons name="checkmark-circle" size={22} color={colors.success} />
      </View>
      <View style={toastStyles.body}>
        <Text style={[toastStyles.title, { color: colors.success }]}>Import Complete!</Text>
        <Text style={[toastStyles.sub, { color: colors.mutedForeground }]}>
          {salesCount} row{salesCount !== 1 ? 's' : ''} · {fmt(revenue)} income · {fmt(fees)} fees added
        </Text>
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={10}>
        <Feather name="x" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

const toastStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
});

// ── Main screen ────────────────────────────────────────────────────────────────
export default function LedgerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { transactions, inventoryItems, addTransaction, addTransactions,
          linkCogsToSale, metrics, deleteTransaction, taxHub } = useApp();

  const [yearFilter, setYearFilter] = useState<number | 'all'>(taxHub.taxYear);
  const [filter, setFilter]             = useState<FilterKey>('all');
  const [sortKey, setSortKey]           = useState<SortKey>('date-desc');
  const [sortOpen, setSortOpen]         = useState(false);
  const [addModalVisible, setAddModal]  = useState(false);
  const [importModalVisible, setImport] = useState(false);
  const [linkSaleId, setLinkSaleId]     = useState<string | null>(null);
  const [linkSaleDesc, setLinkSaleDesc] = useState('');
  const [importToast, setImportToast]   = useState<{
    salesCount: number; revenue: number; fees: number;
  } | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const filtered = useMemo(
    () => applySortFilter(transactions, filter, sortKey, yearFilter),
    [transactions, filter, sortKey, yearFilter],
  );

  const activeSortOption = SORT_OPTIONS.find(o => o.key === sortKey)!;
  const unsoldItems = inventoryItems.filter(i => i.status === 'unsold');
  const availableYears = Array.from(
    new Set(transactions.map((t) => new Date(t.date).getFullYear()))
  ).sort((a, b) => b - a); // newest first

  const handleAdd = (tx: Parameters<typeof addTransaction>[0]) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addTransaction(tx);
  };

  const openLinkModal = (saleId: string, desc: string) => {
    setLinkSaleId(saleId);
    setLinkSaleDesc(desc);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLink = (saleId: string, inventoryItemId: string) => {
    linkCogsToSale(saleId, inventoryItemId);
    setLinkSaleId(null);
  };

  // ── delete handler with safety check backed in ─────────────────────────────────────────────
  const handleDeleteTransaction = (tx: Transaction) => {
    // Never allow deleting synced records this way — externalId means it
    // came from an eBay sync or CSV import and should stay in sync with that source.
    if (tx.externalId) {
      Alert.alert(
        'Synced Transaction',
        'This entry came from an eBay sync or CSV import and can\'t be deleted manually. Re-syncing or re-importing won\'t create a duplicate.'
      );
      return;
    }
    Alert.alert(
      'Delete Entry',
      `Remove "${tx.description}" from your ledger? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            deleteTransaction(tx.id);
          },
        },
      ]
    );
  };
  
  // ── eBay CSV import confirmed ─────────────────────────────────────────────
  const handleEbayImport = (result: ParseResult) => {
    const newTxs: Parameters<typeof addTransaction>[0][] = [];
    for (const row of result.rows) {
      // Use the same externalId format as the API sync (ebay-order-{orderId})
      // so a later API sync recognizes this as the same transaction instead
      // of creating a duplicate. Falls back to a synthetic key when the CSV
      // doesn't include an Order ID column.
      const saleExternalId = row.orderId
        ? `ebay-order-${row.orderId}`
        : `ebay-csv-sale-${row.date}-${row.saleAmount}-${row.title.slice(0, 20)}`;

      newTxs.push({
        date: row.date,
        type: 'sale',
        description: row.title,
        amount: row.saleAmount,
        platform: 'eBay',
        externalId: saleExternalId,
      });

      if (row.ebayFee > 0) {
        // Matches the API sync's estimated-fee fallback format
        // (ebay-fee-est-{orderId}) used when Finances API data isn't available
        const feeExternalId = row.orderId
          ? `ebay-fee-est-${row.orderId}`
          : `ebay-csv-fee-${row.date}-${row.ebayFee}-${row.title.slice(0, 20)}`;

        newTxs.push({
          date: row.date,
          type: 'fee',
          description: `eBay Fee – ${row.title}`,
          amount: -row.ebayFee,
          platform: 'eBay',
          externalId: feeExternalId,
        });
      }
    }
    addTransactions(newTxs);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setImportToast({ salesCount: result.rows.length, revenue: result.totalRevenue, fees: result.totalFees });
    setTimeout(() => setImportToast(null), 6000);
  };

  const getLinkedItemTitle = (inventoryId?: string) =>
    inventoryItems.find(i => i.id === inventoryId)?.title ?? null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Ledger</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={[styles.importBtn, { backgroundColor: colors.teal + '1A', borderColor: colors.teal + '66' }]}
            onPress={() => setImport(true)}
            activeOpacity={0.82}
          >
            <Feather name="upload" size={14} color={colors.teal} />
            <Text style={[styles.importBtnText, { color: colors.teal }]}>Import CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.teal }]}
            onPress={() => setAddModal(true)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={16} color={colors.primaryForeground} />
            <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Summary strip ── */}
      {(() => {
        // Ledger-level net: Income minus all transaction deductions only.
        // Does NOT include mileage / home office (those live in Tax Hub).
        const ledgerDeductions = metrics.cogs + metrics.platformFees + metrics.generalExpenses;
        const ledgerNet = metrics.grossRevenue - ledgerDeductions;
        return (
          <View style={[styles.summaryStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryVal, { color: colors.success }]}>+{fmt(metrics.grossRevenue)}</Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Income</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryVal, { color: colors.destructive }]}>
                -{fmt(ledgerDeductions)}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Deductions</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryVal, { color: ledgerNet >= 0 ? colors.foreground : colors.destructive }]}>
                {ledgerNet >= 0 ? '' : '-'}{fmt(ledgerNet)}
              </Text>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Net</Text>
            </View>
          </View>
        );
      })()}

      {/* ── Filter chips — flows directly after summary, no gap ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterScroll, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === f ? colors.teal : colors.muted,
                borderColor:     filter === f ? colors.teal : colors.border,
              },
            ]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterText, {
              color: filter === f ? colors.primaryForeground : colors.mutedForeground,
            }]}>
              {f === 'all' ? 'All' : TYPE_CONFIG[f].label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Year filter chips ── */}
      {availableYears.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.filterScroll, { borderBottomColor: colors.border }]}
          contentContainerStyle={styles.filterContent}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              {
                backgroundColor: yearFilter === 'all' ? colors.teal : colors.muted,
                borderColor:     yearFilter === 'all' ? colors.teal : colors.border,
              },
            ]}
            onPress={() => setYearFilter('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterText, {
              color: yearFilter === 'all' ? colors.primaryForeground : colors.mutedForeground,
            }]}>
              All Years
            </Text>
          </TouchableOpacity>
          {availableYears.map((y) => (
            <TouchableOpacity
              key={y}
              style={[
                styles.filterChip,
                {
                  backgroundColor: yearFilter === y ? colors.teal : colors.muted,
                  borderColor:     yearFilter === y ? colors.teal : colors.border,
                },
              ]}
              onPress={() => setYearFilter(y)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterText, {
                color: yearFilter === y ? colors.primaryForeground : colors.mutedForeground,
              }]}>
                {y}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Sort control bar ── */}
      <View style={[styles.sortBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sortLabel, { color: colors.mutedForeground }]}>Sort</Text>
        <TouchableOpacity
          style={[
            styles.sortBtn,
            {
              backgroundColor: sortOpen ? colors.teal + '22' : colors.muted,
              borderColor:     sortOpen ? colors.teal         : colors.border,
            },
          ]}
          onPress={() => {
            setSortOpen(v => !v);
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          activeOpacity={0.8}
        >
          <Feather name={activeSortOption.icon as any} size={12} color={sortOpen ? colors.teal : colors.mutedForeground} />
          <Text style={[styles.sortBtnText, { color: sortOpen ? colors.teal : colors.foreground }]}>
            {activeSortOption.label}
          </Text>
          <Feather name={sortOpen ? 'chevron-up' : 'chevron-down'} size={12} color={sortOpen ? colors.teal : colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* ── Sort dropdown panel ── */}
      {sortOpen && (
        <View style={[styles.sortPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {SORT_OPTIONS.map((opt, i) => {
            const active = opt.key === sortKey;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.sortOption,
                  i < SORT_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  active && { backgroundColor: colors.teal + '12' },
                ]}
                onPress={() => {
                  setSortKey(opt.key);
                  setSortOpen(false);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.sortOptionIcon, { backgroundColor: active ? colors.teal + '22' : colors.muted }]}>
                  <Feather name={opt.icon as any} size={13} color={active ? colors.teal : colors.mutedForeground} />
                </View>
                <Text style={[styles.sortOptionText, {
                  color:      active ? colors.teal : colors.foreground,
                  fontFamily: active ? 'Inter_700Bold' : 'Inter_400Regular',
                }]}>
                  {opt.label}
                </Text>
                {active && <Feather name="check" size={14} color={colors.teal} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Transaction list ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {importToast && (
          <ImportToast
            salesCount={importToast.salesCount}
            revenue={importToast.revenue}
            fees={importToast.fees}
            onDismiss={() => setImportToast(null)}
            colors={colors}
          />
        )}

        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No entries</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Tap "Import CSV" to load a report{'\n'}or "Add" to record manually
            </Text>
          </View>
        )}

        {filtered.map((tx, i) => {
          const cfg         = TYPE_CONFIG[tx.type];
          const accentColor = colors[cfg.colorKey];
          const dateStr     = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const isSale      = tx.type === 'sale';
          const isLinked    = Boolean(tx.linkedInventoryId);
          const linkedTitle = getLinkedItemTitle(tx.linkedInventoryId);
          const canLink     = isSale && !isLinked && unsoldItems.length > 0;

          return (
            <View key={tx.id}>
              <TouchableOpacity
                style={styles.txRow}
                activeOpacity={0.7}
                onLongPress={() => handleDeleteTransaction(tx)}
                delayLongPress={400}
              >
                <View style={[styles.iconWrap, { backgroundColor: accentColor + '22' }]}>
                  <Feather name={cfg.icon as any} size={16} color={accentColor} />
                </View>
                <View style={styles.txInfo}>
                  <Text style={[styles.txDesc, { color: colors.foreground }]} numberOfLines={1}>
                    {tx.description}
                  </Text>
                  <View style={styles.txMeta}>
                    <View style={[styles.typeBadge, { backgroundColor: accentColor + '22' }]}>
                      <Text style={[styles.typeBadgeText, { color: accentColor }]}>{cfg.label}</Text>
                    </View>
                    {tx.platform && (
                      <Text style={[styles.platform, { color: colors.mutedForeground }]}>{tx.platform}</Text>
                    )}
                    <Text style={[styles.date, { color: colors.mutedForeground }]}>{dateStr}</Text>
                  </View>

                  {isSale && (
                    <View style={styles.cogsRow}>
                      {isLinked && linkedTitle ? (
                        <View style={[styles.linkedBadge, { backgroundColor: colors.success + '18', borderColor: colors.success + '40' }]}>
                          <Feather name="link" size={10} color={colors.success} />
                          <Text style={[styles.linkedBadgeText, { color: colors.success }]} numberOfLines={1}>
                            COGS: {linkedTitle}
                          </Text>
                        </View>
                      ) : canLink ? (
                        <TouchableOpacity
                          style={[styles.linkPrompt, { borderColor: colors.teal + '55', backgroundColor: colors.teal + '0F' }]}
                          onPress={() => openLinkModal(tx.id, tx.description)}
                          activeOpacity={0.8}
                        >
                          <Feather name="plus-circle" size={11} color={colors.teal} />
                          <Text style={[styles.linkPromptText, { color: colors.teal }]}>Link Purchase COGS</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}
                </View>
                <Text style={[styles.amount, { color: tx.amount >= 0 ? colors.success : colors.destructive }]}>
                  {tx.amount >= 0 ? '+' : '-'}{fmt(tx.amount)}
                </Text>
              </TouchableOpacity>
              {i < filtered.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Modals ── */}
      <AddTransactionModal
        visible={addModalVisible}
        onClose={() => setAddModal(false)}
        onAdd={handleAdd}
      />

      <EbayImportModal
        visible={importModalVisible}
        onClose={() => setImport(false)}
        onImport={handleEbayImport}
      />

      <LinkCogsModal
        visible={linkSaleId !== null}
        saleId={linkSaleId}
        saleDescription={linkSaleDesc}
        unsoldItems={unsoldItems}
        onClose={() => setLinkSaleId(null)}
        onLink={handleLink}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  importBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  summaryStrip: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryVal: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 0.3 },
  summaryDivider: { width: 1, marginVertical: 4 },

  filterScroll: { borderBottomWidth: StyleSheet.hairlineWidth, maxHeight: 54 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  scroll: { flex: 1 },
  listContent: { paddingTop: 4 },

  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  txInfo: { flex: 1, gap: 4 },
  txDesc: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  txMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  platform: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  date: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  cogsRow: { marginTop: 4 },
  linkedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start',
  },
  linkedBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', maxWidth: 180 },
  linkPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start',
  },
  linkPromptText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  amount: { fontSize: 15, fontFamily: 'Inter_700Bold', flexShrink: 0, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 240, lineHeight: 20 },

  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  sortBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  sortPanel: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sortOptionIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sortOptionText: { flex: 1, fontSize: 13 },
});
