import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useApp, TaxHubConfig } from '@/context/AppContext';
import { buildTaxReportHtml } from '@/utils/taxReport';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEbaySync } from '@/hooks/useEbaySync';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// Current year, plus the two years before it — always correct, no manual updates needed
const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR];

// ── Stepper component for percentage values ─────────────────────────────────
function PctStepper({
  value,
  onChange,
  colors,
}: {
  value: number;
  onChange: (v: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  return (
    <View style={[stepperStyles.row, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => onChange(clamp(value - 5))}
        style={stepperStyles.btn}
        hitSlop={8}
      >
        <Feather name="minus" size={14} color={colors.mutedForeground} />
      </TouchableOpacity>
      <TextInput
        style={[stepperStyles.val, { color: colors.foreground }]}
        value={String(value)}
        onChangeText={(t) => {
          const n = parseInt(t, 10);
          if (!isNaN(n)) onChange(clamp(n));
        }}
        keyboardType="number-pad"
        maxLength={3}
      />
      <Text style={[stepperStyles.pct, { color: colors.mutedForeground }]}>%</Text>
      <TouchableOpacity
        onPress={() => onChange(clamp(value + 5))}
        style={stepperStyles.btn}
        hitSlop={8}
      >
        <Feather name="plus" size={14} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 4,
    height: 38,
    gap: 2,
  },
  btn: { padding: 6 },
  val: { width: 36, textAlign: 'center', fontSize: 14, fontFamily: 'Inter_700Bold' },
  pct: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});

// ── Dollar input ─────────────────────────────────────────────────────────────
function DollarInput({
  value,
  onChangeText,
  placeholder,
  colors,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useColors>;
  style?: object;
}) {
  return (
    <View style={[dollarStyles.wrap, { backgroundColor: colors.muted, borderColor: colors.border }, style]}>
      <Text style={[dollarStyles.sym, { color: colors.mutedForeground }]}>$</Text>
      <TextInput
        style={[dollarStyles.input, { color: colors.foreground }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType="decimal-pad"
      />
    </View>
  );
}

const dollarStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 40,
    flex: 1,
  },
  sym: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginRight: 4 },
  input: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
});

// ── Section card wrapper ─────────────────────────────────────────────────────
function SectionCard({
  title,
  icon,
  iconColor,
  iconBg,
  children,
  colors,
}: {
  title: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.cardHeader}>
        <View style={[cardStyles.cardIcon, { backgroundColor: iconBg }]}>
          <Feather name={icon as any} size={15} color={iconColor} />
        </View>
        <Text style={[cardStyles.cardTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});

// ── Row label/control pair ────────────────────────────────────────────────────
function FieldRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={fieldRowStyles.row}>
      <View style={fieldRowStyles.labelCol}>
        <Text style={fieldRowStyles.label}>{label}</Text>
        {sub ? <Text style={fieldRowStyles.sub}>{sub}</Text> : null}
      </View>
      <View style={fieldRowStyles.control}>{children}</View>
    </View>
  );
}

const fieldRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  labelCol: { flex: 1 },
  label: { color: '#8B949E', fontSize: 12, fontFamily: 'Inter_500Medium' },
  sub: { color: '#8B949E', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 1 },
  control: { flexShrink: 0 },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function TaxHubScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { taxHub, updateTaxHub, metrics, transactions, syncedYears, isYearSyncable, mileageRate } = useApp();

  const [exporting, setExporting] = useState(false);
  const [syncingYear, setSyncingYear] = useState<number | null>(null);
  const { sync, syncing, syncError } = useEbaySync();


  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Local string states for dollar inputs (avoids cursor-jump on decimal edit)
  const [internetStr, setInternetStr] = useState(String(taxHub.monthlyInternetBill));
  const [cellStr, setCellStr] = useState(String(taxHub.monthlyCellBill));
  const [rentStr, setRentStr] = useState(String(taxHub.annualRentMortgage));
  const [officeStr, setOfficeStr] = useState(String(taxHub.homeOfficeSqFt));
  const [totalSqFtStr, setTotalSqFtStr] = useState(String(taxHub.totalHomeSqFt));

  const businessPct =
    taxHub.totalHomeSqFt > 0
      ? ((taxHub.homeOfficeSqFt / taxHub.totalHomeSqFt) * 100).toFixed(1)
      : '0.0';

  const totalUtilityDeductions =
    metrics.homeOfficeDeduction + metrics.internetDeduction + metrics.cellDeduction;

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const html = buildTaxReportHtml({ metrics, mileageRate, transactions, taxHub });

      if (Platform.OS === 'web') {
        // Web: open print dialog
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          win.print();
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `TaxSquid ${taxHub.taxYear} Tax Summary`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('PDF Saved', `Report saved to:\n${uri}`);
        }
      }
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message ?? 'Something went wrong generating the PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Tax Hub</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Year-end summary & export
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.exportBtn,
            { backgroundColor: exporting ? colors.muted : colors.teal },
          ]}
          onPress={handleExport}
          disabled={exporting}
          activeOpacity={0.85}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather name="file-text" size={15} color={colors.primaryForeground} />
          )}
          <Text style={[styles.exportBtnText, { color: colors.primaryForeground }]}>
            {exporting ? 'Generating…' : 'Export PDF'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.OS === 'web' && { paddingBottom: 120 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Tax Year ── */}
        <View style={[styles.yearCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.yearLabel, { color: colors.mutedForeground }]}>TAX YEAR</Text>
          <View style={styles.yearPills}>
            {TAX_YEARS.map((y) => {
              const synced = syncedYears.includes(y);
              const canSync = isYearSyncable(y);
              return (
                <TouchableOpacity
                  key={y}
                  style={[
                    styles.yearPill,
                    {
                      backgroundColor: taxHub.taxYear === y ? colors.teal : colors.muted,
                      borderColor: taxHub.taxYear === y ? colors.teal : colors.border,
                      opacity: synced ? 1 : 0.55,
                    },
                  ]}
                  onPress={async () => {
                    if (synced) {
                      updateTaxHub({ taxYear: y });
                      return;
                    }
                    if (!canSync) return;

                    setSyncingYear(y);
                    await sync(y);
                    setSyncingYear(null);
                    // sync() calls markYearSynced internally on success —
                    // only switch to this year if it actually synced
                    updateTaxHub({ taxYear: y });
                  }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.yearPillText,
                      { color: taxHub.taxYear === y ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {y}
                  </Text>
                  {!synced && (
                    <Text
                      style={{
                        fontSize: 9,
                        fontFamily: 'Inter_500Medium',
                        color: taxHub.taxYear === y ? colors.primaryForeground + 'CC' : colors.mutedForeground,
                        marginTop: 1,
                      }}
                    >
                      {canSync ? 'Tap to sync' : 'Unavailable'}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        {syncError && (
          <Text style={{ fontSize: 11, color: colors.destructive, marginTop: 6, paddingHorizontal: 4 }}>
            {syncError}
          </Text>
        )}

        {/* ── Net Profit Banner ── */}
        {(() => {
          const totalDeductions =
            metrics.cogs +
            metrics.platformFees +
            metrics.mileageWriteOff +
            totalUtilityDeductions;
          const net = metrics.netTaxableIncome;
          const isProfit = net >= 0;
          const netColor = isProfit ? colors.success : colors.destructive;

          return (
            <View
              style={[
                styles.profitBanner,
                {
                  backgroundColor: isProfit
                    ? colors.success + '15'
                    : colors.destructive + '15',
                  borderColor: isProfit
                    ? colors.success + '40'
                    : colors.destructive + '40',
                },
              ]}
            >
              {/* ── Revenue / Deductions mini-cards ── */}
              <View style={styles.profitMiniRow}>
                <View
                  style={[
                    styles.profitMiniCard,
                    { backgroundColor: colors.success + '18', borderColor: colors.success + '35' },
                  ]}
                >
                  <Text style={[styles.profitMiniLabel, { color: colors.mutedForeground }]}>
                    Revenue
                  </Text>
                  <Text style={[styles.profitMiniValue, { color: colors.success }]}>
                    {fmt(metrics.grossRevenue)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.profitMiniCard,
                    { backgroundColor: colors.destructive + '18', borderColor: colors.destructive + '35' },
                  ]}
                >
                  <Text style={[styles.profitMiniLabel, { color: colors.mutedForeground }]}>
                    Deductions
                  </Text>
                  <Text style={[styles.profitMiniValue, { color: colors.destructive }]}>
                    {fmt(totalDeductions)}
                  </Text>
                </View>
              </View>

              {/* ── Divider ── */}
              <View style={[styles.profitDivider, { backgroundColor: colors.border }]} />

              {/* ── Net result ── */}
              <View>
                <Text style={[styles.profitLabel, { color: colors.mutedForeground }]}>
                  {taxHub.taxYear} Net Taxable {isProfit ? 'Profit' : 'Loss'}
                </Text>
                <Text style={[styles.profitValue, { color: netColor }]}>
                  {fmt(net)}
                </Text>
              </View>

              {/* ── Equation row ── */}
              <Text style={[styles.profitEquation, { color: colors.mutedForeground }]}>
                <Text style={{ color: colors.success }}>{fmt(metrics.grossRevenue)}</Text>
                {'  −  '}
                <Text style={{ color: colors.destructive }}>{fmt(totalDeductions)}</Text>
                {'  =  '}
                <Text style={{ color: netColor }}>{fmt(net)}</Text>
              </Text>
            </View>
          );
        })()}

        {/* ── Home Office ── */}
        <SectionCard
          title="Home Office"
          icon="home"
          iconColor={colors.teal}
          iconBg={colors.teal + '22'}
          colors={colors}
        >
          {/* Sq ft row */}
          <View style={styles.sqFtRow}>
            <View style={styles.sqFtField}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Office Sq Ft
              </Text>
              <View
                style={[styles.sqFtInput, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <TextInput
                  style={[styles.sqFtText, { color: colors.foreground }]}
                  value={officeStr}
                  onChangeText={(t) => {
                    setOfficeStr(t);
                    const n = parseInt(t, 10);
                    if (!isNaN(n) && n >= 0) updateTaxHub({ homeOfficeSqFt: n });
                  }}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            </View>
            <Text style={[styles.sqFtSlash, { color: colors.mutedForeground }]}>/</Text>
            <View style={styles.sqFtField}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Total Home Sq Ft
              </Text>
              <View
                style={[styles.sqFtInput, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <TextInput
                  style={[styles.sqFtText, { color: colors.foreground }]}
                  value={totalSqFtStr}
                  onChangeText={(t) => {
                    setTotalSqFtStr(t);
                    const n = parseInt(t, 10);
                    if (!isNaN(n) && n > 0) updateTaxHub({ totalHomeSqFt: n });
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
            </View>
            <View
              style={[
                styles.businessPctBadge,
                { backgroundColor: colors.teal + '20', borderColor: colors.teal + '40' },
              ]}
            >
              <Text style={[styles.businessPctText, { color: colors.teal }]}>
                {businessPct}%
              </Text>
              <Text style={[styles.businessPctSub, { color: colors.teal }]}>business</Text>
            </View>
          </View>

          {/* Method toggle */}
          <View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Deduction Method
            </Text>
            <View style={[styles.methodToggle, { backgroundColor: colors.muted }]}>
              <TouchableOpacity
                style={[
                  styles.methodBtn,
                  taxHub.deductionMethod === 'simplified' && {
                    backgroundColor: colors.card,
                    borderColor: colors.teal,
                  },
                  { borderColor: 'transparent' },
                ]}
                onPress={() => updateTaxHub({ deductionMethod: 'simplified' })}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.methodText,
                    {
                      color:
                        taxHub.deductionMethod === 'simplified'
                          ? colors.teal
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  Simplified
                </Text>
                <Text
                  style={[
                    styles.methodSub,
                    {
                      color:
                        taxHub.deductionMethod === 'simplified'
                          ? colors.teal + 'AA'
                          : colors.mutedForeground + '88',
                    },
                  ]}
                >
                  $5/sq ft · max 300
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.methodBtn,
                  taxHub.deductionMethod === 'actual' && {
                    backgroundColor: colors.card,
                    borderColor: colors.teal,
                  },
                  { borderColor: 'transparent' },
                ]}
                onPress={() => updateTaxHub({ deductionMethod: 'actual' })}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.methodText,
                    {
                      color:
                        taxHub.deductionMethod === 'actual'
                          ? colors.teal
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  Actual Expenses
                </Text>
                <Text
                  style={[
                    styles.methodSub,
                    {
                      color:
                        taxHub.deductionMethod === 'actual'
                          ? colors.teal + 'AA'
                          : colors.mutedForeground + '88',
                    },
                  ]}
                >
                  % of rent/mortgage
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Annual rent — only shown in actual mode */}
          {taxHub.deductionMethod === 'actual' && (
            <FieldRow
              label="Annual Rent / Mortgage Interest"
              sub={`Business portion: ${businessPct}%`}
            >
              <DollarInput
                value={rentStr}
                onChangeText={(t) => {
                  setRentStr(t);
                  const n = parseFloat(t);
                  if (!isNaN(n)) updateTaxHub({ annualRentMortgage: n });
                }}
                placeholder="14400"
                colors={colors}
              />
            </FieldRow>
          )}

          {/* Computed deduction */}
          <View
            style={[
              styles.deductionLine,
              { backgroundColor: colors.teal + '12', borderColor: colors.teal + '35' },
            ]}
          >
            <Feather name="check-circle" size={13} color={colors.teal} />
            <Text style={[styles.deductionText, { color: colors.teal }]}>
              Home office deduction:{' '}
              <Text style={styles.deductionBold}>{fmt(metrics.homeOfficeDeduction)}</Text>
              {taxHub.deductionMethod === 'simplified' &&
                taxHub.homeOfficeSqFt > 300 && (
                  <Text style={{ fontFamily: 'Inter_400Regular' }}> (capped at 300 sq ft)</Text>
                )}
            </Text>
          </View>
        </SectionCard>

        {/* ── Internet & Phone ── */}
        <SectionCard
          title="Internet & Cell Phone"
          icon="wifi"
          iconColor={colors.warning}
          iconBg={colors.warning + '22'}
          colors={colors}
        >
          {/* Internet */}
          <View style={styles.billRow}>
            <View style={styles.billLabelCol}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Monthly Internet Bill
              </Text>
            </View>
            <DollarInput
              value={internetStr}
              onChangeText={(t) => {
                setInternetStr(t);
                const n = parseFloat(t);
                if (!isNaN(n)) updateTaxHub({ monthlyInternetBill: n });
              }}
              placeholder="79.99"
              colors={colors}
              style={{ maxWidth: 110 }}
            />
            <PctStepper
              value={taxHub.internetBusinessPct}
              onChange={(v) => updateTaxHub({ internetBusinessPct: v })}
              colors={colors}
            />
          </View>
          <View
            style={[
              styles.deductionLine,
              { backgroundColor: colors.warning + '12', borderColor: colors.warning + '35' },
            ]}
          >
            <Feather name="check-circle" size={13} color={colors.warning} />
            <Text style={[styles.deductionText, { color: colors.warning }]}>
              Annual internet deduction:{' '}
              <Text style={styles.deductionBold}>{fmt(metrics.internetDeduction)}</Text>
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Cell phone */}
          <View style={styles.billRow}>
            <View style={styles.billLabelCol}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Monthly Cell Phone Bill
              </Text>
            </View>
            <DollarInput
              value={cellStr}
              onChangeText={(t) => {
                setCellStr(t);
                const n = parseFloat(t);
                if (!isNaN(n)) updateTaxHub({ monthlyCellBill: n });
              }}
              placeholder="65.00"
              colors={colors}
              style={{ maxWidth: 110 }}
            />
            <PctStepper
              value={taxHub.cellBusinessPct}
              onChange={(v) => updateTaxHub({ cellBusinessPct: v })}
              colors={colors}
            />
          </View>
          <View
            style={[
              styles.deductionLine,
              { backgroundColor: colors.warning + '12', borderColor: colors.warning + '35' },
            ]}
          >
            <Feather name="check-circle" size={13} color={colors.warning} />
            <Text style={[styles.deductionText, { color: colors.warning }]}>
              Annual cell deduction:{' '}
              <Text style={styles.deductionBold}>{fmt(metrics.cellDeduction)}</Text>
            </Text>
          </View>
        </SectionCard>

        {/* ── Write-Off Summary ── */}
        <SectionCard
          title="Total Write-Off Summary"
          icon="trending-down"
          iconColor={colors.success}
          iconBg={colors.success + '22'}
          colors={colors}
        >
          {[
            { label: 'Cost of Goods Sold', value: metrics.cogs, color: colors.destructive },
            { label: 'Platform Fees', value: metrics.platformFees, color: colors.destructive },
            { label: 'Mileage Write-Off', value: metrics.mileageWriteOff, color: colors.teal },
            {
              label: 'Home Office Deduction',
              value: metrics.homeOfficeDeduction,
              color: colors.teal,
            },
            {
              label: 'Internet Deduction',
              value: metrics.internetDeduction,
              color: colors.warning,
            },
            {
              label: 'Cell Phone Deduction',
              value: metrics.cellDeduction,
              color: colors.warning,
            },
          ].map((row, i) => (
            <View key={i}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
                  {row.label}
                </Text>
                <Text style={[styles.summaryValue, { color: row.color }]}>
                  -{fmt(row.value)}
                </Text>
              </View>
              {i < 5 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))}

          <View
            style={[
              styles.totalRow,
              { backgroundColor: colors.success + '15', borderColor: colors.success + '40' },
            ]}
          >
            <Text style={[styles.totalLabel, { color: colors.success }]}>
              Total Deductions
            </Text>
            <Text style={[styles.totalValue, { color: colors.success }]}>
              -
              {fmt(
                metrics.cogs +
                  metrics.platformFees +
                  metrics.mileageWriteOff +
                  totalUtilityDeductions
              )}
            </Text>
          </View>
        </SectionCard>

        {/* ── Schedule C Quick Ref ── */}
        <SectionCard
          title="Schedule C Line Reference"
          icon="file-text"
          iconColor={colors.mutedForeground}
          iconBg={colors.muted}
          colors={colors}
        >
          {[
            { line: '1', desc: 'Gross Receipts / Sales', value: fmt(metrics.grossRevenue), positive: true },
            { line: '4', desc: 'Cost of Goods Sold', value: `-${fmt(metrics.cogs)}` },
            { line: '9', desc: 'Car & Truck (Mileage)', value: `-${fmt(metrics.mileageWriteOff)}` },
            { line: '25', desc: 'Utilities (Internet + Cell)', value: `-${fmt(metrics.internetDeduction + metrics.cellDeduction)}` },
            { line: '30', desc: 'Home Office', value: `-${fmt(metrics.homeOfficeDeduction)}` },
            { line: '31', desc: 'Net Profit / Loss', value: fmt(metrics.netTaxableIncome), net: true },
          ].map((row, i, arr) => (
            <View key={row.line}>
              <View style={styles.scRow}>
                <View
                  style={[
                    styles.scLineBadge,
                    {
                      backgroundColor: row.net ? colors.success + '22' : colors.muted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.scLineText,
                      { color: row.net ? colors.success : colors.mutedForeground },
                    ]}
                  >
                    {row.line}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.scDesc,
                    { color: row.net ? colors.foreground : colors.mutedForeground, flex: 1 },
                  ]}
                >
                  {row.desc}
                </Text>
                <Text
                  style={[
                    styles.scValue,
                    {
                      color: row.net
                        ? metrics.netTaxableIncome >= 0
                          ? colors.success
                          : colors.destructive
                        : row.positive
                        ? colors.success
                        : colors.foreground,
                      fontFamily: row.net ? 'Inter_700Bold' : 'Inter_600SemiBold',
                    },
                  ]}
                >
                  {row.value}
                </Text>
              </View>
              {i < arr.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))}
        </SectionCard>

        {/* ── Export button (bottom) ── */}
        <TouchableOpacity
          style={[
            styles.exportBig,
            { backgroundColor: exporting ? colors.muted : colors.teal },
          ]}
          onPress={handleExport}
          disabled={exporting}
          activeOpacity={0.85}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons name="document-text" size={20} color={colors.primaryForeground} />
              <View>
                <Text style={[styles.exportBigTitle, { color: colors.primaryForeground }]}>
                  Export IRS Tax Summary PDF
                </Text>
                <Text style={[styles.exportBigSub, { color: colors.primaryForeground + 'BB' }]}>
                  Schedule C · {taxHub.taxYear} Tax Year
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={colors.primaryForeground + 'AA'}
                style={{ marginLeft: 'auto' }}
              />
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
          For informational use only — not tax advice. Consult a licensed CPA before filing.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 110,
    justifyContent: 'center',
  },
  exportBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },

  // Year
  yearCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  yearLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  yearPills: { flexDirection: 'row', gap: 8 },
  yearPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  yearPillText: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  // Profit banner
  profitBanner: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  profitMiniRow: { flexDirection: 'row', gap: 10 },
  profitMiniCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  profitMiniLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.5 },
  profitMiniValue: { fontSize: 17, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  profitDivider: { height: 1, marginHorizontal: -16 },
  profitLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  profitValue: { fontSize: 28, fontFamily: 'Inter_800ExtraBold', letterSpacing: -1, marginTop: 2 },
  profitEquation: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  // Sq ft
  sqFtRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  sqFtField: { flex: 1 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 5 },
  sqFtInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 40,
    justifyContent: 'center',
  },
  sqFtText: { fontSize: 16, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  sqFtSlash: { fontSize: 20, fontFamily: 'Inter_300Light', paddingBottom: 8 },
  businessPctBadge: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 2,
  },
  businessPctText: { fontSize: 16, fontFamily: 'Inter_800ExtraBold' },
  businessPctSub: { fontSize: 9, fontFamily: 'Inter_500Medium' },

  // Method toggle
  methodToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginTop: 5,
  },
  methodBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  methodText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  methodSub: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 1 },

  // Deduction result line
  deductionLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  deductionText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },
  deductionBold: { fontFamily: 'Inter_700Bold' },

  // Bill rows
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  billLabelCol: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },

  // Write-off summary
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  summaryValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  totalLabel: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  totalValue: { fontSize: 18, fontFamily: 'Inter_800ExtraBold' },

  // Schedule C
  scRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  scLineBadge: {
    width: 28,
    height: 22,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scLineText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  scDesc: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  scValue: { fontSize: 13, flexShrink: 0 },

  // Big export button
  exportBig: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    padding: 18,
    marginTop: 4,
  },
  exportBigTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  exportBigSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },

  disclaimer: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 15,
  },
});
