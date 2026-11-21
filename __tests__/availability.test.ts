import { validateAvailability } from '../src/services/availability';
import { generateMockAppointments } from '../src/services/mockData';
import { DayAvailability, defaultAvailability } from '../src/services/useDoctorStore';

const day = (windows: DayAvailability['windows']): DayAvailability[] =>
  [{ day: 'Mon', enabled: true, windows }];

test('default week and three split windows meet the daily six-hour minimum', () => {
  expect(validateAvailability(defaultAvailability)).toBeNull();
  expect(validateAvailability(day([
    { startTime: '07:00', endTime: '10:00' },
    { startTime: '15:00', endTime: '17:00' },
    { startTime: '21:00', endTime: '23:00' },
  ]))).toBeNull();
  expect(validateAvailability(day([{ startTime: '00:00', endTime: '06:00' }]))).toBeNull();
});

test('rejects missing open days, too many windows, invalid times, overlap and insufficient totals', () => {
  expect(validateAvailability([{ day: 'Mon', enabled: false, windows: [] }])).toMatch(/one day/i);
  expect(validateAvailability(day([]))).toMatch(/one and three/i);
  expect(validateAvailability(day(Array(4).fill({ startTime: '09:00', endTime: '10:00' })))).toMatch(/one and three/i);
  expect(validateAvailability(day([{ startTime: '09:10', endTime: '16:00' }]))).toMatch(/15-minute/);
  expect(validateAvailability(day([{ startTime: '24:00', endTime: '25:00' }]))).toMatch(/valid/);
  expect(validateAvailability(day([{ startTime: '09:00', endTime: '09:00' }]))).toMatch(/equal/i);
  expect(validateAvailability(day([
    { startTime: '09:00', endTime: '13:00' },
    { startTime: '12:45', endTime: '16:00' },
  ]))).toMatch(/overlap/);
  expect(validateAvailability(day([{ startTime: '09:00', endTime: '14:45' }]))).toMatch(/six hours/);
  expect(validateAvailability(day([
    { startTime: '09:00', endTime: '12:00' },
    { startTime: '12:00', endTime: '15:00' },
  ]))).toBeNull();
});

test('accepts a full day and overnight hours while detecting overlaps across the week', () => {
  expect(validateAvailability(day([{ startTime: '00:00', endTime: '24:00' }]))).toBeNull();
  expect(validateAvailability(day([{ startTime: '21:00', endTime: '03:00' }]))).toBeNull();
  expect(validateAvailability(day([{ startTime: '24:00', endTime: '06:00' }]))).toMatch(/valid/i);
  expect(validateAvailability([
    { day: 'Mon', enabled: true, windows: [{ startTime: '21:00', endTime: '03:00' }] },
    { day: 'Tue', enabled: true, windows: [{ startTime: '02:45', endTime: '09:00' }] },
  ])).toMatch(/overlap/i);
  expect(validateAvailability([
    { day: 'Sun', enabled: true, windows: [{ startTime: '21:00', endTime: '03:00' }] },
    { day: 'Mon', enabled: true, windows: [{ startTime: '02:45', endTime: '09:00' }] },
  ])).toMatch(/overlap/i);
  expect(validateAvailability([
    { day: 'Sun', enabled: true, windows: [{ startTime: '21:00', endTime: '03:00' }] },
    { day: 'Mon', enabled: true, windows: [{ startTime: '03:00', endTime: '09:00' }] },
  ])).toBeNull();
});

test('demo overnight appointments appear on both dates when they cross midnight', () => {
  const availability = day([{ startTime: '22:00', endTime: '04:00' }]);
  const monday = generateMockAppointments('2026-11-16', availability);
  const tuesday = generateMockAppointments('2026-11-17', availability);
  const overnight = monday.find((item) => item.startTime === '23:30');
  expect(overnight?.endTime).toBe('00:15');
  expect(tuesday.some((item) => item.id === overnight?.id)).toBe(true);
  expect(tuesday.some((item) => item.startTime === '01:00')).toBe(true);
});

test('demo appointments do not span gaps between windows', () => {
  const appointments = generateMockAppointments('2026-11-16', day([
    { startTime: '07:00', endTime: '10:00' },
    { startTime: '15:00', endTime: '18:00' },
  ]));
  expect(appointments.some((item) => item.startTime >= '15:00')).toBe(true);
  expect(appointments.every((item) => item.endTime <= '10:00' || item.startTime >= '15:00')).toBe(true);
});
