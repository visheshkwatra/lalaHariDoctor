import { api, getAppointmentsForDate, indiaDate } from '../src/services/api';
import { getVideoCallStatus, joinVideoAppointment, updateVideoCall } from '../src/services/videoCall';
import { appointmentDayRange } from '../src/services/appointmentTime';

afterEach(() => jest.restoreAllMocks());

const credentials = {
  provider: '100ms', appointment_id: 18, room_id: 'room', role: 'doctor',
  user_id: 'user', auth_token: 'test-token', expires_in: 300,
  expires_at: '2099-01-01T00:00:00Z', call_id: 5, mode: 'video',
};

test('joins using the authenticated API and rejects invalid or expired credentials', async () => {
  const post = jest.spyOn(api, 'post').mockResolvedValue({ data: credentials });
  await expect(joinVideoAppointment('18')).resolves.toEqual(credentials);
  expect(post).toHaveBeenCalledWith('/doctors/me/appointments/18/video/join/', {});
  await expect(joinVideoAppointment('mock-18')).rejects.toThrow(/real appointments/i);
  post.mockResolvedValueOnce({ data: { ...credentials, expires_at: '2000-01-01T00:00:00Z' } });
  await expect(joinVideoAppointment('18')).rejects.toThrow(/invalid or expired/i);
  post.mockResolvedValueOnce({ data: { ...credentials, call_id: 0 } });
  await expect(joinVideoAppointment('18')).rejects.toThrow(/invalid or expired/i);
});

test('retrieves existing call status and sends lifecycle updates to the call endpoint', async () => {
  const get = jest.spyOn(api, 'get').mockResolvedValue({ data: { calls: [{ id: 5, status: 'in_progress' }] } });
  const patch = jest.spyOn(api, 'patch').mockResolvedValue({});
  await expect(getVideoCallStatus('18', 5)).resolves.toBe('in_progress');
  expect(get).toHaveBeenCalledWith('/doctors/me/appointments/18/');
  await updateVideoCall('18', 5, { status: 'completed', ended_at: '2026-01-01T00:00:00Z' });
  expect(patch).toHaveBeenCalledWith('/doctors/me/appointments/18/calls/5/', {
    status: 'completed', ended_at: '2026-01-01T00:00:00Z',
  });
  get.mockResolvedValueOnce({ data: { calls: [{ id: 5, status: 'completed' }] } });
  await expect(getVideoCallStatus('18', 5)).rejects.toThrow(/no longer available/i);
});

test('maps schedule using India time and preserves server join eligibility', async () => {
  jest.spyOn(api, 'get').mockResolvedValue({ data: [{
    id: 18, appointment_number: 'A18', patient_name: 'Patient',
    starts_at: '2026-10-17T19:00:00Z', ends_at: '2026-10-17T19:30:00Z',
    mode: 'video', status: 'confirmed', can_join: false,
  }] });
  expect(indiaDate('2026-10-17T19:00:00Z')).toBe('2026-10-18');
  const items = await getAppointmentsForDate('2026-10-18');
  expect(api.get).toHaveBeenCalledWith('/doctors/me/schedule/', { params: { date: '2026-10-17' } });
  expect(items[0]).toMatchObject({
    source: 'live', canJoin: false, date: '2026-10-18', startTime: '00:30',
    patient: { age: null },
  });
});

test('includes and clips an overnight appointment from the previous day without duplication', async () => {
  const overnight = {
    id: 21, appointment_number: 'A21', patient_name: 'Patient',
    starts_at: '2026-10-17T17:45:00Z', ends_at: '2026-10-17T18:45:00Z',
    mode: 'video', status: 'confirmed', can_join: true,
  };
  jest.spyOn(api, 'get').mockResolvedValue({ data: [overnight] });
  const items = await getAppointmentsForDate('2026-10-18');
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ date: '2026-10-17', startTime: '23:15', endTime: '00:15', canJoin: true });
  expect(appointmentDayRange(items[0], '2026-10-17')).toEqual({ start: 1395, end: 1440 });
  expect(appointmentDayRange(items[0], '2026-10-18')).toEqual({ start: 0, end: 15 });
});
