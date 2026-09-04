import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useEbayConnection } from '@/hooks/useEbayConnection';
import { useEbaySync } from '@/hooks/useEbaySync';
import {
  parseEbayCSV,
  ParseResult,
  ColumnMapping,
} from '@/utils/ebayCSVParser';
import { SAMPLE_EBAY_CSV_CONTENT, SAMPLE_CSV_FILENAME } from '@/utils/sampleEbayCSV';

// ── Read file cross-platform ────────────────────────────────────────────────
async function readFileText(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    return (await fetch(uri)).text();
  }
  const file = new File(uri);
  return file.text();
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = 'idle' | 'loading' | 'success' | 'mapping' | 'error';

interface MappingState {
  amount: number;
  title: number;
  date: number;
  fee: number;
}

const MAPPING_FIELDS: { key: keyof MappingState; label: string; required: boolean; hint: string }[] = [
  { key: 'amount', label: 'Sale Amount',  required: true,  hint: 'e.g. Amount, Item Subtotal, Sold For' },
  { key: 'title',  label: 'Item Title',   required: false, hint: 'e.g. Item Title, Title, Description' },
  { key: 'date',   label: 'Date',         required: false, hint: 'e.g. Date, Transaction Date, Paid Date' },
  { key: 'fee',    label: 'eBay Fee',     required: false, hint: 'e.g. Final Value Fee, eBay Fees, Fee' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onImport: (result: ParseResult) => void;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EbayImportModal({ visible, onClose, onImport }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { connected, checking, refresh, connect, disconnect } = useEbayConnection();
  const { syncing, lastSynced, lastCounts, syncError, sync, fetchLastSync } = useEbaySync();

  // Refresh cached sync metadata whenever the sheet opens
  useEffect(() => {
    if (visible) fetchLastSync();
  }, [visible, fetchLastSync]);

  const [stage, setStage]           = useState<Stage>('idle');
  const [result, setResult]         = useState<ParseResult | null>(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [fileName, setFileName]     = useState('');
  const [downloading, setDownload]  = useState(false);

  // Fallback mapping UI
  const [rawCsvText, setRawCsvText]       = useState('');
  const [detectedHeaders, setDetHeaders]  = useState<string[]>([]);
  const [mapping, setMapping]             = useState<MappingState>({
    amount: -1, title: -1, date: -1, fee: -1,
  });
  const [activeMapKey, setActiveMapKey]   = useState<keyof MappingState | null>(null);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const reset = () => {
    setStage('idle');
    setResult(null);
    setErrorMsg('');
    setFileName('');
    setRawCsvText('');
    setDetHeaders([]);
    setMapping({ amount: -1, title: -1, date: -1, fee: -1 });
    setActiveMapKey(null);
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Pick & auto-parse ─────────────────────────────────────────────────────
  const isPicking = useRef(false);

  const handlePickFile = async () => {
    if (isPicking.current) return;
    isPicking.current = true;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === 'web'
          ? 'text/csv'
          : ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (picked.canceled || !picked.assets?.length) return;

      const asset = picked.assets[0];
      setFileName(asset.name ?? 'report.csv');
      setStage('loading');

      const text = await readFileText(asset.uri);
      setRawCsvText(text);
      runParse(text);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to read the file. Please try again.');
      setStage('error');
    } finally {
      isPicking.current = false;
    }
  };

  // ── Core parse (with optional overrides) ─────────────────────────────────
  function runParse(csvText: string, overrides?: ColumnMapping) {
    const parsed = parseEbayCSV(csvText, overrides);

    setDetHeaders(parsed.detectedHeaders);

    if (parsed.errors.length > 0 && parsed.rows.length === 0) {
      const isAmountMissing = parsed.usedColumns.amount === -1;

      if (isAmountMissing && parsed.detectedHeaders.length > 0) {
        setMapping({ amount: -1, title: -1, date: -1, fee: -1 });
        setStage('mapping');
      } else {
        setErrorMsg(parsed.errors.join('\n\n'));
        setStage('error');
      }
      return;
    }

    setResult(parsed);
    setStage('success');
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  // ── Confirm import ────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (!result) return;
    onImport(result);
    handleClose();
  };

  // ── Retry with manual mapping ────────────────────────────────────────────
  const handleApplyMapping = () => {
    if (mapping.amount === -1) {
      Alert.alert('Amount column required', 'Please select which column contains the sale amount.');
      return;
    }
    setStage('loading');
    setTimeout(() => {
      runParse(rawCsvText, {
        amount:   mapping.amount   >= 0 ? mapping.amount   : undefined,
        title:    mapping.title    >= 0 ? mapping.title    : undefined,
        date:     mapping.date     >= 0 ? mapping.date     : undefined,
        fee:      mapping.fee      >= 0 ? mapping.fee      : undefined,
      });
    }, 80);
  };

  // ── Download sample CSV ───────────────────────────────────────────────────
  const handleDownloadSample = async () => {
    setDownload(true);
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([SAMPLE_EBAY_CSV_CONTENT], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = SAMPLE_CSV_FILENAME;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, SAMPLE_CSV_FILENAME);
        file.write(SAMPLE_EBAY_CSV_CONTENT);
        const path = file.uri;
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, {
            mimeType: 'text/csv',
            dialogTitle: 'Save Sample eBay CSV',
            UTI: 'public.comma-separated-values-text',
          });
        } else {
          Alert.alert('File Saved', `Sample CSV saved to:\n${path}`);
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not download sample CSV.');
    } finally {
      setDownload(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      <View style={[
        styles.sheet,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 24),
        },
      ]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIcon, { backgroundColor: colors.teal + '22' }]}>
              <Feather name="upload" size={16} color={colors.teal} />
            </View>
            <View>
              <Text style={[styles.title, { color: colors.foreground }]}>Import eBay CSV</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {stage === 'mapping'
                  ? 'Map columns manually'
                  : 'Seller Hub → Reports → Transactions'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleClose} hitSlop={12}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* ══ IDLE ══════════════════════════════════════════════════════════ */}
        {stage === 'idle' && (
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>

            {/* ── eBay Account Connection ────────────────────────────────── */}
            <View style={[
              styles.ebayAccountCard,
              {
                backgroundColor: connected ? colors.success + '10' : colors.muted,
                borderColor: connected ? colors.success + '40' : colors.border,
              },
            ]}>
              <View style={styles.ebayAccountRow}>
                <View style={[
                  styles.ebayAccountIcon,
                  { backgroundColor: connected ? colors.success + '20' : colors.background },
                ]}>
                  <Feather
                    name={connected ? 'check-circle' : 'link'}
                    size={16}
                    color={connected ? colors.success : colors.mutedForeground}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.ebayAccountTitle, { color: colors.foreground }]}>
                    {connected ? 'Connected to eBay' : 'eBay Account'}
                  </Text>
                  <Text style={[styles.ebayAccountSub, { color: colors.mutedForeground }]}>
                    {connected
                      ? 'Your eBay account is linked.'
                      : 'Connect for automatic sync (optional)'}
                  </Text>
                </View>

                {checking ? (
                  <ActivityIndicator size="small" color={colors.teal} />
                ) : connected ? (
                  <TouchableOpacity
                    onPress={disconnect}
                    style={[styles.ebayDisconnectBtn, { borderColor: colors.border }]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.ebayDisconnectText, { color: colors.mutedForeground }]}>
                      Disconnect
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.ebayConnectActions}>
                    <TouchableOpacity
                      onPress={connect}
                      style={[styles.ebayConnectBtn, { backgroundColor: colors.teal }]}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.ebayConnectBtnText, { color: colors.primaryForeground }]}>
                        Connect
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={refresh} hitSlop={10} style={{ padding: 4 }}>
                      <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {connected && (
                <View style={[styles.ebaySyncSection, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lastSyncedText, { color: colors.mutedForeground }]}>
                      {lastSynced
                        ? `Last synced: ${relativeTime(lastSynced)}`
                        : 'Not yet synced'}
                    </Text>
                    {lastCounts && lastCounts.total > 0 && (
                      <Text style={[styles.lastSyncedCounts, { color: colors.mutedForeground }]}>
                        {lastCounts.sales} sales · {lastCounts.fees} fees imported
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => sync(new Date().getFullYear())}
                    disabled={syncing}
                    style={[
                      styles.syncNowBtn,
                      { backgroundColor: syncing ? colors.muted : colors.teal },
                    ]}
                    activeOpacity={0.85}
                  >
                    {syncing
                      ? <ActivityIndicator size="small" color={colors.teal} />
                      : <Feather name="refresh-cw" size={12} color={colors.primaryForeground} />
                    }
                    <Text style={[
                      styles.syncNowText,
                      { color: syncing ? colors.mutedForeground : colors.primaryForeground },
                    ]}>
                      {syncing ? 'Syncing…' : 'Sync Data Now'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {syncError && (
                <Text style={[styles.syncErrorText, { color: colors.destructive }]}>
                  {syncError}
                </Text>
              )}

              {!connected && !checking && (
                <Text style={[styles.ebayAccountNote, { color: colors.mutedForeground }]}>
                  CSV import works without connecting. Tap Connect, log in, then tap{' '}
                  <Feather name="refresh-cw" size={10} color={colors.mutedForeground} /> to refresh.
                </Text>
              )}
            </View>

            <View style={[styles.instructCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.instructTitle, { color: colors.foreground }]}>
                How to export from eBay
              </Text>
              {[
                'Open eBay Seller Hub',
                'Go to Reports → Transaction reports',
                'Set your date range and click Download',
                'Open this app and tap "Choose CSV File" below',
              ].map((step, i) => (
                <View key={i} style={styles.instructRow}>
                  <View style={[styles.stepBubble, { backgroundColor: colors.teal + '33' }]}>
                    <Text style={[styles.stepNum, { color: colors.teal }]}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.mutedForeground }]}>{step}</Text>
                </View>
              ))}
            </View>

            <View style={styles.formatRow}>
              {['Transaction Report', 'Payments Report', 'Order CSV'].map(f => (
                <View key={f} style={[styles.formatChip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Feather name="check" size={10} color={colors.teal} />
                  <Text style={[styles.formatChipText, { color: colors.mutedForeground }]}>{f}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.pickBtn, { backgroundColor: colors.teal }]}
              onPress={handlePickFile}
              activeOpacity={0.85}
            >
              <Feather name="folder" size={18} color={colors.primaryForeground} />
              <Text style={[styles.pickBtnText, { color: colors.primaryForeground }]}>
                Choose CSV File
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sampleBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
              onPress={handleDownloadSample}
              disabled={downloading}
              activeOpacity={0.8}
            >
              {downloading
                ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                : <Feather name="download" size={15} color={colors.mutedForeground} />
              }
              <Text style={[styles.sampleBtnText, { color: colors.mutedForeground }]}>
                {downloading ? 'Saving…' : 'Download Sample eBay CSV'}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.sampleNote, { color: colors.mutedForeground }]}>
              Test the import flow with realistic data — 7 sample transactions ready to go.
            </Text>
          </ScrollView>
        )}

        {/* ══ LOADING ═══════════════════════════════════════════════════════ */}
        {stage === 'loading' && (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color={colors.teal} />
            <Text style={[styles.loadingText, { color: colors.foreground }]}>
              Parsing {fileName}…
            </Text>
            <Text style={[styles.loadingSub, { color: colors.mutedForeground }]}>
              Scanning for eBay column headers
            </Text>
          </View>
        )}

        {/* ══ MAPPING — fallback manual column picker ════════════════════════ */}
        {stage === 'mapping' && (
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <View style={[styles.mapBanner, {
              backgroundColor: colors.warning + '15',
              borderColor: colors.warning + '55',
            }]}>
              <Feather name="alert-circle" size={16} color={colors.warning} style={{ flexShrink: 0 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.mapBannerTitle, { color: colors.warning }]}>
                  Column headers not recognised
                </Text>
                <Text style={[styles.mapBannerSub, { color: colors.mutedForeground }]}>
                  Tap each field below and select which column from your CSV matches it.
                  Only "Sale Amount" is required.
                </Text>
              </View>
            </View>

            <Text style={[styles.mapSectionLabel, { color: colors.mutedForeground }]}>
              COLUMNS FOUND IN FILE ({detectedHeaders.length})
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              style={styles.chipScroll}
            >
              {detectedHeaders.map((h, idx) => {
                const isSelected = Object.values(mapping).includes(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.headerChip,
                      {
                        backgroundColor: isSelected
                          ? colors.teal + '25'
                          : colors.muted,
                        borderColor: isSelected
                          ? colors.teal
                          : colors.border,
                      },
                    ]}
                    onPress={() => {
                      if (!activeMapKey) return;
                      setMapping(prev => ({ ...prev, [activeMapKey]: idx }));
                      setActiveMapKey(null);
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.headerChipText, {
                      color: isSelected ? colors.teal : colors.foreground,
                      fontFamily: isSelected ? 'Inter_700Bold' : 'Inter_400Regular',
                    }]}>
                      {h || `(col ${idx + 1})`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={[styles.mapSectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>
              {activeMapKey
                ? `NOW SELECTING: ${MAPPING_FIELDS.find(f => f.key === activeMapKey)?.label.toUpperCase()} — tap a column above`
                : 'MAP EACH FIELD (tap a field, then tap a column)'}
            </Text>

            {MAPPING_FIELDS.map(field => {
              const colIdx     = mapping[field.key];
              const isActive   = activeMapKey === field.key;
              const headerName = colIdx >= 0 ? (detectedHeaders[colIdx] || `col ${colIdx + 1}`) : null;

              return (
                <TouchableOpacity
                  key={field.key}
                  style={[
                    styles.mapField,
                    {
                      backgroundColor: isActive
                        ? colors.teal + '12'
                        : colors.muted,
                      borderColor: isActive
                        ? colors.teal
                        : headerName
                          ? colors.success + '88'
                          : colors.border,
                      borderWidth: isActive ? 1.5 : 1,
                    },
                  ]}
                  onPress={() => setActiveMapKey(isActive ? null : field.key)}
                  activeOpacity={0.8}
                >
                  <View style={styles.mapFieldLeft}>
                    <View style={styles.mapFieldLabelRow}>
                      <Text style={[styles.mapFieldLabel, { color: colors.foreground }]}>
                        {field.label}
                      </Text>
                      {field.required && (
                        <View style={[styles.requiredBadge, { backgroundColor: colors.destructive + '22' }]}>
                          <Text style={[styles.requiredText, { color: colors.destructive }]}>required</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.mapFieldHint, { color: colors.mutedForeground }]}>
                      {field.hint}
                    </Text>
                  </View>

                  <View style={styles.mapFieldRight}>
                    {headerName ? (
                      <View style={[styles.mappedBadge, {
                        backgroundColor: colors.success + '22',
                        borderColor: colors.success + '55',
                      }]}>
                        <Feather name="check" size={10} color={colors.success} />
                        <Text style={[styles.mappedBadgeText, { color: colors.success }]} numberOfLines={1}>
                          {headerName}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.unmappedBadge, {
                        backgroundColor: isActive ? colors.teal + '22' : colors.background,
                        borderColor: isActive ? colors.teal : colors.border,
                      }]}>
                        <Text style={[styles.unmappedText, { color: isActive ? colors.teal : colors.mutedForeground }]}>
                          {isActive ? 'tap above' : 'not mapped'}
                        </Text>
                      </View>
                    )}

                    {headerName && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setMapping(prev => ({ ...prev, [field.key]: -1 }));
                        }}
                        hitSlop={8}
                        style={{ padding: 4 }}
                      >
                        <Feather name="x-circle" size={13} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    )}

                    {!headerName && (
                      <Feather
                        name={isActive ? 'chevrons-up' : 'chevron-right'}
                        size={14}
                        color={isActive ? colors.teal : colors.mutedForeground}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                {
                  backgroundColor: mapping.amount >= 0 ? colors.teal : colors.muted,
                  marginTop: 20,
                  opacity: mapping.amount >= 0 ? 1 : 0.5,
                },
              ]}
              onPress={handleApplyMapping}
              activeOpacity={0.85}
            >
              <Feather name="refresh-cw" size={16} color={colors.primaryForeground} />
              <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>
                Re-parse with My Mapping
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.retryBtn} onPress={reset} activeOpacity={0.7}>
              <Text style={[styles.retryText, { color: colors.mutedForeground }]}>
                Choose a different file
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ══ SUCCESS ═══════════════════════════════════════════════════════ */}
        {stage === 'success' && result && (
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <View style={[styles.successBadge, {
              backgroundColor: colors.success + '18',
              borderColor: colors.success + '40',
            }]}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <View style={styles.successText}>
                <Text style={[styles.successTitle, { color: colors.success }]}>Import Ready</Text>
                <Text style={[styles.successFile, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {fileName}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.statVal, { color: colors.success }]}>{result.rows.length}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Sales</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.statVal, { color: colors.teal }]}>{fmt(result.totalRevenue)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Revenue</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.statVal, { color: colors.destructive }]}>{fmt(result.totalFees)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>eBay Fees</Text>
              </View>
            </View>

            {result.rows.slice(0, 4).map((row, i) => (
              <View key={i} style={[styles.previewRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.previewIcon, { backgroundColor: colors.success + '22' }]}>
                  <Feather name="tag" size={12} color={colors.success} />
                </View>
                <Text style={[styles.previewTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {row.title}
                </Text>
                <Text style={[styles.previewAmt, { color: colors.success }]}>
                  {fmt(row.saleAmount)}
                </Text>
              </View>
            ))}
            {result.rows.length > 4 && (
              <Text style={[styles.moreRows, { color: colors.mutedForeground }]}>
                + {result.rows.length - 4} more sale{result.rows.length - 4 !== 1 ? 's' : ''}
              </Text>
            )}

            {result.warnings.length > 0 && (
              <View style={[styles.noticeRow, {
                backgroundColor: colors.teal + '12',
                borderColor: colors.teal + '40',
              }]}>
                <Feather name="info" size={13} color={colors.teal} style={{ flexShrink: 0 }} />
                <Text style={[styles.noticeText, { color: colors.teal }]}>
                  {result.warnings[0]}
                </Text>
              </View>
            )}

            {result.skipped > 0 && (
              <View style={[styles.noticeRow, {
                backgroundColor: colors.warning + '18',
                borderColor: colors.warning + '40',
              }]}>
                <Feather name="alert-circle" size={13} color={colors.warning} style={{ flexShrink: 0 }} />
                <Text style={[styles.noticeText, { color: colors.warning }]}>
                  {result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped — refunds or zero-amount
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.teal }]}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-download" size={18} color={colors.primaryForeground} />
              <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>
                Import {result.rows.length} Sale{result.rows.length !== 1 ? 's' : ''} into Ledger
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.retryBtn} onPress={reset} activeOpacity={0.7}>
              <Text style={[styles.retryText, { color: colors.mutedForeground }]}>
                Choose a different file
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ══ ERROR ══════════════════════════════════════════════════════════ */}
        {stage === 'error' && (
          <View style={styles.centeredState}>
            <View style={[styles.errorIcon, { backgroundColor: colors.destructive + '22' }]}>
              <Feather name="alert-triangle" size={28} color={colors.destructive} />
            </View>
            <Text style={[styles.errorTitle, { color: colors.foreground }]}>
              Couldn't parse this file
            </Text>
            <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>
              {errorMsg}
            </Text>
            {detectedHeaders.length > 0 && (
              <TouchableOpacity
                style={[styles.mapFallbackBtn, {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                }]}
                onPress={() => {
                  setMapping({ amount: -1, title: -1, date: -1, fee: -1 });
                  setStage('mapping');
                }}
                activeOpacity={0.8}
              >
                <Feather name="sliders" size={14} color={colors.teal} />
                <Text style={[styles.mapFallbackText, { color: colors.teal }]}>
                  Map columns manually
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.pickBtn, { backgroundColor: colors.teal, marginTop: 12 }]}
              onPress={reset}
              activeOpacity={0.85}
            >
              <Feather name="refresh-cw" size={16} color={colors.primaryForeground} />
              <Text style={[styles.pickBtnText, { color: colors.primaryForeground }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '92%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 17, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },

  instructCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12, marginBottom: 12 },
  instructTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  instructRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBubble: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNum:  { fontSize: 11, fontFamily: 'Inter_700Bold' },
  stepText: { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
  formatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  formatChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  formatChipText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  pickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 14, paddingVertical: 15, marginBottom: 12,
  },
  pickBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  sampleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 11, marginBottom: 8,
  },
  sampleBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  sampleNote: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 4 },

  ebayAccountCard: {
    borderRadius: 14, borderWidth: 1,
    padding: 12, marginBottom: 12,
  },
  ebayAccountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  ebayAccountIcon: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  ebayAccountTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  ebayAccountSub:   { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  ebayConnectActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ebayConnectBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8,
  },
  ebayConnectBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  ebayDisconnectBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1,
  },
  ebayDisconnectText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  ebayAccountNote: {
    fontSize: 11, fontFamily: 'Inter_400Regular',
    marginTop: 8, lineHeight: 16,
  },
  ebaySyncSection: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lastSyncedText:   { fontSize: 11, fontFamily: 'Inter_500Medium' },
  lastSyncedCounts: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 1 },
  syncNowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    flexShrink: 0,
  },
  syncNowText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  syncErrorText: {
    fontSize: 11, fontFamily: 'Inter_400Regular',
    marginTop: 6, lineHeight: 15,
  },

  centeredState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  loadingSub:  { fontSize: 12, fontFamily: 'Inter_400Regular' },

  mapBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16,
  },
  mapBannerTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  mapBannerSub:   { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  mapSectionLabel: {
    fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8,
    marginBottom: 8,
  },
  chipScroll: { marginBottom: 4 },
  chipRow: { flexDirection: 'row', gap: 6, paddingVertical: 4, paddingRight: 20 },
  headerChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  headerChipText: { fontSize: 12 },
  mapField: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 12, marginBottom: 8, gap: 10,
  },
  mapFieldLeft: { flex: 1 },
  mapFieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  mapFieldLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  requiredBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  requiredText:  { fontSize: 9, fontFamily: 'Inter_700Bold' },
  mapFieldHint:  { fontSize: 10, fontFamily: 'Inter_400Regular' },
  mapFieldRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  mappedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
    maxWidth: 120,
  },
  mappedBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  unmappedBadge: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  unmappedText: { fontSize: 10, fontFamily: 'Inter_500Medium' },

  successBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16,
  },
  successText:  { flex: 1 },
  successTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  successFile:  { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 4 },
  statVal:   { fontSize: 16, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewIcon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  previewTitle: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
  previewAmt:   { fontSize: 13, fontFamily: 'Inter_700Bold', flexShrink: 0 },
  moreRows: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 8 },
  noticeRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 10,
  },
  noticeText: { fontSize: 11, fontFamily: 'Inter_500Medium', flex: 1 },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 14, paddingVertical: 15, marginTop: 16,
  },
  confirmBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  retryBtn: { alignItems: 'center', paddingVertical: 12 },
  retryText: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  errorIcon:  { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  errorMsg: {
    fontSize: 12, fontFamily: 'Inter_400Regular',
    textAlign: 'center', paddingHorizontal: 10, lineHeight: 18,
  },
  mapFallbackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, marginTop: 14,
  },
  mapFallbackText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});