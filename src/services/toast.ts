import { Alert, Platform, ToastAndroid } from 'react-native';

/**
 * Show a lightweight toast message.
 * Android: native ToastAndroid. iOS/other: falls back to an Alert.
 */
export const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.showWithGravity(message, ToastAndroid.LONG, ToastAndroid.BOTTOM);
  } else {
    Alert.alert('Notice', message);
  }
};

/** Log to console and surface the API error as a toast. */
export const toastApiError = (context: string, message: string) => {
  console.warn(`${context}: ${message}`);
  showToast(message);
};
