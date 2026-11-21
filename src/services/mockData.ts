import { Appointment, AppNotification, DayAvailability } from './useDoctorStore';
import { appointmentDayRange, shiftDate } from './appointmentTime';
import { windowMinutes } from './availability';

const MOCK_PATIENTS = [
  {
    name: 'Rahul Verma',
    age: 34,
    gender: 'Male',
    phone: '+91 98220 11445',
    symptoms: 'Fever and sore throat since 2 days',
    notes: 'No known allergies. Took paracetamol this morning.',
  },
  {
    name: 'Priya Nair',
    age: 28,
    gender: 'Female',
    phone: '+91 99301 55672',
    symptoms: 'Migraine, light sensitivity',
    notes: 'History of migraines. Worse in the evening.',
  },
  {
    name: 'Amit Kulkarni',
    age: 52,
    gender: 'Male',
    phone: '+91 90040 77821',
    symptoms: 'Follow-up: hypertension review',
    notes: 'On amlodipine 5mg. BP log attached to case.',
  },
  {
    name: 'Sneha Iyer',
    age: 41,
    gender: 'Female',
    phone: '+91 98675 30214',
    symptoms: 'Lower back pain radiating to left leg',
  },
  {
    name: 'Vikram Reddy',
    age: 60,
    gender: 'Male',
    phone: '+91 98490 61130',
    symptoms: 'Diabetes routine check-up',
    notes: 'HbA1c report uploaded with the appointment.',
  },
  {
    name: 'Meera Joshi',
    age: 23,
    gender: 'Female',
    phone: '+91 97110 88456',
    symptoms: 'Skin rash on forearms, itching',
  },
];

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const toHHmm = (minutes: number): string => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const MODES: Appointment['mode'][] = ['video', 'video', 'audio', 'chat'];

/**
 * Deterministically generates 45-minute appointments for a date, one every
 * 90 minutes inside each availability window for that weekday.
 */
const generateMockAppointmentsStartingOn = (
  date: string,
  availability: DayAvailability[],
): Appointment[] => {
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  const config = availability.find((d) => DAY_INDEX[d.day] === dayOfWeek && d.enabled);
  if (!config) {
    return [];
  }

  const SLOT_MINUTES = 45;
  const GAP_MINUTES = 45;
  const appointments: Appointment[] = [];
  let index = 0;
  for (const window of [...config.windows].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const range = windowMinutes(window.startTime, window.endTime);
    let cursor = range.start;
    const end = range.end;
    while (cursor + SLOT_MINUTES <= end && index < MOCK_PATIENTS.length) {
      const patient = MOCK_PATIENTS[index];
      const start = Date.parse(`${date}T00:00:00+05:30`) + cursor * 60000;
      appointments.push({
        id: `apt-${date}-${index}`,
        source: 'mock',
        appointmentNumber: `LH-${date.replace(/-/g, '').slice(2)}-${String(index + 1).padStart(3, '0')}`,
        date: cursor >= 1440 ? shiftDate(date, Math.floor(cursor / 1440)) : date,
        startTime: toHHmm(cursor),
        endTime: toHHmm(cursor + SLOT_MINUTES),
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + SLOT_MINUTES * 60000).toISOString(),
        mode: MODES[index % MODES.length],
        status: 'scheduled',
        consultationFee: '₹499',
        patient,
      });
      cursor += SLOT_MINUTES + GAP_MINUTES;
      index += 1;
    }
  }
  return appointments;
};

export const generateMockAppointments = (date: string, availability: DayAvailability[]): Appointment[] =>
  [shiftDate(date, -1), date]
    .flatMap((day) => generateMockAppointmentsStartingOn(day, availability))
    .filter((appointment) => appointmentDayRange(appointment, date) !== null);

const dateSeed = (date: string): number =>
  date.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 9973, 7);

/**
 * Deterministic history of completed consultations between two dates
 * (inclusive). A few slots per day are skipped to mimic no-shows, and nothing
 * after `now` is counted.
 */
export const generateMockCompletedConsultations = (
  startDate: string,
  endDate: string,
  availability: DayAvailability[],
  now: Date = new Date(),
): Appointment[] => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const lastDate = endDate < todayIso ? endDate : todayIso;

  const [sy, sm, sd] = startDate.split('-').map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const result: Appointment[] = [];
  for (;;) {
    const iso = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    if (iso > lastDate) {
      break;
    }
    const skipped = dateSeed(iso) % 3;
    generateMockAppointments(iso, availability)
      .filter((_, i) => (i + dateSeed(iso)) % 5 >= skipped)
      .filter((apt) => apt.date === iso && (apt.endsAt ? Date.parse(apt.endsAt) <= now.getTime() :
        iso < todayIso || toMinutes(apt.endTime) <= nowMinutes))
      .forEach((apt) => result.push({ ...apt, status: 'completed' }));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
};

export const mockNotifications = (): AppNotification[] => {
  const now = Date.now();
  return [
    {
      id: 'ntf-1',
      title: 'New appointment booked',
      body: 'Rahul Verma booked a video consultation for today.',
      createdAt: new Date(now - 12 * 60 * 1000).toISOString(),
      read: false,
      type: 'appointment',
    },
    {
      id: 'ntf-2',
      title: 'Appointment reminder',
      body: 'Your next consultation starts soon. The Join button activates 5 minutes before.',
      createdAt: new Date(now - 45 * 60 * 1000).toISOString(),
      read: false,
      type: 'appointment',
    },
    {
      id: 'ntf-3',
      title: 'Payout processed',
      body: 'Your payout of ₹3,492 for last week has been initiated.',
      createdAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      read: true,
      type: 'payment',
    },
    {
      id: 'ntf-4',
      title: 'Profile verification',
      body: 'Upload your medical council registration certificate to complete verification.',
      createdAt: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
      read: true,
      type: 'system',
    },
  ];
};
