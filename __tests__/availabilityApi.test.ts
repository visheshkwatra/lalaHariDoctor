import { api, saveDoctorAvailability } from '../src/services/api';
import { DayAvailability } from '../src/services/useDoctorStore';

afterEach(() => jest.restoreAllMocks());

test('sends and reads full-day and overnight windows without changing their boundaries', async () => {
  const days: DayAvailability[] = [
    { day: 'Mon', enabled: true, windows: [{ startTime: '00:00', endTime: '24:00' }] },
    { day: 'Tue', enabled: true, windows: [{ startTime: '21:00', endTime: '03:00' }] },
  ];
  const response = { days: [
    { weekday: 0, is_open: true, windows: [{ start_time: '00:00', end_time: '24:00' }] },
    { weekday: 1, is_open: true, windows: [{ start_time: '21:00', end_time: '03:00' }] },
  ] };
  const put = jest.spyOn(api, 'put').mockResolvedValue({ data: response });
  const saved = await saveDoctorAvailability(days);
  expect(put).toHaveBeenCalledWith('/doctors/me/availability/', response);
  expect(saved.slice(0, 2)).toEqual(days);
});

test('surfaces backend rejection of overnight availability', async () => {
  const error = new Error('Backend does not accept overnight hours');
  jest.spyOn(api, 'put').mockRejectedValue(error);
  await expect(saveDoctorAvailability([
    { day: 'Mon', enabled: true, windows: [{ startTime: '21:00', endTime: '03:00' }] },
  ])).rejects.toBe(error);
});
