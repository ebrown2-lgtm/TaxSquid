/**
 * API base URL for the TaxSquid backend.
 *
 * In development, EXPO_PUBLIC_DOMAIN is set to $REPLIT_DEV_DOMAIN by the
 * Expo workflow so requests from the app reach the correct Replit proxy path.
 * The API artifact is mounted at /api on that domain.
 */
const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';

export const API_BASE = domain
  ? `https://${domain}/api`
  : '/api'; // web fallback
