import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors } from '../../constants/colors';
import { MainTabParamList } from '../../navigation/types';
import { Appointment } from '../../services/useDoctorStore';
import { getApiErrorMessage, getEarningsSummary } from '../../services/api';
import { EarningsPeriod } from '../../services/earnings';
import { LiveEarnings } from '../../services/liveEarnings';

type Props = BottomTabScreenProps<MainTabParamList, 'Earnings'>;

const PERIODS: { key: EarningsPeriod; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'financialYear', label: 'Financial Year' },
];

const MODE_META: Record<Appointment['mode'], { icon: string }> = {
  video: { icon: 'video-outline' },
  audio: { icon: 'phone-outline' },
  chat: { icon: 'chat-outline' },
};

const CHART_HEIGHT = 140;

const chartCaption: Record<EarningsPeriod, string> = {
  daily: 'Earnings by time of day',
  monthly: 'Earnings by day',
  financialYear: 'Earnings by month',
};

const currentLabel: Record<EarningsPeriod, string> = {
  daily: 'Today',
  monthly: 'This month',
  financialYear: 'This financial year',
};

export const EarningsScreen: React.FC<Props> = () => {
  const [period, setPeriod] = useState<EarningsPeriod>('daily');
  const [anchor, setAnchor] = useState<string | undefined>();
  const [summary, setSummary] = useState<LiveEarnings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  const load = useCallback(async (p: EarningsPeriod, a?: string) => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getEarningsSummary(p, a);
      if (id === requestId.current) {
        setSummary(result);
      }
    } catch (failure) {
      if (id === requestId.current) {
        setSummary(null);
        setError(getApiErrorMessage(failure));
      }
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load(period, anchor);
    return () => { requestId.current += 1; };
  }, [period, anchor, load]);

  const selectPeriod = (p: EarningsPeriod) => {
    if (p === period && anchor === undefined) { return; }
    requestId.current += 1;
    setSummary(null);
    setError(null);
    setPeriod(p);
    setAnchor(undefined);
  };

  const maxBucketEarnings = useMemo(
    () => Math.max(1, ...(summary?.chart.map((b) => b.amount) ?? [0])),
    [summary],
  );

  const bucketCount = summary?.chart.length ?? 0;
  // Monthly view has up to 31 bars; label only every 5th day to stay readable.
  const showBucketLabel = (index: number) =>
    bucketCount <= 12 || index === 0 || (index + 1) % 5 === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.cardBg} />

      <View style={styles.headerBar}>
        <Text style={styles.title}>Earnings</Text>
        <Text style={styles.subtitle}>Consultations completed and money earned</Text>

        <View style={styles.segment}>
          {PERIODS.map((p) => {
            const active = p.key === period;
            return (
              <TouchableOpacity
                key={p.key}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                activeOpacity={0.8}
                onPress={() => selectPeriod(p.key)}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.periodBar}>
          <TouchableOpacity
            style={styles.periodArrow}
            disabled={!summary || isLoading}
            accessibilityLabel="Previous earnings period"
            onPress={() => { if (summary) { setSummary(null); setAnchor(summary.previous_date); } }}
          >
            <Icon name="chevron-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.periodCenter}>
            <Text style={styles.periodLabel}>{summary?.label ?? ' '}</Text>
            {summary?.is_current && <Text style={styles.periodHint}>{currentLabel[period]}</Text>}
          </View>
          <TouchableOpacity
            style={styles.periodArrow}
            disabled={!summary?.next_date || isLoading}
            accessibilityLabel="Next earnings period"
            onPress={() => { if (summary?.next_date) { setSummary(null); setAnchor(summary.next_date); } }}
          >
            <Icon
              name="chevron-forward"
              size={20}
              color={!summary?.next_date || isLoading ? Colors.border : Colors.textPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && summary !== null}
            onRefresh={() => load(period, anchor)}
            tintColor={Colors.primary}
          />
        }
      >
        {error ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity onPress={() => load(period, anchor)} accessibilityLabel="Retry loading earnings">
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !summary ? (
          <ActivityIndicator style={styles.loader} color={Colors.primary} />
        ) : (
          <>
            {/* Totals */}
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>Total earned</Text>
              <Text style={styles.heroValue}>{summary.total_earned_display}</Text>
              <View style={styles.heroDivider} />
              <View style={styles.heroRow}>
                <View style={styles.heroStat}>
                  <MaterialIcon name="stethoscope" size={18} color={Colors.white} />
                  <View style={styles.heroStatText}>
                    <Text style={styles.heroStatValue}>{summary.consultations_count}</Text>
                    <Text style={styles.heroStatLabel}>Consultations done</Text>
                  </View>
                </View>
                <View style={styles.heroStat}>
                  <MaterialIcon name="cash-multiple" size={18} color={Colors.white} />
                  <View style={styles.heroStatText}>
                    <Text style={styles.heroStatValue}>
                      {summary.average_display}
                    </Text>
                    <Text style={styles.heroStatLabel}>Avg. per consultation</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Chart */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{chartCaption[period]}</Text>
              {summary.consultations_count === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcon name="chart-bar" size={36} color={Colors.textMuted} />
                  <Text style={styles.emptyText}>No completed consultations in this period</Text>
                </View>
              ) : (
                <View style={styles.chart}>
                  {summary.chart.map((bucket, index) => (
                    <View key={`${bucket.label}-${index}`} style={styles.barColumn}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.bar,
                            bucketCount > 12 && styles.barThin,
                            { height: (bucket.amount / maxBucketEarnings) * CHART_HEIGHT },
                          ]}
                        />
                      </View>
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {showBucketLabel(index) ? bucket.label : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Mode breakdown */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>By consultation type</Text>
              {summary.by_mode.map((data) => {
                const mode = data.mode;
                return (
                  <View key={mode} style={styles.modeRow}>
                    <View style={styles.modeIcon}>
                      <MaterialIcon name={MODE_META[mode].icon} size={18} color={Colors.primaryDark} />
                    </View>
                    <View style={styles.modeBody}>
                      <View style={styles.modeHeader}>
                        <Text style={styles.modeLabel}>{data.label}</Text>
                        <Text style={styles.modeAmount}>{data.amount_display}</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${data.share_percent}%` }]} />
                      </View>
                      <Text style={styles.modeCount}>
                        {data.count} consultation{data.count === 1 ? '' : 's'} · {data.share_percent}%
                      </Text>
                    </View>
                    {summary.other_currencies.length > 0 && (
                      <View style={styles.card}>
                        <Text style={styles.cardTitle}>Other currencies (not included above)</Text>
                        {summary.other_currencies.map((item, index) => (
                          <Text key={`${item.currency}-${index}`} style={styles.modeLabel}>
                            {item.currency} {item.amount} · {item.count} consultation{item.count === 1 ? '' : 's'}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: Colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 4,
    marginTop: 14,
  },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segmentItemActive: { backgroundColor: Colors.primary },
  segmentText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  segmentTextActive: { color: Colors.white },
  periodBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  periodArrow: { padding: 8 },
  periodCenter: { flex: 1, alignItems: 'center' },
  periodLabel: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  periodHint: { fontSize: 11, color: Colors.primary, fontWeight: '700', marginTop: 1 },
  content: { padding: 16, paddingBottom: 32 },
  loader: { marginTop: 60 },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  heroLabel: { fontSize: 13, color: Colors.primaryLight, fontWeight: '600' },
  heroValue: { fontSize: 34, fontWeight: '800', color: Colors.white, marginTop: 4 },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 14 },
  heroRow: { flexDirection: 'row' },
  heroStat: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  heroStatText: { marginLeft: 8, flexShrink: 1 },
  heroStatValue: { fontSize: 18, fontWeight: '800', color: Colors.white },
  heroStatLabel: { fontSize: 11, color: Colors.primaryLight, marginTop: 1 },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end' },
  barColumn: { flex: 1, alignItems: 'center' },
  barTrack: { height: CHART_HEIGHT, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  bar: { width: '60%', backgroundColor: Colors.primary, borderRadius: 4 },
  barThin: { width: '70%', borderRadius: 2 },
  barLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 6 },
  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { marginTop: 8, fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  retryText: { marginTop: 12, color: Colors.primary, fontWeight: '700' },
  modeRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  modeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  modeBody: { flex: 1 },
  modeHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  modeLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  modeAmount: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.background,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: Colors.accentGold },
  modeCount: { fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
});
