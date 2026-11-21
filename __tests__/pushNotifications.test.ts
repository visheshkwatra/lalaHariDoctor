import { getToken, onTokenRefresh } from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { api } from '../src/services/api';
import { getPushTokenForLogout, startPushNotifications } from '../src/services/pushNotifications';

afterEach(() => jest.restoreAllMocks());

test('registers refreshed device tokens before logout removes the latest token', async () => {
  let refresh: ((value: string) => void) | undefined;
  jest.mocked(onTokenRefresh).mockImplementation((_messaging, handler) => {
    refresh = handler;
    return jest.fn();
  });
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const post = jest.spyOn(api, 'post').mockImplementation(async () => { await pending; return {}; });
  startPushNotifications();
  refresh!('new-token');
  await Promise.resolve();
  const token = getPushTokenForLogout();
  finish();
  await expect(token).resolves.toBe('new-token');
  expect(post).toHaveBeenCalledWith('/notifications/devices/', { token: 'new-token', platform: Platform.OS });
});

test('retrieves the existing device token on logout when it has not yet registered this session', async () => {
  jest.mocked(getToken).mockResolvedValue('existing-token');
  await expect(getPushTokenForLogout()).resolves.toBe('existing-token');
});
