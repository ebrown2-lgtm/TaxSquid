import React, { useMemo, useState } from 'react';
import {
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
import { useColors } from '@/hooks/useColors';
import { InventoryItem } from '@/context/AppContext';
import * as Haptics from 'expo-haptics';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

/** Simple word-overlap similarity — returns count of shared meaningful words */
function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2);
  const wa = normalize(a);
  const wb = normalize(b);
  return wa.filter((w) => wb.includes(w)).length;
}

interface Props {
  visible: boolean;
  saleId: string | null;
  saleDescription: string;
  unsoldItems: InventoryItem[];
  onClose: () => void;
  onLink: (saleId: string, inventoryItemId: string) => void;
}

export function LinkCogsModal({ visible, saleId, saleDescription, unsoldItems, onClose, onLink }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);

  // Sort by similarity to sale description (suggested first)
  const sorted = useMemo(() => {
    return [...unsoldItems]
      .map((item) => ({ item, score: titleSimilarity(saleDescription, item.title) }))
      .sort((a, b) => b.score - a.score);
  }, [unsoldItems, saleDescription]);

  const hasSuggestions = sorted.some((s) => s.score > 0);

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  const handleLink = () => {
    if (!selected || !saleId) return;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onLink(saleId, selected);
    setSelected(null);
    onClose();
  };

  const selectedItem = unsoldItems.find((i) => i.id === selected);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: colors.foreground }]}>Link Purchase COGS</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
              {saleDescription}
            </Text>
          </View>
          <TouchableOpacity onPress={handleClose} hitSlop={12}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {unsoldItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No unsold inventory</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Add items in the Inventory tab first
            </Text>
          </View>
        ) : (
          <>
            {hasSuggestions && (
              <View style={[styles.suggestHeader, { backgroundColor: colors.teal + '15', borderColor: colors.teal + '30' }]}>
                <Ionicons name="sparkles" size={14} color={colors.teal} />
                <Text style={[styles.suggestLabel, { color: colors.teal }]}>Smart suggestions based on title</Text>
              </View>
            )}

            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {sorted.map(({ item, score }) => {
                const isSuggested = score > 0;
                const isSelected = selected === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.itemRow,
                      {
                        backgroundColor: isSelected ? colors.teal + '18' : colors.muted,
                        borderColor: isSelected ? colors.teal : colors.border,
                      },
                    ]}
                    onPress={() => setSelected(isSelected ? null : item.id)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          backgroundColor: isSelected ? colors.teal : 'transparent',
                          borderColor: isSelected ? colors.teal : colors.border,
                        },
                      ]}
                    >
                      {isSelected && <Feather name="check" size={12} color={colors.primaryForeground} />}
                    </View>
                    <View style={styles.itemInfo}>
                      <View style={styles.itemTitleRow}>
                        <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {isSuggested && (
                          <View style={[styles.suggestBadge, { backgroundColor: colors.teal + '22' }]}>
                            <Text style={[styles.suggestBadgeText, { color: colors.teal }]}>Match</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
                        {item.sourcingLocation} · {new Date(item.purchaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {item.quantity > 1 ? ` · Qty ${item.quantity}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.itemPrice, { color: isSelected ? colors.teal : colors.warning }]}>
                      {fmt(item.purchasePrice * item.quantity)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {selectedItem && (
          <View style={[styles.confirmStrip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <View style={styles.confirmInfo}>
              <Text style={[styles.confirmLabel, { color: colors.mutedForeground }]}>Will add COGS of</Text>
              <Text style={[styles.confirmAmount, { color: colors.teal }]}>
                {fmt(selectedItem.purchasePrice * selectedItem.quantity)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.linkBtn, { backgroundColor: colors.teal }]}
              onPress={handleLink}
              activeOpacity={0.85}
            >
              <Feather name="link" size={14} color={colors.primaryForeground} />
              <Text style={[styles.linkBtnText, { color: colors.primaryForeground }]}>Link</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '75%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  suggestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  suggestLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  list: { maxHeight: 320 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemInfo: { flex: 1 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1 },
  suggestBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  suggestBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  itemMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  itemPrice: { fontSize: 14, fontFamily: 'Inter_700Bold', flexShrink: 0 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  confirmStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  confirmInfo: { gap: 2 },
  confirmLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  confirmAmount: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  linkBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
