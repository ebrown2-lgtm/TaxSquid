// app/settings/delete-account.tsx
import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { deleteAccount } from '@/utils/accountService';

export default function DeleteAccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useApp();

  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    setError('');
    setDeleting(true);
    const { error } = await deleteAccount();
    if (error) {
      setDeleting(false);
      setError(error);
      return;
    }
    // Account and all data are gone server-side — sign out locally to
    // clear the (now invalid) session and let the root layout redirect
    // to Sign In automatically.
    await signOut();
  };

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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Delete Account</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.warningCard, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive + '40' }]}>
          <Feather name="alert-triangle" size={22} color={colors.destructive} />
          <Text style={[styles.warningTitle, { color: colors.destructive }]}>This cannot be undone</Text>
          <Text style={[styles.warningBody, { color: colors.foreground }]}>
            Deleting your account permanently removes:
          </Text>
          <View style={styles.list}>
            {[
              'All Ledger transactions',
              'All mileage/drive records',
              'All inventory items',
              'Your eBay connection and synced data',
              'Your tax settings and mileage rate preferences',
            ].map((item) => (
              <View key={item} style={styles.listRow}>
                <Feather name="x" size={13} color={colors.destructive} />
                <Text style={[styles.listText, { color: colors.mutedForeground }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={[styles.instructionLabel, { color: colors.mutedForeground }]}>
          Type DELETE below to confirm
        </Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="DELETE"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>

        {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

        <TouchableOpacity
          style={[
            styles.deleteBtn,
            { backgroundColor: canDelete ? colors.destructive : colors.muted, opacity: canDelete ? 1 : 0.6 },
          ]}
          onPress={handleDelete}
          disabled={!canDelete || deleting}
          activeOpacity={0.85}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.deleteBtnText, { color: canDelete ? '#FFFFFF' : colors.mutedForeground }]}>
              Permanently Delete My Account
            </Text>
          )}
        </TouchableOpacity>
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
  content: { padding: 16, gap: 16 },
  warningCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  warningTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  warningBody: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  list: { gap: 6, marginTop: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  instructionLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 4 },
  inputWrap: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 50, justifyContent: 'center' },
  input: { fontSize: 15, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  deleteBtn: { borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  deleteBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});