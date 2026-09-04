import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { MetricCard } from '@/components/MetricCard';
import { SquidIcon } from '@/components/SquidIcon';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function TypeBadge({ type }: { type: string }) {
  const colors = useColors();
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    sale: { bg: colors.success + '22', fg: colors.success, label: 'Sale' },
    cogs: { bg: colors.warning + '22', fg: colors.warning, label: 'COGS' },
    fee: { bg: colors.teal + '22', fg: colors.teal, label: 'Fee' },
    expense: {
      bg: colors.destructive + '22',
      fg: colors.destructive,
      label: 'Expense',
    },
  };
  const style = map[type] ?? map.expense;
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.badgeText, { color: style.fg }]}>
        {style.label}
      </Text>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { metrics, transactions, mileageRate, isTracking, drives } = useApp();

  const recent = transactions.slice(0, 5);
  const unclassified = drives.filter((d) => d.category === 'unclassified').length;

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <SquidIcon size={22} color={colors.teal} />
          <Text style={[styles.appName, { color: colors.foreground }]}>
            TaxSquid
          </Text>
        </View>
        <View style={styles.headerRight}>
          {isTracking && (
            <View style={[styles.trackingPill, { backgroundColor: colors.teal + '22', borderColor: colors.teal }]}>
              <View style={[styles.pulseDot, { backgroundColor: colors.teal }]} />
              <Text style={[styles.trackingText, { color: colors.teal }]}>
                Drive Active
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            hitSlop={10}
            style={[styles.settingsBtn, { backgroundColor: colors.muted }]}
            activeOpacity={0.75}
          >
            <Feather name="settings" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Unclassified drives nudge */}
        {unclassified > 0 && (
          <View
            style={[
              styles.nudge,
              { backgroundColor: colors.warning + '18', borderColor: colors.warning + '55' },
            ]}
          >
            <Feather name="alert-circle" size={14} color={colors.warning} />
            <Text style={[styles.nudgeText, { color: colors.warning }]}>
              {unclassified} drive{unclassified > 1 ? 's' : ''} need classification
            </Text>
            <Feather name="arrow-right" size={13} color={colors.warning} />
          </View>
        )}

        {/* Metric Grid */}
        <View style={styles.gridRow}>
          <MetricCard
            label="Gross Revenue"
            value={fmt(metrics.grossRevenue)}
            accentColor={colors.success}
            icon={<Ionicons name="trending-up" size={16} color={colors.success} />}
          />
          <MetricCard
            label="Platform Fees"
            value={fmt(metrics.platformFees)}
            accentColor={colors.destructive}
            icon={<Feather name="percent" size={16} color={colors.destructive} />}
          />
        </View>

        <View style={styles.gridRow}>
          <MetricCard
            label="COGS + Expenses"
            value={fmt(metrics.cogs)}
            accentColor={colors.warning}
            icon={<Feather name="shopping-bag" size={16} color={colors.warning} />}
          />
          <MetricCard
            label="Mileage Write-off"
            value={fmt(metrics.mileageWriteOff)}
            subLabel={`${metrics.businessMiles.toFixed(1)} mi × $${mileageRate.toFixed(2)}`}
            accentColor={colors.teal}
            icon={<Ionicons name="car" size={16} color={colors.teal} />}
          />
        </View>

        <MetricCard
          label="Net Taxable Income"
          value={fmt(metrics.netTaxableIncome)}
          accentColor={metrics.netTaxableIncome >= 0 ? colors.foreground : colors.success}
          icon={<Feather name="dollar-sign" size={16} color={colors.teal} />}
          fullWidth
        />

        {/* Recent Activity */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          RECENT ACTIVITY
        </Text>

        <View
          style={[
            styles.ledgerCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {recent.map((tx, i) => (
            <View key={tx.id}>
              <View style={styles.txRow}>
                <View style={styles.txLeft}>
                  <TypeBadge type={tx.type} />
                  <Text
                    style={[styles.txDesc, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {tx.description}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    {
                      color:
                        tx.amount >= 0 ? colors.success : colors.destructive,
                    },
                  ]}
                >
                  {tx.amount >= 0 ? '+' : ''}
                  {fmt(tx.amount)}
                </Text>
              </View>
              {i < recent.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  trackingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  trackingText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 10,
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 2,
  },
  nudgeText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 2,
  },
  ledgerCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  txLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  txDesc: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  txAmount: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
});
