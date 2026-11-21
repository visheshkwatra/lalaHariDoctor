import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as Keychain from 'react-native-keychain';
import {
  useDoctorStore,
  Appointment,
  AppNotification,
  DayAvailability,
  DoctorDocument,
  DoctorProfile,
  OnboardingStep,
} from './useDoctorStore';
import { generateMockAppointments } from './mockData';
import { EarningsPeriod } from './earnings';
import { LiveEarnings, validateLiveEarnings } from './liveEarnings';
import { validateAvailability, WEEKDAYS } from './availability';
import { UploadFile, validateUpload } from './media';
import { appointmentDayRange, shiftDate } from './appointmentTime';

export const API_BASE_URL = 'https://api.lalaharihealth.com/api/v1';

export const USE_MOCK_AUTH = false;
export const USE_MOCK_APPOINTMENTS = false;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

const DOCTOR_AUTH_ENDPOINTS = [
  '/auth/doctor/phone/firebase/',
  '/auth/doctor/token/refresh/',
];

const isDoctorAuthEndpoint = (url?: string) =>
  Boolean(url) && DOCTOR_AUTH_ENDPOINTS.some((path) => url!.endsWith(path));

api.interceptors.request.use((config) => {
  const token = useDoctorStore.getState().authToken;

  if (token && !isDoctorAuthEndpoint(config.url)) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }

  return config;
});

/** Extract a human-readable message from an axios error. */
const firstErrorMessage = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstErrorMessage(item);
      if (message) { return message; }
    }
  } else if (value && typeof value === 'object') {
    const fields = value as Record<string, unknown>;
    for (const item of [fields.detail, fields.message, ...Object.values(fields)]) {
      const message = firstErrorMessage(item);
      if (message) { return message; }
    }
  }
  return null;
};

export const getApiErrorMessage = (error: unknown): string => {
  const err = error as AxiosError<unknown>;
  const data = err?.response?.data;
  const message = firstErrorMessage(data);
  if (message) {
    return message;
  }
  if (err?.message) {
    return err.message;
  }
  return 'Something went wrong. Please try again.';
};

const mockDelay = (ms = 400) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface DoctorAuthResult {
  accessToken: string;
  refreshToken: string;
  nextStep: OnboardingStep;
}

interface DoctorResponse {
  full_name: string;
  phone_number: string;
  age: number | null;
  gender: 'male' | 'female' | 'other' | '';
  photo_url: string | null;
  registration_number: string | null;
  qualification: string;
  specialization: string;
  speciality: { id: number; name: string } | null;
  documents: Array<{
    id: number;
    document_type: string;
    document_type_label: string;
    original_name: string;
    uploaded_at: string;
  }>;
  onboarding: { next_step: OnboardingStep };
}

interface TokenPair {
  access: string;
  refresh: string;
}

const KEYCHAIN_SERVICE = 'com.lalaharidoctor.session';
let refreshInFlight: Promise<string> | null = null;
let sessionGeneration = 0;
let sessionExpiredHandler: (() => void) | null = null;

export const setSessionExpiredHandler = (handler: (() => void) | null): void => {
  sessionExpiredHandler = handler;
};

const validateTokens = (tokens: TokenPair): TokenPair => {
  if (typeof tokens?.access !== 'string' || !tokens.access.trim() ||
      typeof tokens?.refresh !== 'string' || !tokens.refresh.trim()) {
    throw new Error('The server did not return valid access and refresh tokens.');
  }
  return tokens;
};

const saveTokens = async (tokens: TokenPair, generation: number): Promise<void> => {
  validateTokens(tokens);
  if (generation !== sessionGeneration) {
    throw new Error('The session changed while authentication was in progress.');
  }
  const saved = await Keychain.setGenericPassword('doctor', JSON.stringify({
    access: tokens.access,
    refresh: tokens.refresh,
  }), {
    service: KEYCHAIN_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (!saved) {
    throw new Error('Could not securely save the session.');
  }
  if (generation !== sessionGeneration) {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
    throw new Error('The session changed while authentication was in progress.');
  }
  useDoctorStore.getState().setTokens(tokens.access, tokens.refresh);
};

const clearSession = async (): Promise<void> => {
  sessionGeneration += 1;
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
  useDoctorStore.getState().logout();
};

const applyDoctor = (doctor: DoctorResponse): OnboardingStep => {
  const step = doctor?.onboarding?.next_step;
  if (!['profile', 'availability', 'done'].includes(step) || !Array.isArray(doctor.documents)) {
    throw new Error('The server returned an invalid doctor profile.');
  }
  const store = useDoctorStore.getState();
  store.setPhone(doctor.phone_number);
  store.setProfile({
    fullName: doctor.full_name,
    age: doctor.age == null ? '' : String(doctor.age),
    gender: doctor.gender,
    photoUri: doctor.photo_url,
    medicalCouncilRegNumber: doctor.registration_number ?? '',
    qualification: doctor.qualification,
    specialization: doctor.specialization,
  });
  const documentLabels: Record<string, string> = {
    medical_registration: 'Medical Council Registration Certificate',
    degree_certificate: 'Qualification Degree',
    government_id: 'Government ID Proof',
    other: 'Other',
  };
  store.setDocuments(doctor.documents.map((document) => ({
    id: String(document.id),
    label: documentLabels[document.document_type] ?? document.document_type_label,
    fileName: document.original_name,
    uploadedAt: document.uploaded_at,
  })));
  store.setOnboardingStep(step);
  return step;
};

/**
 * Exchanges a Firebase phone ID token for app access/refresh tokens.
 * Live endpoint: POST /auth/doctor/phone/firebase/  { id_token }
 */
export const loginDoctorWithFirebasePhone = async (
  idToken: string,
): Promise<DoctorAuthResult> => {
  if (!idToken) {
    throw new Error('Firebase did not provide an ID token.');
  }

  if (USE_MOCK_AUTH) {
    console.log('[API] MOCK mode: exchanging Firebase ID token locally (no backend call).');
    await mockDelay();
    const result: DoctorAuthResult = {
      accessToken: `mock-access-${Date.now()}`,
      refreshToken: `mock-refresh-${Date.now()}`,
      nextStep: 'profile',
    };
    await saveTokens({ access: result.accessToken, refresh: result.refreshToken }, sessionGeneration);
    useDoctorStore.getState().setOnboardingStep(result.nextStep);
    return result;
  }

  console.log('[API] Exchanging Firebase ID token at /auth/doctor/phone/firebase/');
  const generation = sessionGeneration;
  const response = await api.post<TokenPair & { doctor: DoctorResponse }>(
    '/auth/doctor/phone/firebase/',
    { id_token: idToken },
    { headers: { Authorization: undefined } },
  );
  validateTokens(response.data);
  const nextStep = applyDoctor(response.data.doctor);
  await saveTokens(response.data, generation);
  return {
    accessToken: response.data.access,
    refreshToken: response.data.refresh,
    nextStep,
  };
};

/** Rotate refresh tokens once even when several requests receive 401 together. */
export const refreshAccessToken = async (): Promise<string> => {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  const refreshToken = useDoctorStore.getState().refreshToken;
  if (!refreshToken) {
    throw new Error('No refresh token is available. Please sign in again.');
  }
  const generation = sessionGeneration;
  const pending = (async () => {
    try {
      const tokens = USE_MOCK_AUTH
        ? { access: `mock-access-${Date.now()}`, refresh: `mock-refresh-${Date.now()}` }
        : (await api.post<TokenPair>('/auth/doctor/token/refresh/', { refresh: refreshToken })).data;
      await saveTokens(tokens, generation);
      return tokens.access;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401 &&
          generation === sessionGeneration) {
        await clearSession();
        sessionExpiredHandler?.();
      }
      throw error;
    }
  })();
  refreshInFlight = pending;
  try {
    return await pending;
  } finally {
    if (refreshInFlight === pending) {
      refreshInFlight = null;
    }
  }
};

type RetriableRequest = InternalAxiosRequestConfig & { _doctorRetried?: boolean };

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const request = error.config as RetriableRequest | undefined;
  if (error.response?.status !== 401 || !request || request._doctorRetried ||
      isDoctorAuthEndpoint(request.url) || !useDoctorStore.getState().refreshToken) {
    return Promise.reject(error);
  }
  request._doctorRetried = true;
  const current = useDoctorStore.getState().authToken;
  const sent = request.headers.get('Authorization');
  const token = current && sent !== `Bearer ${current}` ? current : await refreshAccessToken();
  request.headers.set('Authorization', `Bearer ${token}`);
  if (request.url?.endsWith('/auth/doctor/logout/')) {
    request.data = JSON.stringify({ refresh: useDoctorStore.getState().refreshToken });
  }
  return api.request(request);
});

export const restoreDoctorSession = async (): Promise<OnboardingStep | null> => {
  const stored = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
  if (!stored) {
    return null;
  }
  let tokens: TokenPair;
  try {
    tokens = validateTokens(JSON.parse(stored.password));
  } catch {
    await clearSession();
    throw new Error('The saved session is invalid. Please sign in again.');
  }
  useDoctorStore.getState().setTokens(tokens.access, tokens.refresh);
  try {
    await refreshAccessToken();
    if (USE_MOCK_AUTH) {
      return 'profile';
    }
    const response = await api.get<DoctorResponse>('/doctors/me/');
    return applyDoctor(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401 &&
        !useDoctorStore.getState().refreshToken) {
      return null;
    }
    throw error;
  }
};

export const logoutDoctor = async (deviceToken?: string): Promise<void> => {
  if (refreshInFlight) {
    await refreshInFlight;
  }
  if (!USE_MOCK_AUTH) {
    if (deviceToken) {
      await api.post('/notifications/devices/remove/', { token: deviceToken });
    }
    const refresh = useDoctorStore.getState().refreshToken;
    if (!refresh) {
      throw new Error('No refresh token is available for logout.');
    }
    await api.post('/auth/doctor/logout/', { refresh });
  }
  await clearSession();
};

// ---------------------------------------------------------------------------
// Doctor profile & availability
// ---------------------------------------------------------------------------

/**
 * Creates/updates the doctor's professional profile.
 * Live endpoints: PATCH /doctors/me/ and PUT /doctors/me/photo/.
 */
export const saveDoctorProfile = async (profile: DoctorProfile, photo?: UploadFile): Promise<void> => {
  if (photo) {
    validateUpload(photo, 'photo');
  }
  if (USE_MOCK_AUTH) {
    await mockDelay();
    if (photo) {
      useDoctorStore.getState().setProfile({ photoUri: photo.uri });
    }
    return;
  }
  const current = (await api.get<DoctorResponse>('/doctors/me/')).data;
  const changes: Record<string, string | number | null> = {};
  if (current.full_name !== profile.fullName) { changes.full_name = profile.fullName; }
  if (current.age !== Number(profile.age)) { changes.age = Number(profile.age); }
  if (current.gender !== profile.gender) { changes.gender = profile.gender; }
  if (current.registration_number !== profile.medicalCouncilRegNumber) {
    changes.registration_number = profile.medicalCouncilRegNumber;
  }
  if (current.qualification !== profile.qualification) { changes.qualification = profile.qualification; }
  if (current.specialization !== profile.specialization) {
    if (['General Practice', 'General Physician'].includes(profile.specialization)) {
      changes.speciality_id = null;
    } else {
      const { data } = await api.get<Array<{ id: number; name: string }>>('/doctors/specialities/');
      const match = data.find((item) => item.name.toLowerCase() === profile.specialization.toLowerCase());
      if (!match) {
        throw new Error('The selected specialization is not available on the server.');
      }
      changes.speciality_id = match.id;
    }
  }
  if (Object.keys(changes).length) {
    await api.patch('/doctors/me/', changes);
  }
  if (photo) {
    const form = new FormData();
    form.append('photo', {
      uri: photo.uri,
      name: photo.name,
      type: photo.type,
    } as unknown as Blob);
    const response = await api.put<DoctorResponse>('/doctors/me/photo/', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    if (typeof response.data?.photo_url !== 'string' || !response.data.photo_url) {
      throw new Error('Photo upload succeeded, but the server did not return a photo URL.');
    }
    useDoctorStore.getState().setProfile({ photoUri: response.data.photo_url });
  }
};

export const deleteDoctorPhoto = async (): Promise<void> => {
  if (!USE_MOCK_AUTH) {
    await api.delete('/doctors/me/photo/');
  }
  useDoctorStore.getState().setProfile({ photoUri: null });
};

/**
 * Commits the doctor's weekly availability.
 * Live endpoint: PUT /doctors/me/availability/
 */
interface AvailabilityResponse {
  days: Array<{
    weekday: number;
    is_open: boolean;
    windows?: Array<{ start_time: string; end_time: string }>;
  }>;
}

const mapAvailability = (response: AvailabilityResponse): DayAvailability[] => {
  if (!Array.isArray(response?.days)) {
    throw new Error('The server returned an invalid availability week.');
  }
  const seen = new Set<number>();
  for (const day of response.days) {
    if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6 ||
        seen.has(day.weekday) || typeof day.is_open !== 'boolean' ||
        (day.is_open && !Array.isArray(day.windows)) ||
        (day.windows !== undefined && (!Array.isArray(day.windows) ||
        day.windows.some((window) => typeof window.start_time !== 'string' || typeof window.end_time !== 'string')))) {
      throw new Error('The server returned an invalid availability day.');
    }
    seen.add(day.weekday);
  }
  return WEEKDAYS.map((day, weekday) => {
    const saved = response.days.find((item) => item.weekday === weekday);
    return {
      day,
      enabled: saved?.is_open ?? false,
      windows: saved?.is_open
        ? (saved.windows ?? []).map((window) => ({ startTime: window.start_time.slice(0, 5), endTime: window.end_time.slice(0, 5) }))
        : [],
    };
  });
};

export const getDoctorAvailability = async (): Promise<DayAvailability[]> => {
  if (USE_MOCK_AUTH) {
    return useDoctorStore.getState().availability;
  }
  const response = await api.get<AvailabilityResponse>('/doctors/me/availability/');
  return mapAvailability(response.data);
};

export const saveDoctorAvailability = async (days: DayAvailability[]): Promise<DayAvailability[]> => {
  const error = validateAvailability(days);
  if (error) {
    throw new Error(error);
  }
  if (USE_MOCK_AUTH) {
    await mockDelay();
    return days;
  }
  const response = await api.put<AvailabilityResponse>('/doctors/me/availability/', {
    days: days.map((d) => ({
      weekday: WEEKDAYS.indexOf(d.day),
      is_open: d.enabled,
      windows: d.enabled ? d.windows.map((window) => ({
        start_time: window.startTime,
        end_time: window.endTime,
      })) : [],
    })),
  });
  return mapAvailability(response.data);
};

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

/**
 * Fetches the doctor's appointments for a calendar date (YYYY-MM-DD).
 * Live endpoint: GET /doctors/me/schedule/?date=YYYY-MM-DD
 */
interface ScheduleItem {
  id: number;
  appointment_number: string;
  patient_name: string;
  starts_at: string;
  ends_at: string;
  mode: Appointment['mode'];
  status: 'confirmed' | 'completed';
  can_join: boolean;
}

export const indiaDate = (time: string | Date): string => {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    throw new Error('The server returned an invalid appointment time.');
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const mapScheduleItem = (item: ScheduleItem): Appointment => {
  if (!Number.isSafeInteger(item.id) || item.id <= 0 || !item.starts_at || !item.ends_at ||
      typeof item.can_join !== 'boolean' ||
      !Number.isFinite(Date.parse(item.starts_at)) || !Number.isFinite(Date.parse(item.ends_at)) ||
      Date.parse(item.ends_at) <= Date.parse(item.starts_at) ||
      !['video', 'audio', 'chat'].includes(item.mode) ||
      !['confirmed', 'completed'].includes(item.status)) {
    throw new Error('The server returned an invalid appointment.');
  }
  const indiaTime = (time: string) => {
    const parsed = new Date(time);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('The server returned an invalid appointment time.');
    }
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(parsed);
  };
  return {
    id: String(item.id),
    source: 'live',
    canJoin: item.can_join,
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    appointmentNumber: item.appointment_number,
    date: indiaDate(item.starts_at),
    startTime: indiaTime(item.starts_at),
    endTime: indiaTime(item.ends_at),
    mode: item.mode,
    status: item.status === 'confirmed' ? 'scheduled' : 'completed',
    consultationFee: '',
    patient: { name: item.patient_name, age: null, gender: '', phone: '', symptoms: '' },
  };
};

export const getAppointmentsForDate = async (
  date: string,
  availability: DayAvailability[] = useDoctorStore.getState().availability,
): Promise<Appointment[]> => {
  if (USE_MOCK_APPOINTMENTS) {
    await mockDelay(300);
    return generateMockAppointments(date, availability);
  }
  const responses = await Promise.all([date, shiftDate(date, -1)].map((day) =>
    api.get<ScheduleItem[]>('/doctors/me/schedule/', { params: { date: day } })));
  const appointments = new Map<string, Appointment>();
  for (const response of responses) {
    if (!Array.isArray(response.data)) {
      throw new Error('The server returned an invalid appointment schedule.');
    }
    for (const item of response.data) {
      const appointment = mapScheduleItem(item);
      if (appointmentDayRange(appointment, date) && !appointments.has(appointment.id)) {
        appointments.set(appointment.id, appointment);
      }
    }
  }
  return [...appointments.values()].sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
};

export const getAppointmentDetails = async (appointment: Appointment): Promise<Appointment> => {
  if (appointment.source !== 'live') { return appointment; }
  return getAppointmentDetailsById(appointment.id);
};

export const getAppointmentDetailsById = async (id: string): Promise<Appointment> => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw new Error('Invalid appointment ID.');
  }
  const response = await api.get<ScheduleItem & {
    fee_display: string;
    patient: { name: string; age: number | null; gender_label: string; phone_number: string };
    symptoms: string;
    condition_details: string;
    treatment_details: string;
  }>(`/doctors/me/appointments/${id}/`);
  const data = response.data;
  return {
    ...mapScheduleItem(data),
    consultationFee: data.fee_display,
    patient: {
      name: data.patient.name,
      age: data.patient.age,
      gender: data.patient.gender_label,
      phone: data.patient.phone_number,
      symptoms: data.symptoms || data.condition_details,
      notes: data.treatment_details,
    },
  };
};

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

/**
 * Consultation count and earnings for a day, month or financial year
 * Live endpoint: GET /doctors/me/earnings/?period=daily|monthly|financial_year&date=YYYY-MM-DD
 */
export const getEarningsSummary = async (
  period: EarningsPeriod,
  date?: string,
): Promise<LiveEarnings> => {
  const response = await api.get<unknown>('/doctors/me/earnings/', {
    params: {
      period: period === 'financialYear' ? 'financial_year' : period,
      ...(date ? { date } : {}),
    },
  });
  return validateLiveEarnings(response.data, period);
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationPage {
  results: AppNotification[];
  hasNext: boolean;
}

const mapNotification = (data: unknown): AppNotification => {
  if (!data || typeof data !== 'object') { throw new Error('Invalid notification received.'); }
  const item = data as Record<string, unknown>;
  if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0 ||
      typeof item.kind !== 'string' || typeof item.title !== 'string' ||
      typeof item.body !== 'string' || typeof item.created_at !== 'string' ||
      !Number.isFinite(Date.parse(item.created_at)) || typeof item.is_read !== 'boolean' ||
      !(item.appointment_id === null || (Number.isSafeInteger(item.appointment_id) && Number(item.appointment_id) > 0))) {
    throw new Error('Invalid notification received.');
  }
  return {
    id: String(item.id), kind: item.kind, title: item.title, body: item.body,
    createdAt: item.created_at, read: item.is_read,
    appointmentId: item.appointment_id as number | null,
    type: item.kind.includes('appointment') || item.kind === 'doctor_assigned' || item.kind === 'consultation_completed'
      ? 'appointment' : item.kind === 'payment_success' ? 'payment' : 'system',
  };
};

export const getNotifications = async (page = 1, unread = false): Promise<NotificationPage> => {
  const { data } = await api.get<{ results: unknown; next: unknown }>('/notifications/', {
    params: { page, ...(unread ? { unread: true } : {}) },
  });
  if (!Array.isArray(data?.results) || !(data.next === null || typeof data.next === 'string')) {
    throw new Error('Invalid notification list received.');
  }
  return { results: data.results.map(mapNotification), hasNext: data.next !== null };
};

export const markNotificationRead = async (id: string): Promise<AppNotification> => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) { throw new Error('Invalid notification ID.'); }
  const { data } = await api.post<unknown>(`/notifications/${id}/read/`);
  const updated = mapNotification(data);
  if (updated.id !== id || !updated.read) {
    throw new Error('The server did not confirm the notification was marked read.');
  }
  return updated;
};

export const markAllNotificationsRead = async (): Promise<number> => {
  const { data } = await api.post<{ marked_read: unknown }>('/notifications/read-all/');
  if (!Number.isSafeInteger(data?.marked_read) || Number(data.marked_read) < 0) {
    throw new Error('Invalid notification update received.');
  }
  return Number(data.marked_read);
};

export const getUnreadNotificationCount = async (): Promise<number> => {
  const { data } = await api.get<{ unread_count: unknown }>('/notifications/unread-count/');
  if (!Number.isSafeInteger(data?.unread_count) || Number(data.unread_count) < 0) {
    throw new Error('Invalid unread notification count received.');
  }
  return Number(data.unread_count);
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * Uploads a verification document (registration certificate, degree, ID).
 * Live endpoint: POST /doctors/me/documents/ (multipart/form-data)
 */
export const uploadDoctorDocument = async (
  label: string,
  file: UploadFile,
): Promise<DoctorDocument> => {
  validateUpload(file, 'document');
  if (USE_MOCK_AUTH) {
    await mockDelay(600);
    return {
      id: `doc-${Date.now()}`,
      label,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    };
  }
  const form = new FormData();
  const documentTypes: Record<string, string> = {
    'Medical Council Registration Certificate': 'medical_registration',
    'Qualification Degree': 'degree_certificate',
    'Government ID Proof': 'government_id',
    'Other': 'other',
  };
  const documentType = documentTypes[label];
  if (!documentType) {
    throw new Error('Unsupported document type.');
  }
  form.append('document_type', documentType);
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  const response = await api.post<DoctorResponse['documents'][number]>('/doctors/me/documents/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return {
    id: String(response.data.id),
    label,
    fileName: response.data.original_name,
    uploadedAt: response.data.uploaded_at,
  };
};

export const deleteDoctorDocument = async (id: string): Promise<void> => {
  if (!USE_MOCK_AUTH) {
    await api.delete(`/doctors/me/documents/${encodeURIComponent(id)}/`);
  }
};
