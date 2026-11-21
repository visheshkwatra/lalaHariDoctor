import { NavigatorScreenParams } from '@react-navigation/native';
import { Appointment } from '../services/useDoctorStore';

export type MainTabParamList = {
  Schedule: undefined;
  Earnings: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  PhoneInput: undefined;
  OtpVerification: { phone: string };
  DoctorDetails: undefined;
  Availability: undefined;
  Home: NavigatorScreenParams<MainTabParamList> | undefined;
  Notifications: undefined;
  Profile: undefined;
  AppointmentDetail: { appointment: Appointment } | { appointmentId: string };
  VideoCall: { appointment: Appointment };
};
