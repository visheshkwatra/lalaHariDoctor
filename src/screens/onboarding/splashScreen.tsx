import React, { useEffect, useState } from 'react';
import { Image, Text, StyleSheet, StatusBar, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
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
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <Image
        source={require('../../../assets/branding/lalahari-doctors-wordmark.png')}
        style={styles.logo}
        resizeMode="contain"
        accessible
        accessibilityLabel="LalaHariHealth for Doctors"
      />
      {error ? (
        <TouchableOpacity style={styles.spinner} onPress={() => setAttempt((value) => value + 1)}>
          <Text style={styles.error}>{error}{'\n'}Tap to retry</Text>
        </TouchableOpacity>
      ) : <ActivityIndicator style={styles.spinner} color={Colors.primary} />}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 3,
  },
  error: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  spinner: {
    marginTop: 32,
  },
});
