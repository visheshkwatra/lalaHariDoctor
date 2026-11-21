/**
 * Firebase Phone Authentication service for doctors.
 *
 * Requires google-services.json (Android) / GoogleService-Info.plist (iOS)
 * for the com.lalaharidoctor app, with Phone sign-in enabled in the
 * Firebase console.
 *
 * Flow: sendPhoneOtp() -> user enters OTP -> confirmPhoneOtp() returns a
 * Firebase ID token, which is exchanged with the backend for app tokens.
 */

import {
  getAuth,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';
import { USE_MOCK_AUTH } from './api';

let lastSendError: string | null = null;
let lastInitError: string | null = null;
let confirmation: any = null;
let mockOtpRequested = false;

export const MOCK_OTP = '123456';

/** Returns true if Firebase Auth can initialize. */
export const isFirebaseAuthAvailable = (): boolean => {
  try {
    return Boolean(getAuth());
  } catch (error: unknown) {
    lastInitError = error instanceof Error ? error.message : String(error);
    return false;
  }
};

/** Returns the most recent OTP error. */
export const getLastFirebaseSendError = (): string | null => lastSendError;

/**
 * Format a phone number as E.164.
 * A 10-digit number defaults to India (+91).
 */
export const toE164 = (phone: string): string => {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  return `+${digits}`;
};

/** Sends an OTP through Firebase Phone Authentication. */
export const sendPhoneOtp = async (phone: string): Promise<boolean> => {
  lastSendError = null;
  confirmation = null;

  const formattedPhone = toE164(phone);
  if (!/^\+[1-9]\d{7,14}$/.test(formattedPhone)) {
    lastSendError = 'INVALID_PHONE_NUMBER';
    console.error('[Firebase] Invalid E.164 phone number format.');
    return false;
  }

  if (USE_MOCK_AUTH) {
    mockOtpRequested = true;
    console.log('[Auth] MOCK mode: demo OTP is ready.');
    return true;
  }

  console.log('[Firebase] Starting OTP request.');

  if (!isFirebaseAuthAvailable()) {
    lastSendError = lastInitError ?? 'FIREBASE_AUTH_UNAVAILABLE';
    console.error('[Firebase] OTP request stopped:', lastSendError);
    return false;
  }

  try {
    console.log('[Firebase] Requesting OTP for phone ending:', formattedPhone.slice(-4));
    confirmation = await signInWithPhoneNumber(getAuth(), formattedPhone);
    if (!confirmation) {
      lastSendError = 'FIREBASE_CONFIRMATION_MISSING';
      console.error('[Firebase] Firebase returned no confirmation object.');
      return false;
    }
    console.log('[Firebase] OTP request initiated successfully.');
    return true;
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    lastSendError =
      [err?.code, err?.message].filter(Boolean).join(': ') || 'FIREBASE_SEND_FAILED';
    confirmation = null;
    console.error('[Firebase] OTP request failed:', lastSendError, err?.message ?? error);
    return false;
  }
};

/**
 * Confirms the OTP.
 * Returns the Firebase ID token on success, or null on failure.
 */
export const confirmPhoneOtp = async (code: string): Promise<string | null> => {
  if (USE_MOCK_AUTH) {
    if (!mockOtpRequested) {
      lastSendError = 'NO_OTP_REQUEST';
      return null;
    }
    if (code !== MOCK_OTP) {
      lastSendError = 'INVALID_DEMO_OTP';
      return null;
    }
    mockOtpRequested = false;
    lastSendError = null;
    return 'mock-firebase-id-token';
  }

  if (!confirmation) {
    lastSendError = 'NO_OTP_CONFIRMATION';
    console.error('[Firebase] Cannot verify OTP: no confirmation object. Request an OTP first.');
    return null;
  }

  try {
    const result = await confirmation.confirm(code);
    const token = await result?.user?.getIdToken(true);

    if (!token) {
      lastSendError = 'FIREBASE_ID_TOKEN_MISSING';
      console.error('[Firebase] Verification returned no ID token.');
      return null;
    }

    confirmation = null;
    lastSendError = null;
    console.log('[Firebase] OTP verification successful.');
    return token;
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    lastSendError =
      [err?.code, err?.message].filter(Boolean).join(': ') || 'FIREBASE_VERIFY_FAILED';
    console.error('[Firebase] OTP verification failed:', lastSendError, err?.message ?? error);
    return null;
  }
};

/** Signs out the current Firebase user. */
export const signOutFirebase = async (): Promise<void> => {
  mockOtpRequested = false;
  if (!isFirebaseAuthAvailable()) {
    console.warn('[Firebase] Sign-out skipped: Auth unavailable.');
    return;
  }
  try {
    await firebaseSignOut(getAuth());
    confirmation = null;
    lastSendError = null;
    console.log('[Firebase] Sign-out successful.');
  } catch (error: unknown) {
    console.error('[Firebase] Doctor sign-out failed:', error);
  }
};
