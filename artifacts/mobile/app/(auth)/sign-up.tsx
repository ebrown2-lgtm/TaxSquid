// app/(auth)/sign-up.tsx
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
import { signInWithFacebook } from '@/utils/facebookAuth';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple } from '@/utils/appleAuth';

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkEmailNotice, setCheckEmailNotice] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);

  const handleFacebookSignIn = async () => {
    setError('');
    setFacebookLoading(true);
    const { error } = await signInWithFacebook();
    setFacebookLoading(false);
    if (error) setError(error);
  };
  
  const [appleLoading, setAppleLoading] = useState(false);

  const handleAppleSignIn = async () => {
    setError('');
    setAppleLoading(true);
    const { error } = await signInWithApple();
    setAppleLoading(false);
    if (error) setError(error);
  };
  
  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    const { error, data } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Supabase sends a confirmation email by default — show a notice
    // rather than assuming the user is immediately signed in.
    if (data.session === null) {
      setCheckEmailNotice(true);
    }
  };

  if (checkEmailNotice) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: colors.background }]}>
        <SquidIcon size={40} color={colors.teal} />
        <Text style={[styles.title, { color: colors.foreground, marginTop: 20, textAlign: 'center' }]}>
          Check your email
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, textAlign: 'center' }]}>
          We sent a confirmation link to {email}. Tap it to activate your account, then sign in.
        </Text>
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.teal, marginTop: 24, width: '100%' }]}
          onPress={() => router.replace('/(auth)/sign-in')}
          activeOpacity={0.85}
        >
          <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Back to Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.facebookBtn, { backgroundColor: '#1877F2' }]}
          onPress={handleFacebookSignIn}
          disabled={facebookLoading}
          activeOpacity={0.85}
        >
          {facebookLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Feather name="facebook" size={18} color="#FFFFFF" />
              <Text style={styles.facebookBtnText}>Continue with Facebook</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

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

      <Text style={[styles.title, { color: colors.foreground }]}>Create your account</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Track your reselling income and taxes in one place
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
        <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Password"
            placeholderTextColor={colors.mutedForeground}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
          />
        </View>
        <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Confirm Password"
            placeholderTextColor={colors.mutedForeground}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="password-new"
          />
        </View>

        {!!error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: loading ? colors.muted : colors.teal }]}
          onPress={handleSignUp}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Sign Up</Text>
          )}
        </TouchableOpacity>
    {Platform.OS === 'ios' && (
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={14}
        style={{ height: 52, width: '100%', marginTop: 10 }}
        onPress={handleAppleSignIn}
      />
    )}
    <TouchableOpacity
          style={styles.switchLink}
          onPress={() => router.push('/(auth)/sign-in')}
          activeOpacity={0.7}
        >
          <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
            Already have an account? <Text style={{ color: colors.teal, fontFamily: 'Inter_600SemiBold' }}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  centered: { alignItems: 'center', justifyContent: 'center' },
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

  facebookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 14, height: 52, marginTop: 10,
  },
  facebookBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
});