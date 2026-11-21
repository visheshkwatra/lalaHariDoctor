import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../navigation/types';
import { getAppointmentDetails, getAppointmentDetailsById, getApiErrorMessage, indiaDate } from '../../services/api';
import { Appointment } from '../../services/useDoctorStore';

type Props = NativeStackScreenProps<RootStackParamList, 'AppointmentDetail'>;

const formatTime12 = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, '0')} ${suffix}`;
};

const MODE_LABELS: Record<string, string> = {
  video: 'Video Consultation',
  audio: 'Audio Consultation',
  chat: 'Chat Consultation',
};

export const AppointmentDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const appointmentId = 'appointmentId' in route.params ? route.params.appointmentId : undefined;
  const [loaded, setLoaded] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!appointmentId) { return; }
    let active = true;
    setError(null);
    getAppointmentDetailsById(appointmentId).then((value) => {
      if (active) { setLoaded(value); }
    }).catch((failure) => {
      if (active) { setError(getApiErrorMessage(failure)); }
    });
    return () => { active = false; };
  }, [appointmentId, attempt]);
  const initial = 'appointment' in route.params ? route.params.appointment : loaded;
  if (!initial) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.joinHint}>Back</Text></TouchableOpacity>
        <Text style={styles.joinHint}>{error || 'Loading appointment...'}</Text>
        {error ? <TouchableOpacity onPress={() => setAttempt((n) => n + 1)}><Text style={styles.joinHint}>Retry</Text></TouchableOpacity> : null}
      </SafeAreaView>
    );
  }
  return <AppointmentDetails navigation={navigation} initial={initial} />;
};

const AppointmentDetails: React.FC<{ navigation: Props['navigation']; initial: Appointment }> = ({ navigation, initial }) => {
  const [appointment, setAppointment] = useState(initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(appointment.source === 'live');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => getAppointmentDetails(initial).then((value) => {
      if (active) { setAppointment(value); setLoadError(null); }
    }).catch((error) => {
      if (active) { setLoadError(getApiErrorMessage(error)); }
    }).finally(() => {
      if (active) { setLoadingDetails(false); }
    });
    load();
    const timer = setInterval(load, 30 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [initial, reload]);

  const canJoin = appointment.source === 'live' && appointment.mode === 'video' &&
    appointment.status === 'scheduled' && appointment.canJoin === true && !loadingDetails && !loadError;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.cardBg} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Appointment</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loadError ? <Text style={styles.joinHint}>{loadError}</Text> : null}
        {loadError ? <TouchableOpacity onPress={() => { setLoadingDetails(true); setLoadError(null); setReload((n) => n + 1); }}><Text style={styles.joinHint}>Retry</Text></TouchableOpacity> : null}
        {loadingDetails ? <Text style={styles.joinHint}>Loading patient details...</Text> : null}
        {/* Schedule card */}
        <View style={styles.card}>
          <View style={styles.scheduleRow}>
            <MaterialIcon name="calendar-clock" size={22} color={Colors.primary} />
            <View style={styles.scheduleBody}>
              <Text style={styles.scheduleDate}>
                {new Date(`${appointment.date}T00:00:00`).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <Text style={styles.scheduleTime}>
                {formatTime12(appointment.startTime)} – {formatTime12(appointment.endTime)}
                {appointment.endsAt && indiaDate(appointment.endsAt) !== appointment.date ? ` (ends ${indiaDate(appointment.endsAt)})` : ''}
              </Text>
            </View>
            <View style={styles.modeChip}>
              <Text style={styles.modeChipText}>{MODE_LABELS[appointment.mode]}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Booking ID: {appointment.appointmentNumber}</Text>
            <Text style={styles.metaText}>Fee: {appointment.consultationFee}</Text>
          </View>
        </View>

        {/* Patient intake details */}
        {!loadingDetails && !loadError ? <>
        <Text style={styles.sectionTitle}>Patient Details</Text>
        <View style={styles.card}>
          <DetailRow icon="account-outline" label="Name" value={appointment.patient.name} />
          <DetailRow
            icon="calendar-account-outline"
            label="Age / Gender"
            value={`${appointment.patient.age == null ? 'Not provided' : `${appointment.patient.age} yrs`} / ${appointment.patient.gender || 'Not provided'}`}
          />
          <DetailRow icon="phone-outline" label="Phone" value={appointment.patient.phone} />
          <DetailRow
            icon="clipboard-text-outline"
            label="Symptoms / Reason"
            value={appointment.patient.symptoms}
          />
          {appointment.patient.notes ? (
            <DetailRow icon="note-text-outline" label="Notes" value={appointment.patient.notes} />
          ) : null}
        </View>
        </> : null}

        {/* Join footer */}
        <TouchableOpacity
          style={[styles.joinButton, !canJoin && styles.joinButtonDisabled]}
          activeOpacity={0.85}
          disabled={!canJoin}
          onPress={() => navigation.navigate('VideoCall', { appointment })}
        >
          <MaterialIcon name="video" size={22} color={Colors.white} />
          <Text style={styles.joinButtonText}>
            {canJoin ? 'Join Video Call' : appointment.source !== 'live' ? 'Demo: video unavailable' :
              appointment.mode !== 'video' ? 'Video unavailable' : 'Join unavailable'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{ icon: string; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <View style={styles.detailRow}>
    <MaterialIcon name={icon} size={20} color={Colors.primary} style={styles.detailIcon} />
    <View style={styles.detailBody}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { padding: 6 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSpacer: { width: 36 },
  content: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 20,
  },
  scheduleRow: { flexDirection: 'row', alignItems: 'center' },
  scheduleBody: { flex: 1, marginLeft: 12 },
  scheduleDate: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  scheduleTime: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  modeChip: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modeChipText: { fontSize: 11, fontWeight: '700', color: Colors.primaryDark },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  metaText: { fontSize: 12, color: Colors.textMuted },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  detailRow: { flexDirection: 'row', marginBottom: 14 },
  detailIcon: { marginTop: 2 },
  detailBody: { flex: 1, marginLeft: 12 },
  detailLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase' },
  detailValue: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginTop: 2 },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
  },
  joinButtonDisabled: { backgroundColor: Colors.textMuted },
  joinButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700', marginLeft: 8 },
  joinHint: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 10,
  },
});
