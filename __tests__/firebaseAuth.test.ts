import { confirmPhoneOtp, MOCK_OTP, sendPhoneOtp, signOutFirebase } from '../src/services/firebaseAuth';

jest.mock('../src/services/api', () => ({ USE_MOCK_AUTH: true }));

beforeEach(async () => {
  await signOutFirebase();
});

test('demo phone sign-in accepts the documented OTP without Firebase', async () => {
  await expect(sendPhoneOtp('9876543210')).resolves.toBe(true);
  await expect(confirmPhoneOtp(MOCK_OTP)).resolves.toBe('mock-firebase-id-token');
});

test('demo phone sign-in rejects an incorrect OTP', async () => {
  await sendPhoneOtp('9876543210');
  await expect(confirmPhoneOtp('000000')).resolves.toBeNull();
  await expect(confirmPhoneOtp(MOCK_OTP)).resolves.toBe('mock-firebase-id-token');
});

test('demo phone sign-in rejects invalid phone numbers', async () => {
  await expect(sendPhoneOtp('123')).resolves.toBe(false);
  await expect(confirmPhoneOtp(MOCK_OTP)).resolves.toBeNull();
});
