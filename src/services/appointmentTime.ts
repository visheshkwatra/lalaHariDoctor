import { Appointment } from './useDoctorStore';

const DAY_MS = 24 * 60 * 60 * 1000;
const INDIA_OFFSET_MS = 330 * 60 * 1000;

export const shiftDate = (date: string, days: number): string => {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) { throw new Error('Invalid schedule date.'); }
  return new Date(parsed + days * DAY_MS).toISOString().slice(0, 10);
};

export const appointmentDayRange = (appointment: Appointment, date: string): { start: number; end: number } | null => {
  if (appointment.startsAt && appointment.endsAt) {
    const dayStart = Date.parse(`${date}T00:00:00Z`) - INDIA_OFFSET_MS;
    const start = Date.parse(appointment.startsAt);
    const end = Date.parse(appointment.endsAt);
    if (!Number.isFinite(dayStart) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error('The server returned an invalid appointment time.');
    }
    if (start >= dayStart + DAY_MS || end <= dayStart) { return null; }
    return {
      start: Math.max(0, (start - dayStart) / 60000),
      end: Math.min(1440, (end - dayStart) / 60000),
    };
  }
  if (appointment.date !== date) { return null; }
  const minutes = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  };
  const start = minutes(appointment.startTime);
  const end = minutes(appointment.endTime);
  return { start, end: end < start ? 1440 : end };
};
