import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { api, getEarningsSummary } from '../src/services/api';
import { LiveEarnings } from '../src/services/liveEarnings';
import { EarningsScreen } from '../src/screens/dashboard/earningsScreen';
import { MainTabParamList } from '../src/navigation/types';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

const response: LiveEarnings = {
  period: 'daily', label: '18 Oct 2026', start_date: '2026-10-18', end_date: '2026-10-18',
  is_current: true, previous_date: '2026-10-17', next_date: null, currency: 'INR',
  total_earned: 4600, total_earned_display: '₹4,600', consultations_count: 20,
  average_per_consultation: 230, average_display: '₹230',
  chart: [{ label: '00', amount: 400, count: 2 }],
  by_mode: [{ mode: 'video', label: 'Video Call', amount: 3000, amount_display: '₹3,000', count: 13, share_percent: 65.2 }],
  other_currencies: [{ currency: 'USD', amount: 20, count: 1 }],
};
type Props = BottomTabScreenProps<MainTabParamList, 'Earnings'>;
const props = {} as Props;

afterEach(() => jest.restoreAllMocks());

test('requests live earnings and maps financial year and server date exactly', async () => {
  const get = jest.spyOn(api, 'get').mockResolvedValue({ data: { ...response, period: 'financial_year' } });
  await expect(getEarningsSummary('financialYear', '2026-04-01')).resolves.toMatchObject({ label: response.label });
  expect(get).toHaveBeenCalledWith('/doctors/me/earnings/', {
    params: { period: 'financial_year', date: '2026-04-01' },
  });
  get.mockResolvedValueOnce({ data: { ...response, period: 'monthly', chart: [{ label: '1', amount: 'invalid', count: 0 }] } });
  await expect(getEarningsSummary('monthly')).rejects.toThrow(/invalid earnings/i);
});

test('renders returned values and navigates using server dates', async () => {
  const previous = { ...response, label: '17 Oct 2026', is_current: false, next_date: '2026-10-18', previous_date: '2026-10-16' };
  const get = jest.spyOn(api, 'get').mockResolvedValueOnce({ data: response }).mockResolvedValueOnce({ data: previous });
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<EarningsScreen {...props} />); });
  const texts = renderer!.root.findAllByType(Text).map((text) => text.props.children);
  expect(texts).toContain('₹4,600');
  expect(texts).toContain('₹230');
  expect(texts).toContain('Video Call');
  expect(texts).toContain('Other currencies (not included above)');
  expect(renderer!.root.findByProps({ accessibilityLabel: 'Next earnings period' }).props.disabled).toBe(true);
  await act(async () => { renderer!.root.findByProps({ accessibilityLabel: 'Previous earnings period' }).props.onPress(); });
  expect(get).toHaveBeenLastCalledWith('/doctors/me/earnings/', { params: { period: 'daily', date: '2026-10-17' } });
  expect(renderer!.root.findByProps({ accessibilityLabel: 'Next earnings period' }).props.disabled).toBe(false);
  await act(async () => { renderer!.unmount(); });
}, 60000);

test('shows access errors and allows retry without showing stale earnings', async () => {
  jest.spyOn(api, 'get').mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Pending Review' } } })
    .mockResolvedValueOnce({ data: response });
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<EarningsScreen {...props} />); });
  expect(renderer!.root.findAllByType(Text).some((text) => text.props.children === 'Pending Review')).toBe(true);
  const retry = renderer!.root.findByProps({ accessibilityLabel: 'Retry loading earnings' });
  expect(retry.type).toBe(TouchableOpacity);
  await act(async () => { retry.props.onPress(); });
  expect(renderer!.root.findAllByType(Text).some((text) => text.props.children === '₹4,600')).toBe(true);
  await act(async () => { renderer!.unmount(); });
});
