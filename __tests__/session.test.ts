import { AxiosAdapter, AxiosError } from 'axios';
import * as Keychain from 'react-native-keychain';
import {
  api,
  loginDoctorWithFirebasePhone,
  logoutDoctor,
  refreshAccessToken,
  restoreDoctorSession,
  saveDoctorAvailability,
  saveDoctorProfile,
  setSessionExpiredHandler,
} from '../src/services/api';
import { defaultAvailability, useDoctorStore } from '../src/services/useDoctorStore';

const doctor = {
  full_name: 'Example Doctor',
  phone_number: '+919876543210',
  age: 34,
  gender: 'female',
  photo_url: null,
  registration_number: 'DMC123',
  qualification: 'MBBS',
  specialization: 'General Physician',
  speciality: null,
  documents: [{
    id: 31,
    document_type: 'medical_registration',
    document_type_label: 'Medical Council Registration',
    original_name: 'registration.pdf',
    uploaded_at: '2026-10-18T10:15:00+05:30',
  }],
  onboarding: { next_step: 'availability' },
};

let stored: string | null;
const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  stored = null;
  useDoctorStore.getState().logout();
  setSessionExpiredHandler(null);
  jest.mocked(Keychain.setGenericPassword).mockImplementation(async (_user, value) => {
    stored = value;
    return { service: 'session', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH };
  });
  jest.mocked(Keychain.getGenericPassword).mockImplementation(async () =>
    stored ? { username: 'doctor', password: stored, service: 'session', storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH } : false,
  );
  jest.mocked(Keychain.resetGenericPassword).mockImplementation(async () => {
    stored = null;
    return true;
  });
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.clearAllMocks();
});

const adapter = (handler: (url: string, body: any, authorization: string | undefined) => {
  status?: number;
  data?: any;
} | Promise<{ status?: number; data?: any }>): AxiosAdapter => async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  const response = await handler(config.url ?? '', body, config.headers.get('Authorization') as string | undefined);
  const result = {
    data: response.data,
    status: response.status ?? 200,
    statusText: '',
    headers: {},
    config,
  };
  if (result.status >= 400) {
    throw new AxiosError('Request failed', undefined, config, undefined, result);
  }
  return result;
};

test('exchanges the Firebase token, saves both tokens and uses the backend onboarding step', async () => {
  api.defaults.adapter = adapter((url, body, auth) => {
    expect(url).toBe('/auth/doctor/phone/firebase/');
    expect(body).toEqual({ id_token: 'firebase-token' });
    expect(auth).toBeUndefined();
    return { data: { access: 'access-1', refresh: 'refresh-1', doctor } };
  });
  await expect(loginDoctorWithFirebasePhone('firebase-token')).resolves.toMatchObject({
    nextStep: 'availability',
  });
  expect(JSON.parse(stored!)).toEqual({ access: 'access-1', refresh: 'refresh-1' });
  expect(useDoctorStore.getState()).toMatchObject({
    onboardingStep: 'availability',
    phone: doctor.phone_number,
    profile: { fullName: doctor.full_name },
    documents: [{ id: '31', label: 'Medical Council Registration Certificate' }],
  });
});

test('restores by rotating tokens and retrieving the current doctor', async () => {
  stored = JSON.stringify({ access: 'old-access', refresh: 'old-refresh' });
  api.defaults.adapter = adapter((url, body, auth) => {
    if (url === '/auth/doctor/token/refresh/') {
      expect(body).toEqual({ refresh: 'old-refresh' });
      expect(auth).toBeUndefined();
      return { data: { access: 'new-access', refresh: 'new-refresh' } };
    }
    expect(url).toBe('/doctors/me/');
    expect(auth).toBe('Bearer new-access');
    return { data: doctor };
  });
  await expect(restoreDoctorSession()).resolves.toBe('availability');
  expect(JSON.parse(stored!)).toEqual({ access: 'new-access', refresh: 'new-refresh' });
});

test('concurrent unauthorized requests share one refresh and retry with rotated tokens', async () => {
  useDoctorStore.getState().setTokens('old-access', 'old-refresh');
  let refreshes = 0;
  api.defaults.adapter = adapter(async (url, body, auth) => {
    if (url === '/auth/doctor/token/refresh/') {
      refreshes += 1;
      expect(body).toEqual({ refresh: 'old-refresh' });
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      return { data: { access: 'new-access', refresh: 'new-refresh' } };
    }
    return auth === 'Bearer new-access' ? { data: { ok: true } } : { status: 401 };
  });
  const results = await Promise.all([api.get('/first/'), api.get('/second/')]);
  expect(results.map((result) => result.data.ok)).toEqual([true, true]);
  expect(refreshes).toBe(1);
  expect(useDoctorStore.getState().refreshToken).toBe('new-refresh');
});

test('invalid refresh clears the session, while a network error retains it', async () => {
  useDoctorStore.getState().setTokens('access', 'refresh');
  stored = JSON.stringify({ access: 'access', refresh: 'refresh' });
  const expired = jest.fn();
  setSessionExpiredHandler(expired);
  api.defaults.adapter = adapter(() => ({ status: 401 }));
  await expect(refreshAccessToken()).rejects.toBeDefined();
  expect(stored).toBeNull();
  expect(useDoctorStore.getState().authToken).toBeNull();
  expect(expired).toHaveBeenCalledTimes(1);

  useDoctorStore.getState().setTokens('access', 'refresh');
  stored = JSON.stringify({ access: 'access', refresh: 'refresh' });
  api.defaults.adapter = async () => { throw new AxiosError('Network error'); };
  await expect(refreshAccessToken()).rejects.toThrow('Network error');
  expect(stored).not.toBeNull();
  expect(useDoctorStore.getState().refreshToken).toBe('refresh');
});

test('removes a registered device before logout, and retains tokens if logout fails', async () => {
  useDoctorStore.getState().setTokens('access', 'refresh');
  stored = JSON.stringify({ access: 'access', refresh: 'refresh' });
  const calls: string[] = [];
  api.defaults.adapter = adapter((url, body) => {
    calls.push(url);
    if (url.endsWith('remove/')) {
      expect(body).toEqual({ token: 'device-token' });
      return { status: 204 };
    }
    expect(body).toEqual({ refresh: 'refresh' });
    return { status: 400 };
  });
  await expect(logoutDoctor('device-token')).rejects.toBeDefined();
  expect(calls).toEqual(['/notifications/devices/remove/', '/auth/doctor/logout/']);
  expect(stored).not.toBeNull();
  api.defaults.adapter = adapter(() => ({ status: 204 }));
  await logoutDoctor();
  expect(stored).toBeNull();
  expect(useDoctorStore.getState().refreshToken).toBeNull();
});

test('logout retries with the newly rotated refresh token after an expired access token', async () => {
  useDoctorStore.getState().setTokens('old-access', 'old-refresh');
  const bodies: string[] = [];
  api.defaults.adapter = adapter((url, body, auth) => {
    if (url === '/auth/doctor/token/refresh/') {
      return { data: { access: 'new-access', refresh: 'new-refresh' } };
    }
    bodies.push(body.refresh);
    return { status: auth === 'Bearer new-access' ? 204 : 401 };
  });
  await logoutDoctor();
  expect(bodies).toEqual(['old-refresh', 'new-refresh']);
  expect(useDoctorStore.getState().refreshToken).toBeNull();
});

test('onboarding saves profile and weekly availability using doctor endpoints', async () => {
  const calls: Array<{ url: string; body: any }> = [];
  api.defaults.adapter = adapter((url, body) => {
    calls.push({ url, body });
    return { data: url === '/doctors/me/' && !body ? doctor :
      url === '/doctors/me/availability/' ? body : {} };
  });
  await saveDoctorProfile({
    fullName: 'Updated Doctor',
    age: '34',
    gender: 'female',
    photoUri: null,
    medicalCouncilRegNumber: 'DMC123',
    qualification: 'MBBS',
    specialization: 'General Physician',
  });
  await saveDoctorAvailability(defaultAvailability);
  expect(calls[1]).toEqual({ url: '/doctors/me/', body: { full_name: 'Updated Doctor' } });
  expect(calls[2].url).toBe('/doctors/me/availability/');
  expect(calls[2].body.days[0]).toEqual({
    weekday: 0,
    is_open: true,
    windows: [{ start_time: '09:00', end_time: '17:00' }],
  });
  expect(calls[2].body.days).toHaveLength(7);
});
