import {
  formatRupees,
  getFinancialYearStartYear,
  getPeriodRange,
  isCurrentOrFuturePeriod,
  shiftPeriodAnchor,
  summarizeEarnings,
  toISODate,
} from '../src/services/earnings';
import { generateMockCompletedConsultations } from '../src/services/mockData';
import { Appointment, DayAvailability } from '../src/services/useDoctorStore';

const apt = (overrides: Partial<Appointment>): Appointment => ({
  id: 'a',
  appointmentNumber: 'LH-1',
  date: '2026-05-10',
  startTime: '09:00',
  endTime: '09:45',
  mode: 'video',
  status: 'completed',
  consultationFee: '₹499',
  patient: { name: 'P', age: 30, gender: 'Male', phone: '', symptoms: '' },
  ...overrides,
});

describe('earnings periods', () => {
  it('uses April–March financial years', () => {
    expect(getFinancialYearStartYear(new Date(2026, 2, 31))).toBe(2025);
    expect(getFinancialYearStartYear(new Date(2026, 3, 1))).toBe(2026);

    const range = getPeriodRange('financialYear', new Date(2027, 0, 15));
    expect(toISODate(range.start)).toBe('2026-04-01');
    expect(toISODate(range.end)).toBe('2027-03-31');
    expect(range.label).toBe('FY 2026–27');
  });

  it('computes month ranges and shifts anchors', () => {
    const range = getPeriodRange('monthly', new Date(2028, 1, 10));
    expect(toISODate(range.end)).toBe('2028-02-29');
    expect(toISODate(shiftPeriodAnchor('monthly', new Date(2026, 0, 31), 1))).toBe('2026-02-01');
    expect(toISODate(shiftPeriodAnchor('financialYear', new Date(2026, 1, 1), -1))).toBe(
      '2024-04-01',
    );
  });

  it('flags the current period so users cannot move into the future', () => {
    const today = new Date(2026, 4, 10);
    expect(isCurrentOrFuturePeriod('daily', new Date(2026, 4, 10), today)).toBe(true);
    expect(isCurrentOrFuturePeriod('daily', new Date(2026, 4, 9), today)).toBe(false);
    expect(isCurrentOrFuturePeriod('financialYear', new Date(2026, 3, 1), today)).toBe(true);
    expect(isCurrentOrFuturePeriod('financialYear', new Date(2026, 2, 31), today)).toBe(false);
  });
});

describe('summarizeEarnings', () => {
  it('totals only completed consultations inside the period', () => {
    const summary = summarizeEarnings(
      [
        apt({ id: '1', mode: 'video', date: '2026-05-01' }),
        apt({ id: '2', mode: 'audio', date: '2026-05-31', consultationFee: '₹1,000' }),
        apt({ id: '3', status: 'cancelled' }),
        apt({ id: '4', date: '2026-06-01' }),
      ],
      'monthly',
      new Date(2026, 4, 15),
    );
    expect(summary.consultations).toBe(2);
    expect(summary.earnings).toBe(1499);
    expect(summary.averagePerConsultation).toBe(750);
    expect(summary.byMode.audio).toEqual({ consultations: 1, earnings: 1000 });
    expect(summary.buckets).toHaveLength(31);
    expect(summary.buckets[0].earnings).toBe(499);
    expect(summary.buckets[30].earnings).toBe(1000);
  });

  it('buckets financial year earnings by month starting in April', () => {
    const summary = summarizeEarnings(
      [apt({ date: '2026-04-02' }), apt({ date: '2027-03-30' })],
      'financialYear',
      new Date(2026, 6, 1),
    );
    expect(summary.buckets.map((b) => b.label)[0]).toBe('Apr');
    expect(summary.buckets[0].consultations).toBe(1);
    expect(summary.buckets[11].label).toBe('Mar');
    expect(summary.buckets[11].consultations).toBe(1);
  });

  it('formats rupees with Indian digit grouping', () => {
    expect(formatRupees(499)).toBe('₹499');
    expect(formatRupees(123456)).toBe('₹1,23,456');
    expect(formatRupees(12345678)).toBe('₹1,23,45,678');
  });
});

describe('generateMockCompletedConsultations', () => {
  const availability: DayAvailability[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
    (day) => ({ day, enabled: true, windows: [{ startTime: '09:00', endTime: '17:00' }] }),
  );

  it('never includes consultations after now and is deterministic', () => {
    const now = new Date(2026, 4, 10, 12, 0);
    const first = generateMockCompletedConsultations('2026-05-01', '2026-05-31', availability, now);
    const second = generateMockCompletedConsultations('2026-05-01', '2026-05-31', availability, now);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((a) => a.status === 'completed')).toBe(true);
    expect(first.every((a) => a.date <= '2026-05-10')).toBe(true);
    expect(
      first.filter((a) => a.date === '2026-05-10').every((a) => a.endTime <= '12:00'),
    ).toBe(true);
  });
});
