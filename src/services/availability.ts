import { DayAvailability } from './useDoctorStore';

export const MIN_AVAILABILITY_MINUTES = 6 * 60;
export const MAX_AVAILABILITY_WINDOWS = 3;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;

export const timeToMinutes = (time: string, allowEndOfDay = false): number => {
  if (allowEndOfDay && time === '24:00') { return DAY_MINUTES; }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return NaN;
  }
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const windowMinutes = (startTime: string, endTime: string): { start: number; end: number } => {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime, true);
  if (end < start) { end += DAY_MINUTES; }
  return { start, end };
};

export const validateAvailability = (days: DayAvailability[]): string | null => {
  if (!days.some((day) => day.enabled)) {
    return 'Enable at least one day.';
  }
  if (new Set(days.map((day) => day.day)).size !== days.length ||
      days.some((day) => !WEEKDAYS.includes(day.day))) {
    return 'Availability contains invalid or duplicate weekdays.';
  }
  const weeklyRanges: Array<{ start: number; end: number; day: string }> = [];
  for (const day of days.filter((item) => item.enabled)) {
    if (day.windows.length < 1 || day.windows.length > MAX_AVAILABILITY_WINDOWS) {
      return `${day.day}: choose between one and three time windows.`;
    }
    const ranges = day.windows.map((window) => windowMinutes(window.startTime, window.endTime));
    if (ranges.some(({ start, end }) =>
      !Number.isFinite(start) || !Number.isFinite(end) ||
      start % 15 !== 0 || end % 15 !== 0 || end <= start,
    )) {
      return `${day.day}: enter valid times in 15-minute steps. Use 24:00 only as an end time; equal times are not allowed.`;
    }
    ranges.sort((a, b) => a.start - b.start);
    if (ranges.some((range, index) => index > 0 && range.start < ranges[index - 1].end)) {
      return `${day.day}: time windows must not overlap.`;
    }
    if (ranges.reduce((total, range) => total + range.end - range.start, 0) < MIN_AVAILABILITY_MINUTES) {
      return `${day.day}: total availability must be at least six hours.`;
    }
    const dayStart = WEEKDAYS.indexOf(day.day) * DAY_MINUTES;
    for (const range of ranges) {
      const start = dayStart + range.start;
      const end = dayStart + range.end;
      weeklyRanges.push({ start, end, day: day.day });
      if (end > WEEK_MINUTES) {
        weeklyRanges.push({ start: 0, end: end - WEEK_MINUTES, day: day.day });
      }
    }
  }
  weeklyRanges.sort((a, b) => a.start - b.start);
  if (weeklyRanges.some((range, index) => index > 0 && range.start < weeklyRanges[index - 1].end)) {
    return 'Time windows must not overlap across midnight or between days.';
  }
  return null;
};
