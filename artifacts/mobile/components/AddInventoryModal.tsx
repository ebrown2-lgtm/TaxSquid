import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import * as Haptics from 'expo-haptics';

const LOCATIONS = [
  'Yard Sale',
  'Goodwill',
  'Thrift Store',
  'Estate Sale',
  'Facebook Marketplace',
  'Other',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (item: {
    title: string;
    purchaseDate: string;
    purchasePrice: number;
    sourcingLocation: string;
    quantity: number;
  }) => void;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export function AddInventoryModal({ visible, onClose, onAdd }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [priceStr, setPriceStr] = useState('');
  const [location, setLocation] = useState('Yard Sale');
  const [customLocation, setCustomLocation] = useState('');
  const [qtyStr, setQtyStr] = useState('1');

  const reset = () => {
    setTitle('');
    setPurchaseDate(todayStr());
    setPriceStr('');
    setLocation('Yard Sale');
    setCustomLocation('');
    setQtyStr('1');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const finalLocation = location === 'Other' ? customLocation.trim() || 'Other' : location;
  const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
  const qty = Math.max(1, parseInt(qtyStr, 10) || 1);
  const isValid = title.trim().length > 0 && !isNaN(price) && price > 0;

  const handleSave = () => {
    if (!isValid) return;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onAdd({
      title: title.trim(),
      purchaseDate,
      purchasePrice: price,
      sourcingLocation: finalLocation,
      quantity: qty,
    });
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrapper}
      >
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
            <Text style={[styles.title, { color: colors.foreground }]}>Log Sourcing Purchase</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Item Title */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Item Title</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                placeholder="e.g. Super Nintendo Console"
                placeholderTextColor={colors.mutedForeground}
                value={title}
                onChangeText={setTitle}
              />
            </View>

            {/* Purchase Price + Quantity row */}
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Purchase Price ($)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                  placeholder="5.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={priceStr}
                  onChangeText={setPriceStr}
                />
              </View>
              <View style={[styles.field, { width: 72 }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Qty</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, textAlign: 'center' }]}
                  placeholder="1"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  value={qtyStr}
                  onChangeText={setQtyStr}
                />
              </View>
            </View>

            {/* Purchase Date */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Purchase Date</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                value={purchaseDate}
                onChangeText={setPurchaseDate}
              />
            </View>

            {/* Sourcing Location */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Sourcing Location</Text>
              <View style={styles.locationGrid}>
                {LOCATIONS.map((loc) => (
                  <TouchableOpacity
                    key={loc}
                    style={[
                      styles.locationChip,
                      {
                        backgroundColor: location === loc ? colors.teal + '33' : colors.muted,
                        borderColor: location === loc ? colors.teal : colors.border,
                      },
                    ]}
                    onPress={() => setLocation(loc)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.locationText,
                        { color: location === loc ? colors.teal : colors.mutedForeground },
                      ]}
                    >
                      {loc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {location === 'Other' && (
                <TextInput
                  style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, marginTop: 8 }]}
                  placeholder="Specify location..."
                  placeholderTextColor={colors.mutedForeground}
                  value={customLocation}
                  onChangeText={setCustomLocation}
                />
              )}
            </View>

            {/* Cost summary */}
            {isValid && (
              <View style={[styles.summary, { backgroundColor: colors.teal + '15', borderColor: colors.teal + '40' }]}>
                <Feather name="package" size={14} color={colors.teal} />
                <Text style={[styles.summaryText, { color: colors.teal }]}>
                  Total COGS: ${(price * qty).toFixed(2)} · {qty > 1 ? `${qty} units` : '1 unit'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: isValid ? colors.teal : colors.muted }]}
              onPress={handleSave}
              disabled={!isValid}
              activeOpacity={0.85}
            >
              <Feather
                name="package"
                size={16}
                color={isValid ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text style={[styles.saveBtnText, { color: isValid ? colors.primaryForeground : colors.mutedForeground }]}>
                Save to Unsold Inventory
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088' },
  sheetWrapper: { justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '90%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  field: { marginBottom: 16 },
  row: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', letterSpacing: 0.3, marginBottom: 6 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  locationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  locationText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  summaryText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 4,
  },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
