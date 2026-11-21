import { create } from 'zustand';

export type Gender = 'male' | 'female' | 'other';
export type OnboardingStep = 'profile' | 'availability' | 'done';

export interface DoctorProfile {
  fullName: string;
  age: string;
  gender: Gender | '';
  photoUri: string | null;
  medicalCouncilRegNumber: string;
  qualification: string;
  specialization: string;
}

export interface DayAvailability {
  day: string; // 'Mon' .. 'Sun'
  enabled: boolean;
  windows: AvailabilityWindow[];
}

export interface AvailabilityWindow {
  startTime: string;
  endTime: string;
}

export interface PatientIntake {
  name: string;
  age: number | null;
  gender: string;
  phone: string;
  symptoms: string;
  notes?: string;
}

export interface Appointment {
  id: string;
  source?: 'live' | 'mock';
  canJoin?: boolean;
  startsAt?: string;
  endsAt?: string;
  appointmentNumber: string;
  date: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:mm' 24h
  endTime: string; // 'HH:mm' 24h
  mode: 'video' | 'audio' | 'chat';
  status: 'scheduled' | 'completed' | 'cancelled';
  consultationFee: string;
  patient: PatientIntake;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string; // ISO
  read: boolean;
  type: 'appointment' | 'system' | 'payment';
  appointmentId?: number | null;
  kind?: string;
}

export interface DoctorDocument {
  id: string;
  label: string; // e.g. 'Medical Council Registration Certificate'
  fileName: string;
  uploadedAt: string; // ISO
}

interface DoctorState {
  // auth
  phone: string | null;
  authToken: string | null;
  refreshToken: string | null;
  isRegistered: boolean;
  onboardingStep: OnboardingStep;
  // onboarding
  profile: DoctorProfile;
  availability: DayAvailability[];
  // data
  appointments: Appointment[];
  notifications: AppNotification[];
  unreadCount: number;
  documents: DoctorDocument[];
  // actions
  setPhone: (phone: string | null) => void;
  setAuthToken: (token: string | null) => void;
  setRefreshToken: (token: string | null) => void;
  setIsRegistered: (value: boolean) => void;
  setOnboardingStep: (step: OnboardingStep) => void;
  setTokens: (access: string, refresh: string) => void;
  setDocuments: (documents: DoctorDocument[]) => void;
  setProfile: (profile: Partial<DoctorProfile>) => void;
  setAvailability: (days: DayAvailability[]) => void;
  setAppointments: (appointments: Appointment[]) => void;
  setNotifications: (notifications: AppNotification[]) => void;
  setUnreadCount: (count: number) => void;
  markNotificationRead: (id: string) => void;
  addDocument: (doc: DoctorDocument) => void;
  removeDocument: (id: string) => void;
  logout: () => void;
}

export const emptyProfile: DoctorProfile = {
  fullName: '',
  age: '',
  gender: '',
  photoUri: null,
  medicalCouncilRegNumber: '',
  qualification: '',
  specialization: '',
};

export const defaultAvailability: DayAvailability[] = [
  { day: 'Mon', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
  { day: 'Tue', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
  { day: 'Wed', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
  { day: 'Thu', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
  { day: 'Fri', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
  { day: 'Sat', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
  { day: 'Sun', enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] },
];

export const useDoctorStore = create<DoctorState>((set) => ({
  phone: null,
  authToken: null,
  refreshToken: null,
  isRegistered: false,
  onboardingStep: 'profile',
  profile: emptyProfile,
  availability: defaultAvailability,
  appointments: [],
  notifications: [],
  unreadCount: 0,
  documents: [],
  setPhone: (phone) => set({ phone }),
  setAuthToken: (authToken) => set({ authToken }),
  setRefreshToken: (refreshToken) => set({ refreshToken }),
  setIsRegistered: (isRegistered) => set({
    isRegistered,
    onboardingStep: isRegistered ? 'done' : 'profile',
  }),
  setOnboardingStep: (onboardingStep) => set({
    onboardingStep,
    isRegistered: onboardingStep === 'done',
  }),
  setTokens: (authToken, refreshToken) => set({ authToken, refreshToken }),
  setDocuments: (documents) => set({ documents }),
  setProfile: (profile) => set((state) => ({ profile: { ...state.profile, ...profile } })),
  setAvailability: (availability) => set({ availability }),
  setAppointments: (appointments) => set({ appointments }),
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),
  addDocument: (doc) => set((state) => ({ documents: [...state.documents, doc] })),
  removeDocument: (id) =>
    set((state) => ({ documents: state.documents.filter((d) => d.id !== id) })),
  logout: () =>
    set({
      phone: null,
      authToken: null,
      refreshToken: null,
      isRegistered: false,
      onboardingStep: 'profile',
      profile: emptyProfile,
      availability: defaultAvailability,
      appointments: [],
      notifications: [],
      unreadCount: 0,
      documents: [],
    }),
}));
