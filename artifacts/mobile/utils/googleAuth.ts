// utils/googleAuth.ts
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('auth-callback');
  console.log('REDIRECT URL:', redirectTo); // ← temporary, remove after debugging

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return { error: error?.message ?? 'Could not start Google sign-in.' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !result.url) {
    return { error: 'Sign-in was cancelled.' };
  }

  // Tokens come back in the URL fragment (#access_token=...&refresh_token=...)
  const hash = result.url.split('#')[1];
  if (!hash) {
    return { error: 'No session returned from Google.' };
  }
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');

  if (!access_token || !refresh_token) {
    return { error: 'Incomplete session returned from Google.' };
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (sessionError) {
    return { error: sessionError.message };
  }

  // Success — AppContext's auth listener picks up the new session automatically
  return { error: null };
}