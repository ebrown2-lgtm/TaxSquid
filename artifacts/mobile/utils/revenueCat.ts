import Purchases, { CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';

const REVENUECAT_API_KEY_IOS = 'appl_vLZVJecJlOmMImzecFZeqQqNjWQ'; // your real key from Project Settings > API keys

let configured = false;

/** Call once, as early as possible — before any other SDK call. */
export function configureRevenueCat() {
  if (configured || Platform.OS !== 'ios') return;
  Purchases.configure({ apiKey: REVENUECAT_API_KEY_IOS });
  configured = true;
}

/** Call once a Supabase session exists, to attach purchases to that user. */
export async function attachRevenueCatUser(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.warn('RevenueCat logIn failed', err);
  }
}

/** Call on sign-out, to detach and revert to an anonymous RevenueCat user. */
export async function detachRevenueCatUser(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    console.warn('RevenueCat logOut failed', err);
  }
}

export function hasPremiumEntitlement(info: CustomerInfo): boolean {
  return typeof info.entitlements.active['premium'] !== 'undefined';
}