import React, { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';

export default function MileageRateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    mileageRateMode,
    customMileageRate,
    irsStandardMileageRate,
    setMileageRateMode,
    setCustomMileageRate,
  } = useApp();

  const [customStr, setCustomStr] = useState(String(customMileageRate));

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const isIrs = mileageRateMode === 'irs';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn} activeOpacity={0.75}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Mileage Rate</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RATE SOURCE</Text>

        <TouchableOpacity
          style={[
            styles.option,
            {
              backgroundColor: colors.card,
              borderColor: isIrs ? colors.teal : colors.border,
              borderWidth: isIrs ? 1.5 : 1,
            },
          ]}
          onPress={() => setMileageRateMode('irs')}
          activeOpacity={0.8}
        >
          <View style={styles.optionLeft}>
            <Text style={[styles.optionTitle, { color: colors.foreground }]}>IRS Standard Rate</Text>
            <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>
              ${irsStandardMileageRate.toFixed(2)}/mile — current federal rate
            </Text>
          </View>
          {isIrs && <Feather name="check-circle" size={20} color={colors.teal} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.option,
            {
              backgroundColor: colors.card,
              borderColor: !isIrs ? colors.teal : colors.border,
              borderWidth: !isIrs ? 1.5 : 1,
            },
          ]}
          onPress={() => setMileageRateMode('custom')}
          activeOpacity={0.8}
        >
          <View style={styles.optionLeft}>
            <Text style={[styles.optionTitle, { color: colors.foreground }]}>Custom Rate</Text>
            <Text style={[styles.optionSub, { color: colors.mutedForeground }]}>
              Enter your own rate — useful for local rules that differ from the federal rate
            </Text>
          </View>
          {!isIrs && <Feather name="check-circle" size={20} color={colors.teal} />}
        </TouchableOpacity>

        {!isIrs && (
          <View style={[styles.inputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Custom rate per mile</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.dollarSign, { color: colors.foreground }]}>$</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                value={customStr}
                onChangeText={(t) => {
                  setCustomStr(t);
                  const n = parseFloat(t);
                  if (!isNaN(n) && n >= 0) setCustomMileageRate(n);
                }}
                keyboardType="decimal-pad"
                placeholder="0.70"
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={[styles.perMile, { color: colors.mutedForeground }]}>/mile</Text>
            </View>
          </View>
        )}

        <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
          This rate is used to calculate your mileage write-off across Mileage, Ledger, and Tax Hub.
          The IRS standard mileage rate is updated periodically — check irs.gov for the current rate
          before filing if you're unsure.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 32, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 2 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 14, padding: 14, gap: 10,
  },
  optionLeft: { flex: 1, gap: 3 },
  optionTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  optionSub: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  inputCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8, marginTop: 4 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, height: 44, gap: 4,
  },
  dollarSign: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  perMile: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  footnote: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, marginTop: 8, paddingHorizontal: 2 },
});