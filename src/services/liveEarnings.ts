import { EarningsPeriod } from './earnings';

export interface LiveEarnings {
  period: 'daily' | 'monthly' | 'financial_year';
  label: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  previous_date: string;
  next_date: string | null;
  currency: string;
  total_earned: number;
  total_earned_display: string;
  consultations_count: number;
  average_per_consultation: number;
  average_display: string;
  chart: Array<{ label: string; amount: number; count: number }>;
  by_mode: Array<{ mode: 'video' | 'audio' | 'chat'; label: string; amount: number; amount_display: string; count: number; share_percent: number }>;
  other_currencies: Array<{ currency: string; amount: number; count: number }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function assertLiveEarnings(data: unknown, period: EarningsPeriod): asserts data is LiveEarnings {
  const expectedPeriod = period === 'financialYear' ? 'financial_year' : period;
  if (!isRecord(data) || data.period !== expectedPeriod ||
      !isText(data.label) || !isDate(data.start_date) || !isDate(data.end_date) ||
      data.start_date > data.end_date || typeof data.is_current !== 'boolean' ||
      !isDate(data.previous_date) || (data.next_date !== null && !isDate(data.next_date)) ||
      !isText(data.currency) || !isAmount(data.total_earned) || !isText(data.total_earned_display) ||
      !isCount(data.consultations_count) || !isAmount(data.average_per_consultation) ||
      !isText(data.average_display) || !Array.isArray(data.chart) || !Array.isArray(data.by_mode) ||
      !Array.isArray(data.other_currencies)) {
    throw new Error('The server returned invalid earnings data.');
  }
  if (data.chart.some((item: unknown) => !isRecord(item) || !isText(item.label) ||
      !isAmount(item.amount) || !isCount(item.count)) ||
      data.by_mode.some((item: unknown) => !isRecord(item) ||
        !['video', 'audio', 'chat'].includes(String(item.mode)) || !isText(item.label) ||
        !isAmount(item.amount) || !isText(item.amount_display) || !isCount(item.count) ||
        !isAmount(item.share_percent) || item.share_percent > 100) ||
      new Set(data.by_mode.map((item: { mode: string }) => item.mode)).size !== data.by_mode.length ||
      data.other_currencies.some((item: unknown) => !isRecord(item) ||
        !isText(item.currency) || !isAmount(item.amount) || !isCount(item.count))) {
    throw new Error('The server returned invalid earnings details.');
  }
}

export const validateLiveEarnings = (data: unknown, period: EarningsPeriod): LiveEarnings => {
  assertLiveEarnings(data, period);
  return data;
};
