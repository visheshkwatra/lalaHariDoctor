import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../navigation/types';
import { USE_MOCK_AUTH } from '../../services/api';
import {
  sendPhoneOtp,
  confirmPhoneOtp,
  getLastFirebaseSendError,
  MOCK_OTP,
} from '../../services/firebaseAuth';
import { loginDoctorWithFirebasePhone, getApiErrorMessage } from '../../services/api';
import { showToast } from '../../services/toast';

const OTP_LENGTH = 6;

type Props = NativeStackScreenProps<RootStackParamList, 'OtpVerification'>;

export const OtpVerificationScreen: React.FC<Props> = ({ navigation, route }) => {
  const phone = route.params.phone;

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const inputsRef = useRef<Array<TextInput | null>>([]);
  const verifiedTokenRef = useRef<string | null>(null);

  const handleChange = (value: string, index: number) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setError(null);
    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
    if (digit && index === OTP_LENGTH - 1 && next.every((d) => d)) {
      Keyboard.dismiss();
      verify(next.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const verify = async (code: string) => {
    if (isVerifying) {
      return;
    }
    setIsVerifying(true);
    setError(null);
    try {
      // 1. Verify OTP with Firebase and get the ID token.
      const idToken = verifiedTokenRef.current ?? await confirmPhoneOtp(code);
      if (!idToken) {
        setError(getLastFirebaseSendError() ?? 'OTP verification failed.');
        return;
      }
      verifiedTokenRef.current = idToken;

      // 2. Exchange the Firebase token with the backend for app tokens.
      console.log('[OTP] Firebase verified, exchanging ID token with backend.');
      const result = await loginDoctorWithFirebasePhone(idToken);
      verifiedTokenRef.current = null;
      const name = result.nextStep === 'done' ? 'Home' :
        result.nextStep === 'availability' ? 'Availability' : 'DoctorDetails';
      navigation.reset({ index: 0, routes: [{ name }] });
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyPress = () => {
    const code = otp.join('');
    if (code.length !== OTP_LENGTH) {
      setError('Please enter the 6-digit OTP.');
      return;
    }
    Keyboard.dismiss();
    verify(code);
  };

  const handleResend = async () => {
    if (isResending) {
      return;
    }
    setIsResending(true);
    try {
      const sent = await sendPhoneOtp(phone);
      if (sent) {
        verifiedTokenRef.current = null;
        setOtp(Array(OTP_LENGTH).fill(''));
        setError(null);
        inputsRef.current[0]?.focus();
        showToast('OTP resent.');
      } else {
        setError(getLastFirebaseSendError() ?? 'Could not resend OTP.');
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Icon name="arrow-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconWrapper}>
          <Icon name="shield-checkmark-outline" size={40} color={Colors.primary} />
        </View>
        <Text style={styles.title}>Verify Your Number</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to{' '}
          <Text style={styles.phoneText}>{phone}</Text>
        </Text>
        {USE_MOCK_AUTH ? <Text style={styles.demoHint}>Demo OTP: {MOCK_OTP}</Text> : null}

        <View style={styles.otpRow}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                inputsRef.current[index] = ref;
              }}
              style={[styles.otpBox, error ? styles.otpBoxError : null]}
              keyboardType="number-pad"
              maxLength={1}
              value={digit}
              onChangeText={(value) => handleChange(value, index)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
              autoFocus={index === 0}
            />
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, isVerifying && styles.buttonDisabled]}
          activeOpacity={0.85}
          disabled={isVerifying}
          onPress={handleVerifyPress}
        >
          {isVerifying ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>Verify & Continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendRow}
          onPress={handleResend}
          disabled={isResending}
        >
          {isResending ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.resendText}>
              Didn't receive the code? <Text style={styles.resendLink}>Resend OTP</Text>
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  backButton: { padding: 16, alignSelf: 'flex-start' },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 28,
    lineHeight: 21,
  },
  demoHint: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: -18,
    marginBottom: 20,
  },
  phoneText: { color: Colors.textPrimary, fontWeight: '700' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.cardBg,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  otpBoxError: { borderColor: Colors.danger },
  errorText: { color: Colors.danger, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  resendRow: { alignItems: 'center', marginTop: 20 },
  resendText: { fontSize: 13, color: Colors.textSecondary },
  resendLink: { color: Colors.primary, fontWeight: '700' },
});
