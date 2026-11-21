import { AxiosAdapter, AxiosError } from 'axios';
import {
  api, deleteDoctorDocument, deleteDoctorPhoto, getApiErrorMessage, getDoctorAvailability,
  saveDoctorAvailability, saveDoctorProfile, uploadDoctorDocument,
} from '../src/services/api';
import { documentFromPicker, photoFromAsset } from '../src/services/media';
import { useDoctorStore } from '../src/services/useDoctorStore';

const originalAdapter = api.defaults.adapter;
const profile = {
  fullName: 'Example Doctor', age: '34', gender: 'female' as const, photoUri: null,
  medicalCouncilRegNumber: 'DMC123', qualification: 'MBBS', specialization: 'General Physician',
};
const serverDoctor = {
  full_name: profile.fullName, age: 34, gender: profile.gender, photo_url: null,
  registration_number: profile.medicalCouncilRegNumber,
  qualification: profile.qualification, specialization: profile.specialization,
};
const response = (adapter: AxiosAdapter) => { api.defaults.adapter = adapter; };

beforeEach(() => {
  useDoctorStore.getState().logout();
  useDoctorStore.getState().setTokens('access', 'refresh');
});
afterEach(() => { api.defaults.adapter = originalAdapter; });

test('loads and saves all split windows using weekday identifiers, preserving closed days', async () => {
  const windows = [
    { start_time: '07:00', end_time: '10:00' },
    { start_time: '15:00', end_time: '17:00' },
    { start_time: '21:00', end_time: '23:00' },
  ];
  response(async (config) => {
    expect(config.url).toBe('/doctors/me/availability/');
    expect(config.headers.get('Authorization')).toBe('Bearer access');
    if (config.method === 'put') {
      const body = JSON.parse(config.data);
      expect(body.days[0]).toEqual({ weekday: 0, is_open: true, windows });
      expect(body.days[1]).toEqual({ weekday: 1, is_open: false, windows: [] });
    }
    return {
      data: { days: [{ weekday: 0, is_open: true, windows }, { weekday: 1, is_open: false }] },
      status: 200, statusText: '', headers: {}, config,
    };
  });
  const days = await getDoctorAvailability();
  expect(days).toHaveLength(7);
  expect(days[0].windows).toHaveLength(3);
  expect(days[1]).toEqual({ day: 'Tue', enabled: false, windows: [] });
  expect(await saveDoctorAvailability(days)).toEqual(days);
});

test('invalid availability is not submitted', async () => {
  const adapter = jest.fn();
  response(adapter);
  await expect(saveDoctorAvailability([{
    day: 'Mon', enabled: true, windows: [{ startTime: '09:00', endTime: '14:45' }],
  }])).rejects.toThrow('six hours');
  expect(adapter).not.toHaveBeenCalled();
});

test('uploads photo and document using their actual multipart field names and media types', async () => {
  const append = jest.spyOn(FormData.prototype, 'append').mockImplementation(() => {});
  const photo = photoFromAsset({ uri: 'file://photo.png', fileName: 'photo.png', type: 'image/png', fileSize: 1024 });
  const document = documentFromPicker({ uri: 'file://doc.pdf', name: 'doc.pdf', type: 'application/pdf', size: 2048 });
  response(async (config) => {
    expect(config.headers.get('Authorization')).toBe('Bearer access');
    if (config.url === '/doctors/me/') {
      return { data: serverDoctor, status: 200, statusText: '', headers: {}, config };
    }
    expect(config.data).toBeInstanceOf(FormData);
    if (config.url === '/doctors/me/photo/') {
      expect(config.method).toBe('put');
      expect(append).toHaveBeenCalledWith('photo', { uri: photo.uri, name: photo.name, type: 'image/png' });
      return { data: { photo_url: 'https://example.test/photo.png' }, status: 200, statusText: '', headers: {}, config };
    }
    expect(config.url).toBe('/doctors/me/documents/');
    expect(config.method).toBe('post');
    expect(append).toHaveBeenCalledWith('document_type', 'medical_registration');
    expect(append).toHaveBeenCalledWith('file', { uri: document.uri, name: document.name, type: 'application/pdf' });
    return { data: { id: 31, original_name: 'doc.pdf', uploaded_at: '2026-10-18' }, status: 201, statusText: '', headers: {}, config };
  });
  await saveDoctorProfile(profile, photo);
  expect(useDoctorStore.getState().profile.photoUri).toBe('https://example.test/photo.png');
  await expect(uploadDoctorDocument('Medical Council Registration Certificate', document))
    .resolves.toMatchObject({ id: '31', fileName: 'doc.pdf' });
  append.mockRestore();
});

test('deletes photos and documents only after successful server responses', async () => {
  useDoctorStore.getState().setProfile({ photoUri: 'https://example.test/photo.png' });
  response(async (config) => {
    expect(config.url).toBe('/doctors/me/photo/');
    throw new AxiosError('Not allowed', undefined, config);
  });
  await expect(deleteDoctorPhoto()).rejects.toThrow('Not allowed');
  expect(useDoctorStore.getState().profile.photoUri).not.toBeNull();
  const urls: string[] = [];
  response(async (config) => {
    urls.push(config.url ?? '');
    expect(config.method).toBe('delete');
    return { data: '', status: 204, statusText: '', headers: {}, config };
  });
  await deleteDoctorPhoto();
  await deleteDoctorDocument('31');
  expect(urls).toEqual(['/doctors/me/photo/', '/doctors/me/documents/31/']);
  expect(useDoctorStore.getState().profile.photoUri).toBeNull();
});

test('surfaces nested availability validation messages', () => {
  const error = {
    response: { data: { days: [{ windows: ['Windows must not overlap.'] }] } },
  };
  expect(getApiErrorMessage(error)).toBe('Windows must not overlap.');
});

test('enforces photo and document media types and size limits', () => {
  expect(() => photoFromAsset({ uri: 'file://a.jpg', fileName: 'a.jpg', type: 'image/jpeg', fileSize: 5 * 1024 * 1024 + 1 })).toThrow('5 MB');
  expect(() => photoFromAsset({ uri: 'file://a.heic', fileName: 'a.heic', type: 'image/heic' })).toThrow('JPG');
  expect(() => documentFromPicker({ uri: 'file://a.pdf', name: 'a.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 + 1 })).toThrow('10 MB');
  expect(documentFromPicker({ uri: 'file://a.png', name: 'a.png', type: null }).type).toBe('image/png');
  expect(() => documentFromPicker({ uri: 'file://a.webp', name: 'a.webp', type: 'image/webp' })).toThrow('PDF');
});
