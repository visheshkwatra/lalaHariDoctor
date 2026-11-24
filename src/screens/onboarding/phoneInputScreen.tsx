import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Keyboard,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../navigation/types';
import { USE_MOCK_AUTH } from '../../services/api';
import { useDoctorStore } from '../../services/useDoctorStore';
import { sendPhoneOtp, getLastFirebaseSendError, toE164 } from '../../services/firebaseAuth';
import { showToast } from '../../services/toast';

type Props = NativeStackScreenProps<RootStackParamList, 'PhoneInput'>;

export const PhoneInputScreen: React.FC<Props> = ({ navigation }) => {
  const setPhone = useDoctorStore((s) => s.setPhone);
  const [phone, setLocalPhone] = useState('');
  const [isSending, setIsSending] = useState(false);

  const digits = phone.replace(/\D/g, '');
  const isValid = digits.length === 10;

  const handleContinue = async () => {
    if (!isValid || isSending) {
      return;
    }
    Keyboard.dismiss();
    setIsSending(true);
    try {
      const e164 = toE164(digits);
      const sent = await sendPhoneOtp(e164);
      if (!sent) {
        showToast(getLastFirebaseSendError() ?? 'Could not send OTP. Please try again.');
        return;
      }
      setPhone(e164);
      navigation.navigate('OtpVerification', { phone: e164 });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrapper}>
            <Image
              source={require('../../../assets/branding/lalahari-mark.png')}
              style={styles.logo}
              resizeMode="contain"
              accessible
              accessibilityLabel="LalaHariHealth"
            />
          </View>
          <Text style={styles.title}>Doctor Sign Up</Text>
          <Text style={styles.subtitle}>
            Enter your mobile number. We will send you a one-time password to verify it.
          </Text>
          {USE_MOCK_AUTH ? (
            <Text style={styles.demoHint}>
              Demo mode: use any 10-digit mobile number. No real OTP will be sent.
            </Text>
          ) : null}

          <View style={styles.phoneRow}>
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>+91</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              placeholder="98765 43210"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={(text) => setLocalPhone(text.replace(/\D/g, ''))}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, (!isValid || isSending) && styles.buttonDisabled]}
            activeOpacity={0.85}
            disabled={!isValid || isSending}
            onPress={handleContinue}
          >
            {isSending ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Send OTP</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.legal}>
            By continuing you agree to LalaHari's Terms of Practice and Privacy Policy for
            healthcare providers.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  iconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 20,
    backgroundColor: Colors.white,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  logo: { width: '100%', height: '100%' },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 32,
    lineHeight: 21,
  },
  demoHint: {
    fontSize: 13,
    color: Colors.primary,
    textAlign: 'center',
    marginTop: -20,
    marginBottom: 24,
  },
  phoneRow: { flexDirection: 'row', marginBottom: 24 },
  countryCode: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: Colors.cardBg,
    marginRight: 10,
  },
  countryCodeText: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.textPrimary,
    backgroundColor: Colors.cardBg,
    letterSpacing: 1,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  legal: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
});
