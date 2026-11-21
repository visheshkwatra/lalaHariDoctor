/* Jest mocks for native modules used by the app. */
/* eslint-env jest */

jest.mock('@100mslive/react-native-hms', () => ({
  HMSSDK: { build: jest.fn() },
  HMSConfig: jest.fn(),
  HMSUpdateListenerActions: {
    ON_JOIN: 'ON_JOIN', ON_TRACK_UPDATE: 'ON_TRACK_UPDATE', ON_PEER_UPDATE: 'ON_PEER_UPDATE',
    RECONNECTING: 'RECONNECTING', RECONNECTED: 'RECONNECTED',
    ON_ERROR: 'ON_ERROR', ON_REMOVED_FROM_ROOM: 'ON_REMOVED_FROM_ROOM',
  },
  HMSPeerUpdate: {},
  HMSTrackUpdate: {},
  HMSTrackType: {},
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  signInWithPhoneNumber: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn().mockResolvedValue('test-device-token'),
  onTokenRefresh: jest.fn(() => jest.fn()),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  getInitialNotification: jest.fn().mockResolvedValue(null),
  registerDeviceForRemoteMessages: jest.fn().mockResolvedValue(undefined),
  requestPermission: jest.fn().mockResolvedValue(1),
}));

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' },
  STORAGE_TYPE: { AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth' },
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}));

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: { pdf: 'pdf', images: 'images' },
  isErrorWithCode: jest.fn(() => false),
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
}));
