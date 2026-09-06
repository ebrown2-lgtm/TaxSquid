// app/(auth)/sign-in.tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/utils/supabase";
import { SquidIcon } from "@/components/SquidIcon";
import { signInWithGoogle } from "@/utils/googleAuth";
import { signInWithFacebook } from '@/utils/facebookAuth';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signInWithApple } from '@/utils/appleAuth';
import { Feather } from "@expo/vector-icons";

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
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
  
  const handleFacebookSignIn = async () => {
    setError('');
    setFacebookLoading(true);
    const { error } = await signInWithFacebook();
    setFacebookLoading(false);
    if (error) setError(error);
  };
  
  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    }
    // On success, the auth listener in AppContext updates session automatically —
    // the root layout redirects into the app once session is set.
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top + 40 },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.brand}>
        <SquidIcon size={40} color={colors.teal} />
        <Text style={[styles.brandName, { color: colors.foreground }]}>
          TaxSquid
        </Text>
      </View>

      <Text style={[styles.title, { color: colors.foreground }]}>
        Welcome back!
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Sign in to access your tax data
      </Text>

      <View style={styles.form}>
        <View
          style={[
            styles.inputWrap,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
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
        <View
          style={[
            styles.inputWrap,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="Password"
            placeholderTextColor={colors.mutedForeground}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />
        </View>

        <TouchableOpacity
          onPress={() => router.push("/(auth)/forgot-password")}
          style={styles.forgotLink}
          activeOpacity={0.7}
        >
          <Text style={[styles.forgotText, { color: colors.mutedForeground }]}>
            Forgot password?
          </Text>
        </TouchableOpacity>

        {!!error && (
          <Text style={[styles.error, { color: colors.destructive }]}>
            {error}
          </Text>
        )}

        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: loading ? colors.muted : colors.teal },
          ]}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text
              style={[styles.submitText, { color: colors.primaryForeground }]}
            >
              Sign In
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View
            style={[styles.dividerLine, { backgroundColor: colors.border }]}
          />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
            or
          </Text>
          <View
            style={[styles.dividerLine, { backgroundColor: colors.border }]}
          />
        </View>

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
        
        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={14}
            style={{ height: 45, width: '100%', marginTop: 0 }}
            onPress={handleAppleSignIn}
          />
        )}
        
        <TouchableOpacity
          style={[
            styles.googleBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={handleGoogleSignIn}
          disabled={googleLoading}
          activeOpacity={0.85}
        >
          {googleLoading ? (
            <ActivityIndicator size="small" color={colors.foreground} />
          ) : (
            <>
              <Feather name="chrome" size={18} color={colors.foreground} />
              <Text
                style={[styles.googleBtnText, { color: colors.foreground }]}
              >
                Continue with Google
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchLink}
          onPress={() => router.push("/(auth)/sign-up")}
          activeOpacity={0.7}
        >
          <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
            Don't have an account?{" "}
            <Text
              style={{ color: colors.teal, fontFamily: "Inter_600SemiBold" }}
            >
              Sign Up
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 40,
  },
  brandName: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 6 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 32 },
  form: { gap: 12 },
  inputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
    justifyContent: "center",
  },
  input: { fontSize: 15, fontFamily: "Inter_400Regular" },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: -2 },
  submitBtn: {
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  switchLink: { alignItems: "center", paddingVertical: 16 },
  switchText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  forgotLink: { alignSelf: "flex-end", paddingVertical: 2 },
  forgotText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 6,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    height: 52,
    borderWidth: 1,
  },
  googleBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  
  facebookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 14, height: 52, marginTop: 10,
  },
  facebookBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
});
