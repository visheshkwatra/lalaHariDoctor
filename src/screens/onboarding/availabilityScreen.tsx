import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, StatusBar,
  ScrollView, Switch, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../navigation/types';
import { useDoctorStore, DayAvailability } from '../../services/useDoctorStore';
import { getDoctorAvailability, saveDoctorAvailability, getApiErrorMessage } from '../../services/api';
import { MAX_AVAILABILITY_WINDOWS, validateAvailability } from '../../services/availability';
import { showToast } from '../../services/toast';

type Props = NativeStackScreenProps<RootStackParamList, 'Availability'>;

export const AvailabilityScreen: React.FC<Props> = ({ navigation }) => {
  const { setAvailability, setIsRegistered, isRegistered } = useDoctorStore();
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    getDoctorAvailability().then((week) => {
      if (active) {
        setDays(week);
        setAvailability(week);
      }
    }).catch((error) => {
      if (active) {
        setLoadError(getApiErrorMessage(error));
      }
    }).finally(() => {
      if (active) {
        setIsLoading(false);
      }
    });
    return () => { active = false; };
  }, [attempt, setAvailability]);

  const updateDay = (name: string, update: (day: DayAvailability) => DayAvailability) => {
    setDays((current) => current.map((day) => day.day === name ? update(day) : day));
  };
  const validationError = validateAvailability(days);

  const handleFinish = async () => {
    if (validationError || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveDoctorAvailability(days);
      setAvailability(saved);
      if (isRegistered) {
        showToast('Availability updated.');
        navigation.goBack();
      } else {
        setIsRegistered(true);
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      }
    } catch (error) {
      showToast(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isRegistered ? (
          <TouchableOpacity onPress={() => navigation.goBack()} disabled={isSaving}>
            <Text style={styles.stepLabel}>Back</Text>
          </TouchableOpacity>
        ) : <Text style={styles.stepLabel}>Step 3 of 3</Text>}
        <Text style={styles.title}>Your Weekly Availability</Text>
        <Text style={styles.subtitle}>
          Set one to three non-overlapping windows per open day, totaling at least six hours.
          Use 24-hour HH:MM times in 15-minute steps (India time).
          Use 00:00 to 24:00 for a full day. An end time earlier than the start means the next day.
        </Text>
        {isLoading ? <ActivityIndicator color={Colors.primary} /> : loadError ? (
          <TouchableOpacity onPress={() => setAttempt((value) => value + 1)}>
            <Text style={styles.validationText}>{loadError}{'\n'}Tap to retry</Text>
          </TouchableOpacity>
        ) : (
          <>
            {days.map((day) => (
              <View key={day.day} style={styles.dayCard}>
                <View style={styles.row}>
                  <Text style={styles.dayName}>{day.day}</Text>
                  <Switch
                    value={day.enabled}
                    onValueChange={(enabled) => updateDay(day.day, (current) => ({
                      ...current,
                      enabled,
                      windows: enabled && !current.windows.length
                        ? [{ startTime: '09:00', endTime: '17:00' }] : current.windows,
                    }))}
                    trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                    thumbColor={day.enabled ? Colors.primary : Colors.textMuted}
                  />
                </View>
                {day.enabled && day.windows.map((window, index) => (
                  <View key={index} style={styles.window}>
                    <TextInput
                      style={styles.input}
                      value={window.startTime}
                      onChangeText={(value) => updateDay(day.day, (current) => ({
                        ...current,
                        windows: current.windows.map((item, i) => i === index ? { ...item, startTime: value } : item),
                      }))}
                      placeholder="HH:MM"
                      maxLength={5}
                      accessibilityLabel={`${day.day} window ${index + 1} start time`}
                    />
                    <Text style={styles.separator}>to</Text>
                    <TextInput
                      style={styles.input}
                      value={window.endTime}
                      onChangeText={(value) => updateDay(day.day, (current) => ({
                        ...current,
                        windows: current.windows.map((item, i) => i === index ? { ...item, endTime: value } : item),
                      }))}
                      placeholder="HH:MM"
                      maxLength={5}
                      accessibilityLabel={`${day.day} window ${index + 1} end time`}
                    />
                    {day.windows.length > 1 && (
                      <TouchableOpacity
                        onPress={() => updateDay(day.day, (current) => ({
                          ...current, windows: current.windows.filter((_, i) => i !== index),
                        }))}
                        accessibilityLabel={`Remove ${day.day} window ${index + 1}`}
                      >
                        <Text style={styles.remove}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {day.enabled && day.windows.length < MAX_AVAILABILITY_WINDOWS && (
                  <TouchableOpacity onPress={() => updateDay(day.day, (current) => ({
                    ...current, windows: [...current.windows, { startTime: '', endTime: '' }],
                  }))}>
                    <Text style={styles.add}>+ Add time window</Text>
                  </TouchableOpacity>
                )}
                {day.enabled && (
                  <TouchableOpacity onPress={() => updateDay(day.day, (current) => ({
                    ...current, windows: [{ startTime: '00:00', endTime: '24:00' }],
                  }))}>
                    <Text style={styles.add}>Set 24-hour availability</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {validationError ? <Text style={styles.validationText}>{validationError}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryButton, (Boolean(validationError) || isSaving) && styles.buttonDisabled]}
              disabled={Boolean(validationError) || isSaving}
              onPress={handleFinish}
            >
              {isSaving ? <ActivityIndicator color={Colors.white} /> :
                <Text style={styles.primaryButtonText}>{isRegistered ? 'Save availability' : 'Start Consulting'}</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 40 },
  stepLabel: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 8, marginBottom: 20, lineHeight: 21 },
  dayCard: { backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  window: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, color: Colors.textPrimary, padding: 10, minWidth: 80 },
  separator: { color: Colors.textSecondary, marginHorizontal: 10 },
  remove: { color: Colors.danger, marginLeft: 12 },
  add: { color: Colors.primary, fontWeight: '600', marginTop: 12 },
  validationText: { fontSize: 13, color: Colors.danger, textAlign: 'center', marginBottom: 8 },
  primaryButton: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 12 },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
