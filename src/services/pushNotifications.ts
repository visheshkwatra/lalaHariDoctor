import { PermissionsAndroid, Platform } from 'react-native';
import {
  AuthorizationStatus, getMessaging, getToken, onMessage, onTokenRefresh,
  registerDeviceForRemoteMessages, requestPermission,
} from '@react-native-firebase/messaging';
import { api, getApiErrorMessage, getUnreadNotificationCount } from './api';
import { useDoctorStore } from './useDoctorStore';
import { showToast } from './toast';

let generation = 0;
let token: string | null = null;
let pending: Promise<void> = Promise.resolve();
let unsubscribe: Array<() => void> = [];

export const startPushNotifications = (): void => {
  const session = ++generation;
  const messaging = getMessaging();
  const register = (value: string) => {
    pending = pending.then(async () => {
      if (session !== generation) { return; }
      token = value;
      await api.post('/notifications/devices/', { token: value, platform: Platform.OS });
    }).catch(() => {
      showToast('Push registration failed. Check your connection and sign in again to retry.');
    });
  };
  unsubscribe = [
    onTokenRefresh(messaging, register),
    onMessage(messaging, async () => {
      try {
        const count = await getUnreadNotificationCount();
        if (session === generation) {
          useDoctorStore.getState().setUnreadCount(count);
          showToast('You have a new notification.');
        }
      } catch (failure) { showToast(getApiErrorMessage(failure)); }
    }),
  ];
  (async () => {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Notification permission was denied. Enable it in device settings.');
      }
    }
    if (Platform.OS === 'ios') {
      const permission = await requestPermission(messaging);
      if (permission !== AuthorizationStatus.AUTHORIZED && permission !== AuthorizationStatus.PROVISIONAL) {
        throw new Error('Notification permission was denied. Enable it in device settings.');
      }
      await registerDeviceForRemoteMessages(messaging);
    }
    const value = await getToken(messaging);
    if (session === generation) { register(value); }
  })().catch((failure) => {
    if (session === generation) { showToast(`Push setup failed: ${getApiErrorMessage(failure)}`); }
  });
};

export const stopPushNotifications = async (): Promise<string | null> => {
  generation += 1;
  unsubscribe.forEach((remove) => remove());
  unsubscribe = [];
  await pending;
  const current = token;
  token = null;
  return current;
};

export const getPushTokenForLogout = async (): Promise<string> => {
  const registered = await stopPushNotifications();
  return registered ?? getToken(getMessaging());
};
