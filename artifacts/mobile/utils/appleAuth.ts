// utils/appleAuth.ts
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

export async function signInWithApple(): Promise<{ error: string | null }> {
  try {
    // Apple requires a nonce round-trip: we hash it before sending to Apple,
    // and send the raw version to Supabase so it can verify the identity
    // token was genuinely issued for this exact sign-in attempt.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { error: 'No identity token returned from Apple.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (err: any) {
    if (err.code === 'ERR_REQUEST_CANCELED') {
      return { error: null }; // user cancelled — not a real error
    }
    return { error: err?.message ?? 'Apple sign-in failed.' };
  }
}