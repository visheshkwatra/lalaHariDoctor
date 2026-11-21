import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { MainTabParamList } from './types';
import { Colors } from '../constants/colors';
import { HomeScreen } from '../screens/dashboard/homeScreen';
import { EarningsScreen } from '../screens/dashboard/earningsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, { active: string; inactive: string }> = {
  Schedule: { active: 'calendar-clock', inactive: 'calendar-clock-outline' },
  Earnings: { active: 'wallet', inactive: 'wallet-outline' },
};

const renderTabIcon =
  (name: keyof MainTabParamList) =>
  ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <MaterialIcon
      name={focused ? TAB_ICONS[name].active : TAB_ICONS[name].inactive}
      size={size}
      color={color}
    />
  );

export const MainTabs: React.FC = () => (
  <Tab.Navigator
    initialRouteName="Schedule"
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarHideOnKeyboard: true,
      tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      tabBarStyle: {
        backgroundColor: Colors.cardBg,
        borderTopColor: Colors.border,
      },
      tabBarIcon: renderTabIcon(route.name),
    })}
  >
    <Tab.Screen name="Schedule" component={HomeScreen} />
    <Tab.Screen name="Earnings" component={EarningsScreen} />
  </Tab.Navigator>
);
