import React, { useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { SplashScreen } from '../screens/onboarding/splashScreen';
import { PhoneInputScreen } from '../screens/onboarding/phoneInputScreen';
import { OtpVerificationScreen } from '../screens/onboarding/otpVerificationScreen';
import { DoctorDetailsScreen } from '../screens/onboarding/doctorDetailsScreen';
import { AvailabilityScreen } from '../screens/onboarding/availabilityScreen';
import { MainTabs } from './mainTabs';
import { NotificationsScreen } from '../screens/dashboard/notificationsScreen';
import { ProfileScreen } from '../screens/dashboard/profileScreen';
import { AppointmentDetailScreen } from '../screens/appointment/appointmentDetailScreen';
import { VideoCallScreen } from '../screens/appointment/videoCallScreen';
import { setSessionExpiredHandler } from '../services/api';
import { showToast } from '../services/toast';
import { useDoctorStore } from '../services/useDoctorStore';
import { startPushNotifications, stopPushNotifications } from '../services/pushNotifications';
import { getInitialNotification, getMessaging, onNotificationOpenedApp } from '@react-native-firebase/messaging';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const authenticated = useDoctorStore((state) => Boolean(state.authToken));
  const registered = useDoctorStore((state) => state.isRegistered);
  const pendingAppointment = useRef<string | null>(null);
  const openPendingAppointment = () => {
    if (!pendingAppointment.current || !navigationRef.isReady() ||
        !useDoctorStore.getState().authToken || !useDoctorStore.getState().isRegistered ||
        ['Splash', 'PhoneInput', 'OtpVerification'].includes(navigationRef.getCurrentRoute()?.name ?? '')) { return; }
    const appointmentId = pendingAppointment.current;
    pendingAppointment.current = null;
    navigationRef.navigate('AppointmentDetail', { appointmentId });
  };
  useEffect(() => {
    if (!authenticated) { return; }
    const messaging = getMessaging();
    const receive = (message: { data?: { [key: string]: string | object } }) => {
      const value = message.data?.appointment_id;
      if (typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))) {
        pendingAppointment.current = value;
        openPendingAppointment();
      }
    };
    const remove = onNotificationOpenedApp(messaging, receive);
    getInitialNotification(messaging).then((message) => { if (message) { receive(message); } })
      .catch((error) => showToast(`Could not open notification: ${String(error.message ?? error)}`));
    return remove;
  }, [authenticated]);
  useEffect(() => { openPendingAppointment(); }, [authenticated, registered]);
  useEffect(() => {
    if (!authenticated) { return; }
    startPushNotifications();
    return () => { stopPushNotifications().catch((error) => showToast(String(error))); };
  }, [authenticated]);
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (!navigationRef.isReady() || navigationRef.getCurrentRoute()?.name === 'Splash') {
        return;
      }
      navigationRef.resetRoot({ index: 0, routes: [{ name: 'PhoneInput' }] });
      showToast('Your session has ended. Please sign in again.');
    });
    return () => setSessionExpiredHandler(null);
  }, []);
  return (
    <NavigationContainer ref={navigationRef} onReady={openPendingAppointment} onStateChange={openPendingAppointment}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        {/* Onboarding & auth */}
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="PhoneInput" component={PhoneInputScreen} />
        <Stack.Screen name="OtpVerification" component={OtpVerificationScreen} />
        <Stack.Screen name="DoctorDetails" component={DoctorDetailsScreen} />
        <Stack.Screen name="Availability" component={AvailabilityScreen} />

        {/* Main app: bottom tabs (Schedule + Earnings) */}
        <Stack.Screen name="Home" component={MainTabs} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
        <Stack.Screen name="VideoCall" component={VideoCallScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
