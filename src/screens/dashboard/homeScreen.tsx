import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors } from '../../constants/colors';
import { MainTabParamList, RootStackParamList } from '../../navigation/types';
import { useDoctorStore, Appointment } from '../../services/useDoctorStore';
import { getAppointmentsForDate, getDoctorAvailability, getApiErrorMessage, getUnreadNotificationCount, indiaDate, USE_MOCK_APPOINTMENTS } from '../../services/api';
import { showToast } from '../../services/toast';
import { appointmentDayRange } from '../../services/appointmentTime';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Schedule'>,
  NativeStackScreenProps<RootStackParamList>
>;

// Timeline window shown in the day calendar.
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const HOUR_HEIGHT = 72;
// Join activates 5 minutes before the appointment starts.
const JOIN_EARLY_MINUTES = 5;

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const formatTime12 = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h % 24 < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, '0')} ${suffix}`;
};

const toISODate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const MODE_ICONS: Record<Appointment['mode'], string> = {
  video: 'video-outline',
  audio: 'phone-outline',
  chat: 'chat-outline',
};

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const {
    profile,
    appointments,
    setAppointments,
    unreadCount,
    setUnreadCount,
    availability,
    setAvailability,
  } = useDoctorStore();

  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(`${indiaDate(new Date())}T12:00:00`));
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const loadSequence = useRef(0);
  const loadedDate = useRef<string | null>(null);

  const isToday = toISODate(selectedDate) === indiaDate(now);
  useFocusEffect(useCallback(() => {
    let active = true;
    getUnreadNotificationCount().then((count) => {
      if (active) { setUnreadCount(count); }
    }).catch((failure) => {
      if (active) { showToast(getApiErrorMessage(failure)); }
    });
    return () => { active = false; };
  }, [setUnreadCount]));

  useEffect(() => {
    if (!USE_MOCK_APPOINTMENTS) {
      return;
    }
    let active = true;
    const previous = useDoctorStore.getState().availability;
    getDoctorAvailability().then((days) => {
      if (active && useDoctorStore.getState().availability === previous) {
        setAvailability(days);
      }
    }).catch((error) => {
      if (active) {
        showToast(getApiErrorMessage(error));
      }
    });
    return () => { active = false; };
  }, [setAvailability]);

  // Re-render every 30s so the "now" line and Join buttons stay accurate.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  const loadAppointments = useCallback(
    async (date: Date) => {
      const request = ++loadSequence.current;
      const dateKey = toISODate(date);
      if (loadedDate.current !== dateKey) {
        loadedDate.current = dateKey;
        setAppointments([]);
      }
      setIsLoading(true);
      try {
        const list = await getAppointmentsForDate(dateKey, availability);
        if (request === loadSequence.current) {
          setAppointments(list);
        }
      } catch (failure) {
        if (request === loadSequence.current) {
          setAppointments([]);
          showToast(getApiErrorMessage(failure));
        }
      } finally {
        if (request === loadSequence.current) {
          setIsLoading(false);
        }
      }
    },
    [setAppointments, availability],
  );

  useEffect(() => {
    loadAppointments(selectedDate);
    if (!USE_MOCK_APPOINTMENTS) {
      const timer = setInterval(() => loadAppointments(selectedDate), 30 * 1000);
      return () => { clearInterval(timer); loadSequence.current += 1; };
    }
  }, [selectedDate, loadAppointments]);

  const shiftDay = (delta: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    setSelectedDate(next);
  };

  const dateLabel = useMemo(() => {
    if (isToday) {
      return 'Today';
    }
    return selectedDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }, [selectedDate, isToday]);

  const indiaClock = new Date(now.getTime() + 330 * 60000);
  const nowMinutes = indiaClock.getUTCHours() * 60 + indiaClock.getUTCMinutes();
  const startHour = DAY_START_HOUR;
  const endHour = DAY_END_HOUR;
  const nowOffset = ((nowMinutes - startHour * 60) / 60) * HOUR_HEIGHT;

  const joinStateFor = (apt: Appointment): 'join' | 'upcoming' | 'ended' => {
    if (apt.source === 'live') {
      if (apt.status !== 'scheduled') { return 'ended'; }
      if (apt.mode === 'video' && apt.canJoin) {
        return 'join';
      }
      return 'upcoming';
    }
    if (!isToday) {
      return toISODate(selectedDate) < toISODate(new Date()) ? 'ended' : 'upcoming';
    }
    const start = toMinutes(apt.startTime);
    const end = toMinutes(apt.endTime);
    if (nowMinutes >= start - JOIN_EARLY_MINUTES && nowMinutes <= end) {
      return 'join';
    }
    return nowMinutes < start - JOIN_EARLY_MINUTES ? 'upcoming' : 'ended';
  };

  const hourMarks = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.cardBg} />

      {/* Header: welcome + profile + notifications */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.profileSection}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Profile')}
        >
          <View style={styles.avatarWrapper}>
            {profile.photoUri ? (
              <Image source={{ uri: profile.photoUri }} style={styles.avatarImage} />
            ) : (
              <MaterialIcon name="account-circle" size={42} color={Colors.primary} />
            )}
          </View>
          <View>
            <Text style={styles.greetingText}>Welcome back 👋</Text>
            <Text style={styles.doctorName}>
              {profile.fullName || 'Doctor'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconButton}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Icon name="notifications-outline" size={24} color={Colors.textPrimary} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Date navigation */}
      <View style={styles.dateBar}>
        <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDay(-1)}>
          <Icon name="chevron-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
          <Text style={styles.dateSubLabel}>
            {selectedDate.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>
        <TouchableOpacity style={styles.dateArrow} onPress={() => shiftDay(1)}>
          <Icon name="chevron-forward" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Day calendar timeline */}
      <ScrollView
        style={styles.timelineScroll}
        contentContainerStyle={styles.timelineContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => loadAppointments(selectedDate)}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.timelineRow}>
          {/* Hour gutter */}
          <View style={styles.hourGutter}>
            {hourMarks.map((h) => (
              <View key={h} style={{ height: HOUR_HEIGHT }}>
                <Text style={styles.hourText}>{formatTime12(`${String(h).padStart(2, '0')}:00`)}</Text>
              </View>
            ))}
          </View>

          {/* Timeline canvas */}
          <View
            style={[
              styles.timelineCanvas,
              { height: hourMarks.length * HOUR_HEIGHT },
            ]}
          >
            {hourMarks.map((h) => (
              <View key={h} style={[styles.hourLine, { top: (h - startHour) * HOUR_HEIGHT }]} />
            ))}

            {/* Current time indicator */}
            {isToday && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 && (
              <View style={[styles.nowLine, { top: nowOffset }]}>
                <View style={styles.nowDot} />
              </View>
            )}

            {isLoading && appointments.length === 0 ? (
              <ActivityIndicator style={styles.loader} color={Colors.primary} />
            ) : null}

            {!isLoading && appointments.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialIcon name="calendar-blank-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No appointments on this day</Text>
              </View>
            )}

            {appointments.map((apt) => {
              const range = appointmentDayRange(apt, toISODate(selectedDate));
              if (!range) { return null; }
              const top = ((range.start - startHour * 60) / 60) * HOUR_HEIGHT;
              const height = Math.max(
                ((range.end - range.start) / 60) * HOUR_HEIGHT,
                52,
              );
              const joinState = joinStateFor(apt);
              return (
                <TouchableOpacity
                  key={apt.id}
                  activeOpacity={0.85}
                  style={[
                    styles.appointmentCard,
                    { top, height },
                    joinState === 'join' && styles.appointmentCardLive,
                  ]}
                  onPress={() => navigation.navigate('AppointmentDetail', { appointment: apt })}
                >
                  <View style={styles.aptHeader}>
                    <Text style={styles.aptPatient} numberOfLines={1}>
                      {apt.patient.name}
                    </Text>
                    <MaterialIcon
                      name={MODE_ICONS[apt.mode]}
                      size={14}
                      color={joinState === 'join' ? Colors.white : Colors.primaryDark}
                    />
                  </View>
                  <Text
                    style={[
                      styles.aptTime,
                      joinState === 'join' && styles.aptTimeLive,
                    ]}
                  >
                    {formatTime12(apt.startTime)} – {formatTime12(apt.endTime)}
                    {apt.endsAt && indiaDate(apt.endsAt) !== apt.date ? ` (ends ${indiaDate(apt.endsAt)})` : ''}
                  </Text>

                  {joinState === 'join' && apt.source === 'live' && apt.mode === 'video' ? (
                    <TouchableOpacity
                      style={styles.joinButton}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('VideoCall', { appointment: apt })}
                    >
                      <MaterialIcon name="video" size={14} color={Colors.primary} />
                      <Text style={styles.joinButtonText}>Join</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.aptHint}>
                      {apt.source !== 'live' ? 'Demo appointment' : apt.mode !== 'video' ?
                        'Video unavailable' : joinState === 'upcoming' ? 'Join unavailable' : 'Completed'}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  profileSection: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarWrapper: { marginRight: 12 },
  avatarImage: { width: 42, height: 42, borderRadius: 21 },
  greetingText: { fontSize: 12, color: Colors.textSecondary },
  doctorName: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: '800' },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: Colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dateArrow: { padding: 8 },
  dateCenter: { flex: 1, alignItems: 'center' },
  dateLabel: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  dateSubLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  timelineScroll: { flex: 1 },
  timelineContent: { paddingBottom: 32 },
  timelineRow: { flexDirection: 'row' },
  hourGutter: { width: 64, alignItems: 'flex-end', paddingRight: 8 },
  hourText: { fontSize: 11, color: Colors.textMuted, marginTop: -7, height: 14 },
  timelineCanvas: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    marginRight: 12,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    opacity: 0.6,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.danger,
  },
  nowDot: {
    position: 'absolute',
    left: -4,
    top: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.danger,
  },
  loader: { marginTop: 60, alignSelf: 'center', width: '100%' },
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyText: { marginTop: 10, fontSize: 14, color: Colors.textMuted },
  appointmentCard: {
    position: 'absolute',
    left: 8,
    right: 4,
    backgroundColor: Colors.primaryLight,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    borderRadius: 8,
    padding: 8,
    overflow: 'hidden',
  },
  appointmentCardLive: {
    backgroundColor: Colors.primary,
    borderLeftColor: Colors.primaryDark,
  },
  aptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aptPatient: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  aptTime: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  aptTimeLive: { color: Colors.primaryLight },
  aptHint: { fontSize: 10, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.white,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  joinButtonText: { fontSize: 12, fontWeight: '800', color: Colors.primary, marginLeft: 4 },
});
