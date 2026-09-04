import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { TransactionType } from '@/context/AppContext';
import * as Haptics from 'expo-haptics';

const TYPES: { key: TransactionType; label: string; sign: 1 | -1 }[] = [
  { key: 'sale', label: 'Sale', sign: 1 },
  { key: 'cogs', label: 'COGS', sign: -1 },
  { key: 'fee', label: 'Fee', sign: -1 },
  { key: 'expense', label: 'Expense', sign: -1 },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (tx: {
    type: TransactionType;
    description: string;
    amount: number;
    date: string;
    platform?: string;
  }) => void;
}

export function AddTransactionModal({ visible, onClose, onAdd }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<TransactionType>('sale');
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [platform, setPlatform] = useState('eBay');

  const reset = () => {
    setType('sale');
    setDescription('');
    setAmountStr('');
    setPlatform('eBay');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAdd = () => {
    const raw = parseFloat(amountStr.replace(/[^0-9.]/g, ''));
    if (!description.trim() || isNaN(raw) || raw <= 0) return;
    const sign = TYPES.find((t) => t.key === type)?.sign ?? 1;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onAdd({
      type,
      description: description.trim(),
      amount: raw * sign,
      date: new Date().toISOString().split('T')[0],
      platform: type === 'sale' || type === 'fee' ? platform : undefined,
    });
    reset();
    onClose();
  };

  const isValid =
    description.trim().length > 0 &&
    parseFloat(amountStr.replace(/[^0-9.]/g, '')) > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />
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
          {/* Handle */}
          <View
            style={[styles.handle, { backgroundColor: colors.border }]}
          />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Add Entry
            </Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Type picker */}
          <View style={styles.typePicker}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[
                  styles.typeBtn,
                  {
                    backgroundColor:
                      type === t.key ? colors.teal : colors.muted,
                    borderColor:
                      type === t.key ? colors.teal : colors.border,
                  },
                ]}
                onPress={() => setType(t.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.typeBtnText,
                    {
                      color:
                        type === t.key
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Description
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.muted,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              placeholder="e.g. Vintage Camera"
              placeholderTextColor={colors.mutedForeground}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {/* Amount */}
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              Amount ($)
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.muted,
                  color: colors.foreground,
                  borderColor: colors.border,
                },
              ]}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              value={amountStr}
              onChangeText={setAmountStr}
            />
          </View>

          {/* Platform (sale/fee only) */}
          {(type === 'sale' || type === 'fee') && (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                Platform
              </Text>
              <View style={styles.platformRow}>
                {['eBay', 'Mercari', 'Other'].map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.platformBtn,
                      {
                        backgroundColor:
                          platform === p ? colors.teal + '33' : colors.muted,
                        borderColor:
                          platform === p ? colors.teal : colors.border,
                      },
                    ]}
                    onPress={() => setPlatform(p)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.platformBtnText,
                        {
                          color:
                            platform === p ? colors.teal : colors.mutedForeground,
                        },
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              {
                backgroundColor: isValid ? colors.teal : colors.muted,
              },
            ]}
            onPress={handleAdd}
            disabled={!isValid}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.submitText,
                {
                  color: isValid
                    ? colors.primaryForeground
                    : colors.mutedForeground,
                },
              ]}
            >
              Add Entry
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000088',
  },
  sheetWrapper: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  typePicker: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  typeBtnText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.3,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  platformRow: {
    flexDirection: 'row',
    gap: 8,
  },
  platformBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  platformBtnText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
});
