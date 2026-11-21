import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors } from '../../constants/colors';
import { getApiErrorMessage, restoreDoctorSession } from '../../services/api';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export const SplashScreen: React.FC<Props> = ({ navigation }) => {
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    restoreDoctorSession().then((step) => {
      if (!active) {
        return;
      }
      const name = step === 'done' ? 'Home' : step === 'availability' ? 'Availability' :
        step === 'profile' ? 'DoctorDetails' : 'PhoneInput';
      navigation.replace(name);
    }).catch((failure) => {
      if (active) {
        setError(getApiErrorMessage(failure));
      }
    });
    return () => { active = false; };
  }, [attempt, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primaryDark} />
      <View style={styles.logoWrapper}>
        <MaterialIcon name="stethoscope" size={64} color={Colors.white} />
      </View>
      <Text style={styles.title}>LalaHari for Doctors</Text>
      <Text style={styles.subtitle}>Consult. Care. Grow.</Text>
      {error ? (
        <TouchableOpacity style={styles.spinner} onPress={() => setAttempt((value) => value + 1)}>
          <Text style={styles.subtitle}>{error}{'\n'}Tap to retry</Text>
        </TouchableOpacity>
      ) : <ActivityIndicator style={styles.spinner} color={Colors.white} />}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.white,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.primaryLight,
    marginTop: 8,
  },
  spinner: {
    marginTop: 32,
  },
});
