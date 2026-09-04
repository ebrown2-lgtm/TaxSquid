import React, { useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useApp, InventoryItem } from '@/context/AppContext';
import { AddInventoryModal } from '@/components/AddInventoryModal';
import * as Haptics from 'expo-haptics';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

type Segment = 'unsold' | 'log';

export async function deleteInventoryItemRemote(id: string): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id);
  if (error) throw error;
}

export default function InventoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { inventoryItems, addInventoryItem, metrics, transactions, deleteInventoryItem } = useApp();
  const [segment, setSegment] = useState<Segment>('unsold');
  const [modalVisible, setModalVisible] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const unsoldItems = inventoryItems.filter((i) => i.status === 'unsold');
  const allItems = [...inventoryItems].sort(
    (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
  );
  const displayed = segment === 'unsold' ? unsoldItems : allItems;

  const handleAdd = (item: Parameters<typeof addInventoryItem>[0]) => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    addInventoryItem(item);
  };

  const handleDeleteItem = (item: InventoryItem) => {
    if (item.status === 'sold') {
      Alert.alert(
        'Item Already Sold',
        'This item is linked to a completed sale and can\'t be deleted. If you need to undo the sale, unlink it from the transaction first.'
      );
      return;
    }
    Alert.alert(
      'Delete Item',
      `Remove "${item.title}" from your inventory? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            deleteInventoryItem(item.id);
          },
        },
      ]
    );
  };
  
  // Find the sale description for a sold item's linked sale
  function linkedSaleDesc(linkedSaleId?: string) {
    if (!linkedSaleId) return null;
    return transactions.find((t) => t.id === linkedSaleId)?.description ?? null;
  }

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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Inventory</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.teal }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={16} color={colors.primaryForeground} />
          <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Log Item</Text>
        </TouchableOpacity>
      </View>

      {/* Segment control */}
      <View style={[styles.segmentWrap, { borderBottomColor: colors.border }]}>
        <View style={[styles.segmentControl, { backgroundColor: colors.muted }]}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              segment === 'unsold' && { backgroundColor: colors.card },
            ]}
            onPress={() => setSegment('unsold')}
            activeOpacity={0.8}
          >
            <Feather
              name="package"
              size={13}
              color={segment === 'unsold' ? colors.teal : colors.mutedForeground}
            />
            <Text
              style={[
                styles.segmentText,
                { color: segment === 'unsold' ? colors.foreground : colors.mutedForeground },
              ]}
            >
              Unsold Inventory
            </Text>
            {unsoldItems.length > 0 && (
              <View style={[styles.countBubble, { backgroundColor: colors.teal }]}>
                <Text style={[styles.countBubbleText, { color: colors.primaryForeground }]}>
                  {unsoldItems.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              segment === 'log' && { backgroundColor: colors.card },
            ]}
            onPress={() => setSegment('log')}
            activeOpacity={0.8}
          >
            <Feather
              name="list"
              size={13}
              color={segment === 'log' ? colors.teal : colors.mutedForeground}
            />
            <Text
              style={[
                styles.segmentText,
                { color: segment === 'log' ? colors.foreground : colors.mutedForeground },
              ]}
            >
              Sourced Log
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.OS === 'web' && { paddingBottom: 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Unsold Inventory Value metric card — only in unsold view */}
        {segment === 'unsold' && (
          <View
            style={[
              styles.metricCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.metricRow}>
              <View style={[styles.metricIcon, { backgroundColor: colors.warning + '22' }]}>
                <Ionicons name="cube" size={18} color={colors.warning} />
              </View>
              <View style={styles.metricInfo}>
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
                  Unsold Inventory Value
                </Text>
                <Text style={[styles.metricSub, { color: colors.mutedForeground }]}>
                  Cash tied up in stock · {unsoldItems.length} item{unsoldItems.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={[styles.metricValue, { color: colors.warning }]}>
                {fmt(metrics.unsoldInventoryValue)}
              </Text>
            </View>
          </View>
        )}

        {/* Items list */}
        {displayed.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={44} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {segment === 'unsold' ? 'No unsold items' : 'No items sourced yet'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Tap "Log Item" to record a sourcing purchase
            </Text>
          </View>
        ) : (
          displayed.map((item) => {
            const isSold = item.status === 'sold';
            const saleDesc = isSold ? linkedSaleDesc(item.linkedSaleId) : null;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: isSold ? colors.border : colors.teal + '33',
                  },
                ]}
                activeOpacity={0.85}
                onLongPress={() => handleDeleteItem(item)}
                delayLongPress={400}
              >
                <View style={styles.itemTop}>
                  <View
                    style={[
                      styles.itemIcon,
                      {
                        backgroundColor: isSold
                          ? colors.success + '22'
                          : colors.warning + '22',
                      },
                    ]}
                  >
                    <Feather
                      name={isSold ? 'check-circle' : 'package'}
                      size={16}
                      color={isSold ? colors.success : colors.warning}
                    />
                  </View>
                  <View style={styles.itemBody}>
                    <View style={styles.itemTitleRow}>
                      <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: isSold
                              ? colors.success + '22'
                              : colors.warning + '22',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: isSold ? colors.success : colors.warning },
                          ]}
                        >
                          {isSold ? 'Sold' : 'Unsold'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
                      {item.sourcingLocation} ·{' '}
                      {new Date(item.purchaseDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {item.quantity > 1 ? ` · Qty ${item.quantity}` : ''}
                    </Text>
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={[styles.itemPrice, { color: isSold ? colors.mutedForeground : colors.teal }]}>
                      {fmt(item.purchasePrice * item.quantity)}
                    </Text>
                    <Text style={[styles.itemPriceLabel, { color: colors.mutedForeground }]}>COGS</Text>
                  </View>
                </View>

                {/* Sold linkage info */}
                {isSold && saleDesc && (
                  <View style={[styles.linkedRow, { borderTopColor: colors.border }]}>
                    <Feather name="link" size={11} color={colors.success} />
                    <Text style={[styles.linkedText, { color: colors.success }]} numberOfLines={1}>
                      Linked to: {saleDesc}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <AddInventoryModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAdd={handleAdd}
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
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  segmentWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segmentControl: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  segmentText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  countBubble: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBubbleText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10 },
  metricCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 4,
  },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricInfo: { flex: 1 },
  metricLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  metricSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  metricValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 240 },
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemBody: { flex: 1, gap: 3 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  itemMeta: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  priceCol: { alignItems: 'flex-end' },
  itemPrice: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  itemPriceLabel: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  linkedText: { fontSize: 11, fontFamily: 'Inter_500Medium', flex: 1 },
});
