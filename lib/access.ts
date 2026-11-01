import { Platform } from 'react-native';

// "No end date" is stored as a far-future expiry, so every access check that
// compares expires_at with now keeps working unchanged.
export const UNLIMITED_EXPIRY = '2999-12-31T23:59:59Z';

export const isUnlimited = (expiresAt: string | Date) =>
  new Date(expiresAt).getFullYear() >= 2900;

// Google Play forbids steering users from the app to a payment outside Play
// Billing. The store build therefore shows only what the user can open, with
// no locks and no "contact Idit for access". The web build is not bound by it.
export const SHOW_LOCKED = Platform.OS === 'web';
