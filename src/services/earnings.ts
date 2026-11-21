import { Appointment } from './useDoctorStore';

export type EarningsPeriod = 'daily' | 'monthly' | 'financialYear';

export interface EarningsBucket {
  label: string;
  consultations: number;
  earnings: number;
}

export interface ModeBreakdown {
  consultations: number;
  earnings: number;
}

export interface EarningsSummary {
  period: EarningsPeriod;
  label: string;
  startDate: string;
  endDate: string;
  consultations: number;
  earnings: number;
  averagePerConsultation: number;
  byMode: Record<Appointment['mode'], ModeBreakdown>;
  buckets: EarningsBucket[];
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Indian financial year runs April (month 3) to March.
const FY_START_MONTH = 3;
// Daily chart groups the 6 AM – 10 PM working window into 2-hour buckets.
const DAILY_BUCKET_START_HOUR = 6;
const DAILY_BUCKET_END_HOUR = 22;
const DAILY_BUCKET_HOURS = 2;

export const toISODate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseISODate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const parseFee = (fee: string): number => {
  const value = Number(fee.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : 0;
};

/** Calendar year in which the financial year containing `date` starts. */
export const getFinancialYearStartYear = (date: Date): number =>
  date.getMonth() >= FY_START_MONTH ? date.getFullYear() : date.getFullYear() - 1;

export const getPeriodRange = (
  period: EarningsPeriod,
  anchor: Date,
): { start: Date; end: Date; label: string } => {
  if (period === 'daily') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    return {
      start,
      end: start,
      label: `${start.getDate()} ${MONTH_SHORT[start.getMonth()]} ${start.getFullYear()}`,
    };
  }
  if (period === 'monthly') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start, end, label: `${MONTH_SHORT[start.getMonth()]} ${start.getFullYear()}` };
  }
  const fyYear = getFinancialYearStartYear(anchor);
  const start = new Date(fyYear, FY_START_MONTH, 1);
  const end = new Date(fyYear + 1, FY_START_MONTH, 0);
  return { start, end, label: `FY ${fyYear}–${String(fyYear + 1).slice(2)}` };
};

/** Moves the anchor date by `delta` days, months or financial years. */
export const shiftPeriodAnchor = (period: EarningsPeriod, anchor: Date, delta: number): Date => {
  if (period === 'daily') {
    return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + delta);
  }
  if (period === 'monthly') {
    return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
  }
  return new Date(getFinancialYearStartYear(anchor) + delta, FY_START_MONTH, 1);
};

export const isCurrentOrFuturePeriod = (
  period: EarningsPeriod,
  anchor: Date,
  today: Date = new Date(),
): boolean => getPeriodRange(period, anchor).end >= getPeriodRange(period, today).start;

const buildEmptyBuckets = (period: EarningsPeriod, start: Date, end: Date): EarningsBucket[] => {
  if (period === 'daily') {
    const buckets: EarningsBucket[] = [];
    for (let h = DAILY_BUCKET_START_HOUR; h < DAILY_BUCKET_END_HOUR; h += DAILY_BUCKET_HOURS) {
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      buckets.push({ label: `${hour12}${h < 12 ? 'a' : 'p'}`, consultations: 0, earnings: 0 });
    }
    return buckets;
  }
  if (period === 'monthly') {
    return Array.from({ length: end.getDate() }, (_, i) => ({
      label: String(i + 1),
      consultations: 0,
      earnings: 0,
    }));
  }
  return Array.from({ length: 12 }, (_, i) => ({
    label: MONTH_SHORT[(start.getMonth() + i) % 12],
    consultations: 0,
    earnings: 0,
  }));
};

const bucketIndexFor = (period: EarningsPeriod, apt: Appointment, start: Date): number => {
  if (period === 'daily') {
    const hour = Number(apt.startTime.split(':')[0]);
    return Math.floor((hour - DAILY_BUCKET_START_HOUR) / DAILY_BUCKET_HOURS);
  }
  const date = parseISODate(apt.date);
  if (period === 'monthly') {
    return date.getDate() - 1;
  }
  return (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
};

/**
 * Aggregates completed consultations that fall inside the selected period
 * into totals, a per-mode breakdown and chart buckets.
 */
export const summarizeEarnings = (
  consultations: Appointment[],
  period: EarningsPeriod,
  anchor: Date,
): EarningsSummary => {
  const { start, end, label } = getPeriodRange(period, anchor);
  const startDate = toISODate(start);
  const endDate = toISODate(end);
  const buckets = buildEmptyBuckets(period, start, end);
  const byMode: EarningsSummary['byMode'] = {
    video: { consultations: 0, earnings: 0 },
    audio: { consultations: 0, earnings: 0 },
    chat: { consultations: 0, earnings: 0 },
  };

  let total = 0;
  let count = 0;
  consultations.forEach((apt) => {
    if (apt.status !== 'completed' || apt.date < startDate || apt.date > endDate) {
      return;
    }
    const fee = parseFee(apt.consultationFee);
    count += 1;
    total += fee;
    byMode[apt.mode].consultations += 1;
    byMode[apt.mode].earnings += fee;

    const index = Math.min(Math.max(bucketIndexFor(period, apt, start), 0), buckets.length - 1);
    buckets[index].consultations += 1;
    buckets[index].earnings += fee;
  });

  return {
    period,
    label,
    startDate,
    endDate,
    consultations: count,
    earnings: total,
    averagePerConsultation: count > 0 ? Math.round(total / count) : 0,
    byMode,
    buckets,
  };
};

/** Formats with Indian digit grouping (e.g. ₹1,23,456) without relying on Intl. */
export const formatRupees = (amount: number): string => {
  const digits = String(Math.abs(Math.round(amount)));
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${lastThree}` : lastThree;
  return `${amount < 0 ? '-' : ''}₹${grouped}`;
};
