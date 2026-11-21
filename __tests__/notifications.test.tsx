import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, getNotifications, getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from '../src/services/api';
import { useDoctorStore } from '../src/services/useDoctorStore';
import { NotificationsScreen } from '../src/screens/dashboard/notificationsScreen';
import { RootStackParamList } from '../src/navigation/types';

const item = {
  id: 91, kind: 'appointment_assigned', title: 'New appointment', body: 'Appointment booked',
  appointment_id: 12345, consultation_id: 42, is_read: false,
  created_at: '2026-10-17T15:02:00+05:30',
};
afterEach(() => { jest.restoreAllMocks(); useDoctorStore.getState().logout(); });

test('loads paginated notifications, reads one, reads all and retrieves the unread count', async () => {
  const get = jest.spyOn(api, 'get').mockResolvedValueOnce({ data: { results: [item], next: 'next' } })
    .mockResolvedValueOnce({ data: { unread_count: 7 } });
  const post = jest.spyOn(api, 'post').mockResolvedValueOnce({ data: { ...item, is_read: true } })
    .mockResolvedValueOnce({ data: { marked_read: 2 } });
  await expect(getNotifications(2, true)).resolves.toMatchObject({ hasNext: true, results: [{ id: '91', appointmentId: 12345, read: false }] });
  expect(get).toHaveBeenNthCalledWith(1, '/notifications/', { params: { page: 2, unread: true } });
  await expect(getUnreadNotificationCount()).resolves.toBe(7);
  await expect(markNotificationRead('91')).resolves.toMatchObject({ read: true });
  expect(post).toHaveBeenNthCalledWith(1, '/notifications/91/read/');
  await expect(markAllNotificationsRead()).resolves.toBe(2);
  expect(post).toHaveBeenNthCalledWith(2, '/notifications/read-all/');
});

test('rejects invalid notification responses rather than reporting an empty inbox', async () => {
  jest.spyOn(api, 'get').mockResolvedValueOnce({ data: { results: [{ ...item, id: null }], next: null } })
    .mockResolvedValueOnce({ data: { unread_count: -1 } });
  await expect(getNotifications()).rejects.toThrow(/invalid notification/i);
  await expect(getUnreadNotificationCount()).rejects.toThrow(/invalid unread/i);
});

test('marks a notification on the server before opening its appointment', async () => {
  jest.spyOn(api, 'get').mockImplementation(async (url) => url === '/notifications/' ?
    { data: { results: [item], next: null } } : { data: { unread_count: 1 } });
  const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { ...item, is_read: true } });
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const props = { navigation } as unknown as NativeStackScreenProps<RootStackParamList, 'Notifications'>;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<NotificationsScreen {...props} />); });
  const title = renderer!.root.findAllByType(Text).find((text) => text.props.children === 'New appointment');
  expect(title).toBeDefined();
  const button = renderer!.root.findByProps({ accessibilityLabel: 'Notification: New appointment' });
  await act(async () => { button.props.onPress(); });
  expect(post).toHaveBeenCalledWith('/notifications/91/read/');
  expect(navigation.navigate).toHaveBeenCalledWith('AppointmentDetail', { appointmentId: '12345' });
  expect(useDoctorStore.getState().unreadCount).toBe(0);
  await act(async () => { renderer!.unmount(); });
}, 60000);

test('loads further pages and refreshes the list after marking all read', async () => {
  const second = { ...item, id: 92, title: 'Reminder', kind: 'appointment_reminder', appointment_id: null };
  const get = jest.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url === '/notifications/unread-count/') { return { data: { unread_count: 2 } }; }
    if ((config?.params as { page?: number } | undefined)?.page === 2) { return { data: { results: [second], next: null } }; }
    return { data: { results: [item], next: 'next' } };
  });
  const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { marked_read: 2 } });
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const props = { navigation } as unknown as NativeStackScreenProps<RootStackParamList, 'Notifications'>;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<NotificationsScreen {...props} />); });
  await act(async () => { renderer!.root.findByProps({ accessibilityLabel: 'Load more notifications' }).props.onPress(); });
  expect(get).toHaveBeenCalledWith('/notifications/', { params: { page: 2 } });
  expect(useDoctorStore.getState().notifications.map((value) => value.id)).toEqual(['91', '92']);
  await act(async () => { renderer!.root.findByProps({ accessibilityLabel: 'Mark all notifications read' }).props.onPress(); });
  expect(post).toHaveBeenCalledWith('/notifications/read-all/');
  expect(get).toHaveBeenLastCalledWith('/notifications/unread-count/');
  await act(async () => { renderer!.unmount(); });
}, 60000);
