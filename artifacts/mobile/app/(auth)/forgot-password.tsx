// app/(auth)/forgot-password.tsx
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { supabase } from '@/utils/supabase';
import { SquidIcon } from '@/components/SquidIcon';

type Stage = 'request' | 'reset';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleRequestCode = async () => {
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(`We sent a 8-digit code to ${email.trim()}.`);
    setStage('reset');
  };

  const handleResetPassword = async () => {
    if (!code.trim()) {
      setError('Enter the code from your email.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);

    // Verify the code — this signs the user in with a temporary recovery session
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'recovery',
    });
    if (verifyError) {
      setLoading(false);
      setError(verifyError.message);
      return;
    }

    // Now set the new password on that session
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Password updated — the auth listener in AppContext picks up the new
    // session automatically, and the root layout redirects into the app.
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 40 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.brand}>
        <SquidIcon size={40} color={colors.teal} />
        <Text style={[styles.brandName, { color: colors.foreground }]}>TaxSquid</Text>
      </View>

      {stage === 'request' ? (
        <>
          <Text style={[styles.title, { color: colors.foreground }]}>Reset your password</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enter your email and we'll send you a code
          </Text>

          <View style={styles.form}>
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Email"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: loading ? colors.muted : colors.teal }]}
              onPress={handleRequestCode}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Send Code</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.title, { color: colors.foreground }]}>Enter your code</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{notice}</Text>

          <View style={styles.form}>
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Code from your email"
                placeholderTextColor={colors.mutedForeground}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={8}
              />
            </View>
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="New password"
                placeholderTextColor={colors.mutedForeground}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="password-new"
              />
            </View>
            <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Confirm new password"
                placeholderTextColor={colors.mutedForeground}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
              />
            </View>

            {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: loading ? colors.muted : colors.teal }]}
              onPress={handleResetPassword}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Reset Password</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              onPress={handleRequestCode}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={[styles.switchText, { color: colors.teal, fontFamily: 'Inter_600SemiBold' }]}>
                Resend code
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <TouchableOpacity
        style={styles.switchLink}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Text style={[styles.switchText, { color: colors.mutedForeground }]}>Back to Sign In</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 40 },
  brandName: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 32 },
  form: { gap: 12 },
  inputWrap: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 50, justifyContent: 'center' },
  input: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: -2 },
  submitBtn: { borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  submitText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  switchLink: { alignItems: 'center', paddingVertical: 16 },
  switchText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});